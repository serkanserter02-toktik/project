// Boost birimi → hız artışı. Birim sayısı = biriken jeton / "boost başına jeton" (sunucu yapılandırması, varsayılan 2).
export const MAX_COINS_PER_EVENT = 50000; // tek olayda üst sınır (kötüye kullanım / taşma koruması)
export const BOOST_MAX_TIME = 8; // üst üste gelen boost'ların toplam süresi bu değeri aşmaz (sn)
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * units: aynı anda tetiklenen boost sayısı. Logaritmik: 1 birim hafif bir hamle, ~100 birim tam güç.
 *   1 → +%30 hız, 1,9 sn · 10 → +%52, 3 sn · 100+ → +%75, 4 sn
 */
export function boostFor(units) {
  const s = clamp(0.25 + (0.75 * Math.log10(Math.max(1, units))) / 2, 0.25, 1);
  return { gain: 0.15 + 0.6 * s, duration: 1.2 + 2.8 * s };
}
