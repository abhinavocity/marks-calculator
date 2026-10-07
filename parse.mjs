import { parse as parseHtml } from "node-html-parser";

/* ───────── HTML → text (with markers for "correct"/"selected" styling) ───────── */

const OK_RE = /(?:^|[\s_-])(correct|correctans|correct-?answer|correct-?option|rightans|right-?answer|right-?option|is-?correct|ans-?correct|greenbg|success)(?:[\s_-]|$)/i;
const SEL_RE = /(?:^|[\s_-])(chosen|selected|checked|marked|candidate-?ans|candidate-?answer|your-?ans|your-?answer|user-?ans|given-?ans|wrong|incorrect|wrong-?ans|danger)(?:[\s_-]|$)/i;
const BLOCK = new Set(["DIV","P","TR","LI","UL","OL","TABLE","H1","H2","H3","H4","H5","H6","SECTION","BR","HR","FORM","TBODY","THEAD","ARTICLE","LABEL"]);

export function htmlToText(html) {
  if (!/<[a-z][\s\S]*>/i.test(html)) return html; // already plain text
  const root = parseHtml(html, { blockTextElements: { script: false, style: false, noscript: false } });
  const out = [];
  const walk = (n) => {
    if (n.nodeType === 3) { out.push(n.text); return; }
    if (n.nodeType !== 1) return;
    const tag = (n.tagName || "").toUpperCase();
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return;
    const attr = (k) => (n.getAttribute ? n.getAttribute(k) || "" : "");
    const cls = `${attr("class")} ${attr("id")}`;
    if (tag === "INPUT") {
      const t = attr("type").toLowerCase();
      if ((t === "radio" || t === "checkbox") && n.hasAttribute("checked")) out.push(" ⟦SEL⟧ ");
      return;
    }
    if (tag === "IMG") {
      const s = `${attr("alt")} ${attr("src")}`.toLowerCase();
      if (/(right|tick|correct|check)/.test(s) && !/(wrong|cross|incorrect)/.test(s)) out.push(" ⟦OK⟧ ");
      else if (/(wrong|cross|incorrect)/.test(s)) out.push(" ⟦SEL⟧ ");
      return;
    }
    const block = BLOCK.has(tag);
    if (block) out.push("\n");
    if (OK_RE.test(cls)) out.push(" ⟦OK⟧ ");
    if (SEL_RE.test(cls)) out.push(" ⟦SEL⟧ ");
    for (const c of n.childNodes) walk(c);
    if (tag === "TD" || tag === "TH") out.push(" \t ");
    if (block) out.push("\n");
  };
  walk(root);
  return out.join("").replace(/ /g, " ").replace(/[ ]+/g, " ").replace(/\n\s*\n+/g, "\n");
}

/* ───────── option / token helpers ───────── */

const OPT = "[A-Da-d1-4]";
const toOpt = (t) => {
  const m = /^[(\[]?\s*([A-Da-d1-4])\s*[)\].]?(?:\s|$|,|\/)/.exec(`${t} `);
  if (!m) return null;
  const c = m[1].toUpperCase();
  return "ABCD".includes(c) ? String("ABCD".indexOf(c) + 1) : c;
};
const BONUS_RE = /drop|delet|cancel|bonus|grace|all\s*options|any\s*option|full\s*marks/i;

function parseCorrectValue(v) {
  if (!v) return undefined;
  if (BONUS_RE.test(v)) return "BONUS";
  const parts = v.split(/\s*(?:,|\/|&|\bor\b|\band\b)\s*/i).map(toOpt).filter(Boolean);
  return parts.length ? [...new Set(parts)] : undefined;
}

/* ───────── per-question extraction ───────── */

const Q_HEAD = /(?:^|\n)[ \t]*(?:Q(?:uestion)?\.?\s*(?:No\.?)?|Que\.?|प्रश्न(?:\s*संख्या)?)\s*[.:\-]?\s*(\d{1,3})\b/gi;

