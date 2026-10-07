// ──────────────────────────────────────────────────────────────
//  Exam configuration — MPESB Group-2 Sub-group-4 (CRT 2026)
//  Edit this file if the exam pattern changes.
// ──────────────────────────────────────────────────────────────

// Order = chronological. `appeared` = actual number of candidates who
// appeared in that shift (get it from the official notice / your own
// estimate). Leave as null until you know it. When ALL 22 shifts have a
// number, ranks are extrapolated to the full candidate population;
// until then, ranks are shown among candidates who used this tool.
const S = (id, label, appeared = null) => ({ id, label, appeared });

export const CONFIG = {
  questions: 200,
  marksPerCorrect: 1,
  negativeMarks: 0.25, // 1/4 negative marking
  shifts: [
    S("23sep-s1", "23 Sep · Shift 1"),
    S("23sep-s2", "23 Sep · Shift 2"),
    S("24sep-s1", "24 Sep · Shift 1"),
    S("24sep-s2", "24 Sep · Shift 2"),
    S("26sep-s1", "26 Sep · Shift 1"),
    S("26sep-s2", "26 Sep · Shift 2"),
    S("27sep-s1", "27 Sep · Shift 1"),
    S("27sep-s2", "27 Sep · Shift 2"),
    S("28sep-s1", "28 Sep · Shift 1"),
    S("28sep-s2", "28 Sep · Shift 2"),
    S("29sep-s1", "29 Sep · Shift 1"),
    S("29sep-s2", "29 Sep · Shift 2"),
    S("30sep-s1", "30 Sep · Shift 1"),
    S("30sep-s2", "30 Sep · Shift 2"),
    S("01oct-s1", "1 Oct · Shift 1"),
    S("01oct-s2", "1 Oct · Shift 2"),
    S("03oct-s1", "3 Oct · Shift 1"),
    S("03oct-s2", "3 Oct · Shift 2"),
    S("04oct-s1", "4 Oct · Shift 1"),
    S("04oct-s2", "4 Oct · Shift 2"),
    S("05oct-s1", "5 Oct · Shift 1"),
    S("05oct-s2", "5 Oct · Shift 2"),
  ],
  // Only fetch response sheets from this host family (SSRF protection).
  allowedHost: /^[a-z0-9_-]+\.cbtexam\.in$/i,
};

CONFIG.minMarks = -CONFIG.questions * CONFIG.negativeMarks;
CONFIG.maxMarks = CONFIG.questions * CONFIG.marksPerCorrect;
// histogram resolution: 1 bin per 0.25 mark
CONFIG.binStep = 0.25;
CONFIG.bins = Math.round((CONFIG.maxMarks - CONFIG.minMarks) / CONFIG.binStep) + 1;
