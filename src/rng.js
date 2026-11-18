/** Tohumlu, hızlı, deterministik üreteç (mulberry32). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Döngü numarasından yarış tohumu. */
export const seedFor = (cycle) => (Math.imul(cycle + 1, 2654435761) ^ 0x9e3779b9) >>> 0;

/** Döngüye özel şerit dizilimi: order[koşucu] = şerit sırası (0..n-1). Her yarışta farklı, tüm istemcilerde aynı. */
export function laneOrder(cycle, n, out = []) {
  const rnd = mulberry32(seedFor(cycle) ^ 0xa5a5a5a5);
  for (let i = 0; i < n; i++) out[i] = i;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
