// Pure ranking maths. A "histogram" is an array of candidate counts indexed
// by marks bin: bin = round((marks - minMarks) / binStep).

export const binOf = (marks, cfg) =>
  Math.min(cfg.bins - 1, Math.max(0, Math.round((marks - cfg.minMarks) / cfg.binStep)));

const total = (h) => h.reduce((a, b) => a + b, 0);
const EPS = 1e-9;

/** Percentile per the MPESB single-stage formula:
 *  P = (candidates in the shift with marks <= mine) / N * 100 */
export function percentileOf(hist, bin) {
  const n = total(hist);
  if (!n) return 0;
  let cum = 0;
  for (let b = 0; b <= bin; b++) cum += hist[b];
  return (cum / n) * 100;
}

/** number of candidates in this shift whose marks are strictly higher */
export function countAboveBin(hist, bin) {
  let c = 0;
  for (let b = bin + 1; b < hist.length; b++) c += hist[b];
  return c;
}

/** number of candidates in this shift whose OWN-shift percentile is strictly above P */
export function countAbovePercentile(hist, P) {
  const n = total(hist);
  if (!n) return 0;
  let cum = 0, above = 0;
  for (let b = 0; b < hist.length; b++) {
    if (!hist[b]) continue;
    cum += hist[b];
    if ((cum / n) * 100 > P + EPS) above += hist[b];
  }
  return above;
}

/**
 * hists: { [shiftId]: number[] }  (must already include the candidate)
 * Returns shift + overall ranking for a candidate.
 */
export function computeRanks(hists, shiftId, marks, cfg) {
  const own = hists[shiftId];
  const bin = binOf(marks, cfg);
  const nShift = total(own);
  const P = percentileOf(own, bin);

  // extrapolate to the real population only if every shift has an `appeared` figure
  const extrapolate = cfg.shifts.every((s) => s.appeared > 0);
  const scale = (s) => {
    const n = total(hists[s.id] || []);
    return extrapolate && n > 0 ? s.appeared / n : 1;
  };
  const popOf = (s) => (extrapolate ? s.appeared : total(hists[s.id] || []));

  const sh = cfg.shifts.find((s) => s.id === shiftId);
  const shiftRank = 1 + countAboveBin(own, bin) * scale(sh);
  const shiftTotal = popOf(sh);

  let overallAbove = 0, overallTotal = 0;
  for (const s of cfg.shifts) {
    const h = hists[s.id];
    if (!h) continue;
    overallAbove += countAbovePercentile(h, P) * scale(s);
    overallTotal += popOf(s);
  }
  return {
    percentile: Math.round(P * 10000) / 10000,
    shiftRank: Math.round(shiftRank),
    shiftTotal: Math.round(shiftTotal),
    overallRank: Math.round(1 + overallAbove),
    overallTotal: Math.round(overallTotal),
    sampleShift: nShift,
    extrapolated: extrapolate,
  };
}
