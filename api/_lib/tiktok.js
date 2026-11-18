// TikTok hediye işleme (sunucu tarafı): webhook (api/tiktok.js) ve kalıcı işçi (worker/) aynı kodu kullanır.
// Hediyenin ADI ülke adıdır: ad → koşucu eşleşmesi src/gifts.js'te, ek eşleşmeler yapılandırmadan gelir.
import { store } from './store.js';
import { unmatchedPolicy } from './config.js';
import { at, COUNTDOWN, RACE_SECONDS, RUNNERS, BOOST_DELAY } from '../../src/schedule.js';
import { MAX_COINS_PER_EVENT } from '../../src/boost.js';
import { buildGiftMatcher, parseAliases } from '../../src/gifts.js';

/**
 * Ham olayı iç biçime çevirir: { eventId, userId, giftName, runner, coins } ya da null (geçersiz).
 * İç biçimi ve TikTok benzeri alanları kabul eder (msgId, uniqueId, giftDetails.giftName, diamondCount × repeatCount).
 * `runner` (0-7) açıkça verilmişse ad eşleşmesine bakılmaz.
 */
export function parseGift(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const gd = raw.giftDetails ?? {};
  const coins = Math.floor(Number(raw.coins ?? Number(raw.diamondCount ?? gd.diamondCount) * (Number(raw.repeatCount) || 1)));
  if (!Number.isFinite(coins) || coins <= 0) return null;
  const eventId = String(raw.eventId ?? raw.msgId ?? '');
  if (!eventId) return null;
  const r = Number(raw.runner);
  return {
    eventId,
    userId: String(raw.userId ?? raw.uniqueId ?? ''),
    giftName: String(raw.giftName ?? gd.giftName ?? ''),
    runner: raw.runner != null && Number.isInteger(r) && r >= 0 && r < RUNNERS ? r : -1,
    coins: Math.min(coins, MAX_COINS_PER_EVENT),
  };
}

// Eşleştirici önbelleği: yapılandırma değişmedikçe yeniden kurulmaz.
let cached = { key: null, match: null };
function matcherFor(redisRaw) {
  const key = `${process.env.GIFT_ALIASES ?? ''}\u0000${redisRaw ?? ''}`;
  if (cached.key !== key) {
    cached = { key, match: buildGiftMatcher({ ...parseAliases(process.env.GIFT_ALIASES), ...parseAliases(redisRaw) }) };
  }
  return cached.match;
}

/** Eşleşme yoksa: "user" politikasında izleyici kimliğinden sabit koşucu, değilse -1 (yok say). */
function fallbackRunner(userId) {
  if (unmatchedPolicy() !== 'user' || !userId) return -1;
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (Math.imul(h, 31) + userId.charCodeAt(i)) >>> 0;
  return h % RUNNERS;
}

/**
 * Hediyeleri işler: yinelenenleri atar, hediye adından ülkeyi bulur, jetonları (saniye, koşucu) kovalarında toplar
 * ve tek yazmayla kaydeder. Boost, `ceil(şimdi + BOOST_DELAY)` saniyesinde (yarış saati) tüm istemcilerde aynı anda başlar.
 * Dönüş: { ok, accepted, duplicates, unmatched, late }
 */
export async function ingestGifts(rawEvents, now = Date.now()) {
  if (!store) return { ok: false, reason: 'no-store', accepted: 0 };
  const events = rawEvents.map(parseGift).filter(Boolean);
  const { cycle, t } = at(now);
  // Tek Redis çağrısı: yinelenenleri ayıkla + boost başına jeton değerini yarışa sabitle + eşleşme yapılandırmasını oku
  const { fresh, aliases } = await store.begin(cycle, events.map((e) => e.eventId));
  const match = matcherFor(aliases);
  const rt = t - COUNTDOWN;
  const buckets = new Map();
  const out = { ok: true, accepted: 0, duplicates: 0, unmatched: 0, late: 0, unmatchedNames: [] };
  events.forEach((e, i) => {
    if (!fresh[i]) { out.duplicates++; return; }
    let runner = e.runner >= 0 ? e.runner : e.giftName ? match(e.giftName) : -1;
    if (runner < 0) runner = fallbackRunner(e.userId);
    if (runner < 0) { out.unmatched++; if (out.unmatchedNames.length < 5) out.unmatchedNames.push(e.giftName); return; }
    const bucket = Math.max(1, Math.ceil(rt + BOOST_DELAY));
    if (rt >= RACE_SECONDS || bucket >= RACE_SECONDS) { out.late++; return; } // yarış bitti / bitmek üzere
    const key = `${bucket}:${runner}`;
    buckets.set(key, (buckets.get(key) ?? 0) + e.coins);
    out.accepted++;
  });
  if (buckets.size) {
    try {
      await store.addGifts(cycle, [...buckets].map(([k, c]) => { const [b, id] = k.split(':'); return [Number(b), Number(id), c]; }));
    } catch (err) {
      await store.forget(events.filter((_, i) => fresh[i]).map((e) => e.eventId)).catch(() => {}); // yeniden denenebilsin
      throw err;
    }
  }
  return out;
}
