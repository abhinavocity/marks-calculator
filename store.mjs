import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const stores = () => ({
  hist: getStore({ name: "hist", consistency: "strong" }),
  cand: getStore({ name: "cand", consistency: "strong" }),
});

export const hashId = (s) =>
  createHash("sha256").update(`${process.env.HASH_SALT || "ace-with-abhinav"}|${s}`).digest("hex").slice(0, 24);

/** read-modify-write a shift histogram using ETag conditional writes */
async function mutateHist(store, shiftId, bins, fn) {
  const key = `shift/${shiftId}`;
  for (let i = 0; i < 12; i++) {
    const r = await store.getWithMetadata(key, { type: "json", consistency: "strong" });
    const arr = r ? r.data : new Array(bins).fill(0);
    fn(arr);
    const w = await store.setJSON(key, arr, r ? { onlyIfMatch: r.etag } : { onlyIfNew: true });
    if (w.modified) return arr;
    await sleep(25 + Math.random() * 150);
  }
  throw new Error("Server busy, please try again");
}

/** insert / update one candidate. Returns nothing; histogram is kept in sync. */
export async function saveCandidate({ hist, cand }, cfg, shiftId, idHash, rec) {
  const key = `${shiftId}/${idHash}`;
  const prev = await cand.get(key, { type: "json" });
  if (prev && prev.bin === rec.bin) {
    await cand.setJSON(key, rec);
    return;
  }
  await mutateHist(hist, shiftId, cfg.bins, (arr) => {
    if (prev) arr[prev.bin] = Math.max(0, arr[prev.bin] - 1);
    arr[rec.bin] += 1;
  });
  await cand.setJSON(key, rec);
}

export async function loadAllHists({ hist }, cfg) {
  const out = {};
  await Promise.all(
    cfg.shifts.map(async (s) => {
      const h = await hist.get(`shift/${s.id}`, { type: "json", consistency: "strong" });
      out[s.id] = h || new Array(cfg.bins).fill(0);
    })
  );
  return out;
}