const CHOSEN_LABEL = /(?<!correct\s)(?<!right\s)(?:chosen\s*option|your\s*answer|your\s*response|your\s*option|candidate'?s?\s*(?:answer|response|option)|selected\s*(?:option|answer)|marked\s*(?:option|answer)|option\s*chosen|answer\s*given|given\s*answer|उम्मीदवार\s*का\s*उत्तर|आपका\s*उत्तर)\s*[:\-=]?\s*([^\n\t|]{0,30})/i;
const CORRECT_LABEL = /(?:correct\s*(?:answer|option|choice|ans)|right\s*(?:answer|option|choice|ans)|answer\s*key|key\s*answer|official\s*(?:answer|key)|सही\s*उत्तर)\s*[:\-=]?\s*([^\n\t|]{0,40})/i;
const STATUS_LABEL = /Status\s*[:\-]\s*(Not\s*Answered|Not\s*Attempted|Not\s*Visited|Unattempted|Answered|Marked\s*For\s*Review[^\n\t|]*)/i;
const VERDICT_LABEL = /(?:Result|Remark|Verdict|Outcome|Response\s*Status)\s*[:\-]\s*(Correct|Right|Incorrect|Wrong|Not\s*Attempted|Unattempted|Not\s*Answered|Skipped)/i;

function markerOption(seg, marker) {
  // find the option label next to a marker, on the same line
  for (const line of seg.split("\n")) {
    if (!line.includes(marker)) continue;
    const after = new RegExp(`${marker}\\s*[(\\[]?\\s*(${OPT})\\s*[)\\].:\\-]?(?:\\s|$)`).exec(line);
    if (after) return toOpt(after[1]);
    const before = new RegExp(`^\\s*[(\\[]?\\s*(${OPT})\\s*[)\\].:\\-]\\s`).exec(line.replace(/⟦\w+⟧/g, ""));
    if (before) return toOpt(before[1]);
  }
  return undefined;
}

export function parseQuestions(input, cfg) {
  const text = htmlToText(input);
  const heads = [];
  let last = 0, m;
  Q_HEAD.lastIndex = 0;
  while ((m = Q_HEAD.exec(text))) {
    const no = +m[1];
    if (no > last && no <= cfg.questions) {
      heads.push({ no, start: m.index, end: m.index + m[0].length });
      last = no;
    }
  }
  const questions = [];
  for (let i = 0; i < heads.length; i++) {
    const seg = text.slice(heads[i].end, i + 1 < heads.length ? heads[i + 1].start : undefined);
    const q = { no: heads[i].no, chosen: undefined, correct: undefined, verdict: undefined };

    const st = STATUS_LABEL.exec(seg);
    const statusNA = st && /^(not|unatt)/i.test(st[1]);

    const cm = CHOSEN_LABEL.exec(seg);
    if (cm) q.chosen = toOpt(cm[1]) || null; // label present but no valid option → unattempted
    const sel = markerOption(seg, "⟦SEL⟧");
    if (q.chosen === undefined && sel) q.chosen = sel;
    if (statusNA) q.chosen = null;
    // options are listed on the page but none is marked as selected → unattempted
    if (q.chosen === undefined) {
      const optionLines = (seg.match(/^[ \t]*(?:⟦\w+⟧\s*)?[(\[]?[A-Da-d1-4][)\].:]\s/gm) || []).length;
      if (optionLines >= 3 || seg.includes("⟦OK⟧")) q.chosen = null;
    }

    const rm = CORRECT_LABEL.exec(seg);
    if (rm) q.correct = parseCorrectValue(rm[1]);
    const ok = markerOption(seg, "⟦OK⟧");
    if (q.correct === undefined && ok) q.correct = [ok];

    const vm = VERDICT_LABEL.exec(seg);
    if (vm) {
      const v = vm[1].toLowerCase();
      q.verdict = /^(correct|right)$/.test(v) ? "C" : /^(incorrect|wrong)$/.test(v) ? "W" : "U";
    }
    // chosen was never labelled but status says answered → unknown choice (leave undefined)
    questions.push(q);
  }
  return {
    questions,
    text,
    diagnostics: {
      textLength: text.length,
      questionsFound: questions.length,
      withChosen: questions.filter((q) => q.chosen !== undefined).length,
      withCorrect: questions.filter((q) => q.correct !== undefined).length,
      withVerdict: questions.filter((q) => q.verdict !== undefined).length,
      head: text.slice(0, 500),
      firstQuestion: heads.length ? text.slice(heads[0].start, heads[0].start + 600) : "",
    },
  };
}

/* ───────── optional pasted answer key ("1 A", "2-C", "Q3: B" …) ───────── */

export function parseKey(raw) {
  const key = {};
  if (!raw) return key;
  const re = /(\d{1,3})\s*[-.:)=\s]\s*((?:[A-Da-d1-4](?:\s*[,/]\s*[A-Da-d1-4])*)|drop\w*|bonus|cancel\w*|delet\w*)(?![A-Za-z0-9])/gi;
  let m;
  while ((m = re.exec(raw.replace(/\bQ(?:uestion)?\.?/gi, "")))) {
    const v = parseCorrectValue(m[2]);
    if (v) key[+m[1]] = v;
  }
  return key;
}

/* ───────── scoring ───────── */

export function scoreSheet(questions, cfg, externalKey = {}) {
  let correct = 0, wrong = 0, unattempted = 0, bonus = 0, unknown = 0;
  const unknownNos = [];
  for (const q of questions) {
    const ans = q.correct !== undefined ? q.correct : externalKey[q.no];
    if (ans === "BONUS") { bonus++; continue; }
    // 1) explicit verdict from page
    if (q.verdict && ans === undefined) {
      if (q.verdict === "C") correct++; else if (q.verdict === "W") wrong++; else unattempted++;
      continue;
    }
    if (q.chosen === null) { unattempted++; continue; }
    if (ans === undefined || q.chosen === undefined) {
      if (q.verdict) { if (q.verdict === "C") correct++; else if (q.verdict === "W") wrong++; else unattempted++; continue; }
      unknown++; unknownNos.push(q.no); continue;
    }
    if (ans.includes(q.chosen)) correct++; else wrong++;
  }
  const marks = (correct + bonus) * cfg.marksPerCorrect - wrong * cfg.negativeMarks;
  return {
    correct, wrong, unattempted, bonus, unknown, unknownNos: unknownNos.slice(0, 30),
    attempted: correct + wrong,
    marks: Math.round(marks * 100) / 100,
  };
}
