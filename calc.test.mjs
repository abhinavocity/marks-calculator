import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../netlify/lib/config.mjs";
import { parseQuestions, parseKey, scoreSheet } from "../netlify/lib/parse.mjs";
import { binOf, computeRanks, percentileOf } from "../netlify/lib/rank.mjs";

// deterministic RNG
let seed = 42; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

function truth(n = 200) {
  const rows = [];
  for (let i = 1; i <= n; i++) {
    const correct = 1 + Math.floor(rnd() * 4);
    const r = rnd();
    const chosen = r < 0.2 ? null : r < 0.75 ? correct : ((correct % 4) + 1);
    rows.push({ no: i, correct, chosen });
  }
  return rows;
}
const expected = (rows) => {
  const c = rows.filter((r) => r.chosen === r.correct).length;
  const w = rows.filter((r) => r.chosen && r.chosen !== r.correct).length;
  return { c, w, u: rows.length - c - w, marks: c - w * 0.25 };
};
const L = (n) => "ABCD"[n - 1];

const fmtLabels = (rows) => `<html><body><h1>Response Sheet</h1>` + rows.map((r) =>
  `<div class="q"><p>Q.${r.no} Which is right? Q. 7 is mentioned inline</p><p>Correct Answer : ${L(r.correct)}</p><p>Your Answer : ${r.chosen ? L(r.chosen) : "--"}</p></div>`).join("") + `</body></html>`;

const fmtTable = (rows) => `<table>` + rows.map((r) =>
  `<tr><td>Question No.</td><td>${r.no}</td></tr><tr><td>Right Answer</td><td>${r.correct}</td></tr><tr><td>Candidate Answer</td><td>${r.chosen ?? "Not Answered"}</td></tr>`).join("") + `</table>`;

const fmtClasses = (rows) => rows.map((r) => `<div class="question"><h4>Question ${r.no}</h4>` +
  [1, 2, 3, 4].map((o) => `<div class="option ${o === r.correct ? "correct" : ""} ${o === r.chosen ? "selected" : ""}">${L(o)}. option text ${o}</div>`).join("") + `</div>`).join("");

const fmtDigialm = (rows) => rows.map((r) =>
  `<table><tr><td>Q.${r.no}</td></tr><tr><td>Question ID :</td><td>${1000 + r.no}</td></tr><tr><td>Status :</td><td>${r.chosen ? "Answered" : "Not Answered"}</td></tr><tr><td>Chosen Option :</td><td>${r.chosen ?? "--"}</td></tr></table>`).join("");

const fmtVerdict = (rows) => rows.map((r) =>
  `<div>Q${r.no}.<br>Result : ${!r.chosen ? "Not Attempted" : r.chosen === r.correct ? "Correct" : "Wrong"}</div>`).join("");

for (const [name, fmt, needsKey] of [
  ["labels", fmtLabels, false], ["table", fmtTable, false], ["css classes", fmtClasses, false],
  ["digialm + external key", fmtDigialm, true], ["verdict-only", fmtVerdict, false],
]) {
  test(`parse+score: ${name}`, () => {
    const rows = truth();
    const { questions, diagnostics } = parseQuestions(fmt(rows), CONFIG);
    assert.equal(questions.length, 200, JSON.stringify(diagnostics).slice(0, 300));
    const key = needsKey ? parseKey(rows.map((r) => `${r.no}-${L(r.correct)}`).join("\n")) : {};
    const s = scoreSheet(questions, CONFIG, key);
    const e = expected(rows);
    assert.equal(s.unknown, 0);
    assert.equal(s.correct, e.c); assert.equal(s.wrong, e.w); assert.equal(s.unattempted, e.u);
    assert.equal(s.marks, e.marks);
  });
}

test("digialm without key reports unknown", () => {
  const rows = truth();
  const { questions } = parseQuestions(fmtDigialm(rows), CONFIG);
  const s = scoreSheet(questions, CONFIG, {});
  assert.equal(s.unknown, rows.filter((r) => r.chosen).length);
});

test("dropped question gives bonus; multi-correct accepted", () => {
  const qs = [{ no: 1, chosen: "2" }, { no: 2, chosen: null }, { no: 3, chosen: "3" }];
  const key = parseKey("1 A/B\n2 dropped\n3 D");
  const s = scoreSheet(qs, CONFIG, key);
  assert.deepEqual([s.correct, s.wrong, s.bonus, s.marks], [1, 1, 1, 1.75]);
});

test("plain pasted text (no html) works", () => {
  const text = [1, 2, 3].map((n) => `Q.${n}\nCorrect Answer: B\nYour Answer: ${n === 3 ? "-" : "B"}`).join("\n");
  const { questions } = parseQuestions(text, CONFIG);
  const s = scoreSheet(questions, CONFIG);
  assert.deepEqual([s.correct, s.unattempted], [2, 1]);
});

/* ───────── ranking vs brute force ───────── */
test("histogram ranking equals brute-force percentile ranking (22 shifts)", () => {
  const cfg = { ...CONFIG, shifts: CONFIG.shifts.map((s) => ({ ...s })) };
  const hists = {}; const all = [];
  cfg.shifts.forEach((s, si) => {
    hists[s.id] = new Array(cfg.bins).fill(0);
    const n = 150 + Math.floor(rnd() * 200);
    const mean = 90 + si * 1.5; // shifts differ in difficulty
    for (let i = 0; i < n; i++) {
      const g = (rnd() + rnd() + rnd() + rnd() - 2) * 45;
      const marks = Math.max(-50, Math.min(200, Math.round((mean + g) * 4) / 4));
      hists[s.id][binOf(marks, cfg)]++;
      all.push({ sid: s.id, marks });
    }
  });
  // brute force
  const byShift = {}; for (const c of all) (byShift[c.sid] ||= []).push(c.marks);
  const pct = (sid, m) => byShift[sid].filter((x) => x <= m).length / byShift[sid].length * 100;
  const withP = all.map((c) => ({ ...c, p: pct(c.sid, c.marks) }));
  for (let t = 0; t < 40; t++) {
    const me = withP[Math.floor(rnd() * withP.length)];
    const r = computeRanks(hists, me.sid, me.marks, cfg);
    const bruteOverall = 1 + withP.filter((c) => c.p > me.p + 1e-9).length;
    const bruteShift = 1 + byShift[me.sid].filter((x) => x > me.marks).length;
    assert.equal(r.overallRank, bruteOverall);
    assert.equal(r.shiftRank, bruteShift);
    assert.ok(Math.abs(r.percentile - me.p) < 1e-3);
  }
  // each shift's topper has percentile 100
  for (const s of cfg.shifts) assert.equal(Math.max(...byShift[s.id].map((m) => pct(s.id, m))), 100);
});

test("extrapolation scales rank to full population", () => {
  const cfg = { ...CONFIG, shifts: CONFIG.shifts.map((s) => ({ ...s, appeared: 1000 })) };
  const hists = {}; cfg.shifts.forEach((s) => { hists[s.id] = new Array(cfg.bins).fill(0); for (let i = 0; i < 10; i++) hists[s.id][binOf(100 + i * 5, cfg)]++; });
  const r = computeRanks(hists, cfg.shifts[0].id, 145, cfg); // top of a 10-sample shift
  assert.equal(r.shiftTotal, 1000);
  assert.equal(r.overallTotal, 22000);
  assert.equal(r.shiftRank, 1);
  assert.equal(r.overallRank, 1);
});
