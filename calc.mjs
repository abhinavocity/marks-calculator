import { CONFIG } from "../lib/config.mjs";
import { parseQuestions, parseKey, scoreSheet } from "../lib/parse.mjs";
import { binOf, computeRanks } from "../lib/rank.mjs";
import { stores, hashId, saveCandidate, loadAllHists } from "../lib/store.mjs";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

const MAX_BYTES = 4_000_000;

function shiftFromHost(host) {
  const m = /(\d{1,2})(sep|oct)s(\d)/i.exec(host);
  if (!m) return null;
  const id = `${m[1].padStart(2, "0")}${m[2].toLowerCase()}-s${m[3]}`;
  return CONFIG.shifts.some((s) => s.id === id) ? id : null;
}

async function fetchSheet(rawUrl) {
  let u;
  try { u = new URL(rawUrl.trim()); } catch { throw new UserError("Link sahi nahi hai / Invalid link."); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new UserError("Invalid link.");
  if (!CONFIG.allowedHost.test(u.hostname)) throw new UserError("Sirf cbtexam.in ka response-sheet link chalega / Only cbtexam.in links are supported.");
  u.protocol = "https:";
  let res;
  try {
    res = await fetch(u, {
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
    });
  } catch {
    throw new UserError("Link open nahi ho paya (timeout/blocked). Neeche 'Paste page text' option use karein.", { fallback: true });
  }
  if (!CONFIG.allowedHost.test(new URL(res.url).hostname)) throw new UserError("Redirect blocked.");
  if (!res.ok) throw new UserError(`Server ne ${res.status} diya. Link expire ho sakta hai — 'Paste page text' try karein.`, { fallback: true });
  const body = await res.text();
  if (body.length > MAX_BYTES) throw new UserError("Page bahut bada hai.");
  return { html: body, url: u };
}

class UserError extends Error {
  constructor(msg, extra = {}) { super(msg); this.extra = extra; }
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }

  try {
    const { url, text, key: keyText, shiftId: shiftIn, join = true } = body || {};
    if (!url && !text) throw new UserError("Link ya page text daalein / Provide a link or page text.");

    let html, sheetUrl = null;
    if (url) ({ html, url: sheetUrl } = await fetchSheet(url));
    else { if (text.length > MAX_BYTES) throw new UserError("Text bahut bada hai."); html = text; }

    // ── shift ──
    let shiftId = CONFIG.shifts.some((s) => s.id === shiftIn) ? shiftIn : null;
    if (!shiftId && sheetUrl) shiftId = shiftFromHost(sheetUrl.hostname);
    if (!shiftId) return json({ needShift: true, error: "Apni shift select karein / Please select your shift." });

    // ── parse + score ──
    const { questions, diagnostics } = parseQuestions(html, CONFIG);
    if (questions.length < 10) {
      return json({ error: "Page se questions nahi mil paye. Format alag lag raha hai.", diagnostics, fallback: !!url }, 422);
    }
    const externalKey = parseKey(keyText);
    const score = scoreSheet(questions, CONFIG, externalKey);
    if (score.unknown > 0) {
      return json({
        needKey: true,
        error: `${score.unknown} questions ka sahi answer page me nahi mila. Answer key paste karein (jaise: 1 A, 2 C, 3 B ...).`,
        unknownNos: score.unknownNos, diagnostics,
      }, 200);
    }

    // ── identity ──
    const rollFromUrl = sheetUrl?.searchParams.get("Rollno");
    const rollFromText = /Roll\s*(?:No|Number)\.?\s*[:\-]?\s*([A-Za-z0-9]{6,})/i.exec(html.replace(/<[^>]+>/g, " "))?.[1];
    const idSource = rollFromUrl || rollFromText || questions.map((q) => q.chosen ?? "-").join("");
    const idHash = hashId(`${shiftId}|${idSource}`);

    // ── ranking ──
    const st = stores();
    const bin = binOf(score.marks, CONFIG);
    const complete = questions.length === CONFIG.questions;
    let joined = false;
    if (join && complete) {
      await saveCandidate(st, CONFIG, shiftId, idHash, { bin, marks: score.marks, c: score.correct, w: score.wrong, t: Date.now() });
      joined = true;
    }
    const hists = await loadAllHists(st, CONFIG);
    if (!joined) hists[shiftId][bin] += 1; // virtual: show where you'd stand
    const ranks = computeRanks(hists, shiftId, score.marks, CONFIG);

    const shiftStats = CONFIG.shifts.map((s) => ({ id: s.id, label: s.label, n: hists[s.id].reduce((a, b) => a + b, 0) }));
    const shiftLabel = CONFIG.shifts.find((s) => s.id === shiftId).label;

    return json({
      ok: true,
      shiftId, shiftLabel,
      totalQuestions: CONFIG.questions,
      maxMarks: CONFIG.maxMarks,
      questionsParsed: questions.length,
      partial: !complete,
      joined,
      score,
      ranks,
      shiftStats,
    });
  } catch (e) {
    if (e instanceof UserError) return json({ error: e.message, ...e.extra }, 400);
    console.error(e);
    return json({ error: "Server error. Thodi der baad try karein." }, 500);
  }
};

export const config = { path: "/api/calc" };
