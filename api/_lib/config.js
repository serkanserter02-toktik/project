import { DEFAULT_COINS_PER_BOOST } from '../../src/schedule.js';

// Sunucu yapılandırması. "Boost başına jeton" önceliği: Redis `config:coinsPerBoost` > ortam değişkeni COINS_PER_BOOST > 2.
// Değer her yarış için, o yarışın ilk hediyesinde sabitlenir (yarış ortasında değişip sonucu bozmasın);
// Redis'teki değeri değiştirmek yeniden başlatma gerektirmez, bir sonraki yarışta geçerli olur.
export const CONFIG_KEY = 'config:coinsPerBoost';

/** Geçerli (1..100000 tam sayı) değilse null. */
export function parsePer(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 100000 ? n : null;
}

/** Redis dışı varsayılan: ortam değişkeni, yoksa 2. */
export const fallbackPer = () => parsePer(process.env.COINS_PER_BOOST) ?? DEFAULT_COINS_PER_BOOST;

// Hediye adı → ülke ek eşleşmeleri (JSON: { "Rose": "TR", "Lion": "Russia", "Star": 3 }).
// Öncelik: Redis `config:giftAliases` > env GIFT_ALIASES. Her webhook/işçi çağrısında Redis'ten taze okunur (ek istek yok).
export const GIFT_ALIASES_KEY = 'config:giftAliases';

/** Eşleşmeyen hediyeler: "ignore" (yok say, varsayılan) ya da "user" (izleyici kimliğinden sabit koşucuya ata). */
export const unmatchedPolicy = () => (process.env.UNMATCHED_GIFTS === 'user' ? 'user' : 'ignore');
