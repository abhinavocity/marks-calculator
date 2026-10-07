import { CONFIG } from "../lib/config.mjs";
import { stores, loadAllHists } from "../lib/store.mjs";

export default async () => {
  try {
    const hists = await loadAllHists(stores(), CONFIG);
    const shifts = CONFIG.shifts.map((s) => ({ id: s.id, label: s.label, n: hists[s.id].reduce((a, b) => a + b, 0) }));
    return new Response(JSON.stringify({ shifts, total: shifts.reduce((a, b) => a + b.n, 0), questions: CONFIG.questions }), {
      headers: { "content-type": "application/json", "cache-control": "public, max-age=30" },
    });
  } catch {
    return new Response(JSON.stringify({ shifts: CONFIG.shifts.map((s) => ({ id: s.id, label: s.label, n: 0 })), total: 0, questions: CONFIG.questions }), {
      headers: { "content-type": "application/json" },
    });
  }
};
export const config = { path: "/api/stats" };
