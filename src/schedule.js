// Zaman çizelgesi: yarış döngüsü gerçek saatten türetilir (sunucu durumu gerekmez).
// Hem tarayıcı hem Vercel fonksiyonları aynı sabitleri kullanır.
const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
const nodeEnv = typeof process !== 'undefined' ? process.env : {};

export const RACE_SECONDS = num(nodeEnv.RACE_SECONDS ?? import.meta.env?.VITE_RACE_SECONDS, 90);
export const WAIT_SECONDS = num(nodeEnv.WAIT_SECONDS ?? import.meta.env?.VITE_WAIT_SECONDS, 30); // yarışlar arası (geri sayım dahil)
export const RUNNERS = 8;
export const COUNTDOWN = 3;
export const DEFAULT_COINS_PER_BOOST = 2; // sunucu yapılandırması yoksa: her 2 jeton = 1 boost
export const FINISH_TAIL = 1.2; // süre bitince koşucuların yavaşlama süresi
export const BOOST_DELAY = 5; // hediye geldikten 5-6 sn sonra, TÜM istemcilerde aynı anda (saniye sınırında) devreye girer. Kural: gecikme > CDN önbelleği (2) + istemci sorgu aralığı (2) + ağ payı
export const EPOCH = Date.UTC(2026, 0, 1);
// Döngü: geri sayım → yarış → bitiş → sonuç bekleme
export const CYCLE = RACE_SECONDS + WAIT_SECONDS + FINISH_TAIL;

/** ms (sunucu saati) → { cycle, t } ; t = döngü başlangıcından geçen sn. */
export function at(ms) {
  const sec = (ms - EPOCH) / 1000;
  const cycle = Math.floor(sec / CYCLE);
  return { cycle, t: sec - cycle * CYCLE };
}
/** Döngü başlangıcı (ms). */
export const cycleStart = (cycle) => EPOCH + cycle * CYCLE * 1000;
/** Yarış bitişi (ms): koşucular durmuş ve sonuç kesinleşmiş an. */
export const cycleDoneAt = (cycle) => cycleStart(cycle) + (COUNTDOWN + RACE_SECONDS + FINISH_TAIL) * 1000;
