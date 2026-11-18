// Kalıcı veri: Upstash/Vercel KV (Redis REST). Yerelde, Redis yoksa bellek içi yedek (yalnızca geliştirme için).
// Yazma hacmi düşük: hediyeler (saniye, koşucu) kovalarında toplanır, bir webhook isteği tek Redis çağrısıdır.
import { scoreDelta, toRows } from '../../src/scoring.js';
import { CONFIG_KEY, GIFT_ALIASES_KEY, parsePer, fallbackPer } from './config.js';

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const TTL = 60 * 60 * 24 * 7; // boost kayıtları 7 gün sonra silinir

async function redis(commands) {
  const res = await fetch(`${URL_}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  return (await res.json()).map((x) => x.result);
}

const redisStore = {
  kind: 'redis',
  /** gifts: [[bucket, runner, coins], ...] — (saniye, koşucu) başına jeton toplanır; tek istekte tüm yazmalar. */
  async addGifts(cycle, gifts) {
    const key = `gifts:${cycle}`;
    await redis([...gifts.map(([b, id, c]) => ['HINCRBY', key, `${b}:${id}`, c]), ['EXPIRE', key, TTL]]);
  },
  /** { per, list: [[id, at, jeton], ...] } — per: o yarışa sabitlenmiş "boost başına jeton". */
  async getBoosts(cycle) {
    const [flat, pinned] = await redis([['HGETALL', `gifts:${cycle}`], ['GET', `cfg:${cycle}`]]);
    const list = [];
    for (let i = 0; i < (flat?.length ?? 0); i += 2) {
      const [at, id] = flat[i].split(':');
      list.push([Number(id), Number(at), Number(flat[i + 1])]);
    }
    return { per: parsePer(pinned) ?? fallbackPer(), list };
  },
  /**
   * Webhook başlangıcı, TEK Redis çağrısı: olay kimliklerinden yenileri işaretle (tekrar eden webhook'lara karşı) ve
   * bu yarışın "boost başına jeton" değerini Redis yapılandırmasından (yoksa varsayılandan) sabitle.
   * Aynı çağrıda hediye adı eşleşme yapılandırmasını (Redis config:giftAliases) da okur.
   * Dönüş: { fresh: boolean[], per, aliases: ham JSON | null }
   */
  async begin(cycle, ids) {
    const pin = `local v = tonumber(redis.call('GET', KEYS[2])); if not v or v < 1 or v > 100000 or v ~= math.floor(v) then v = tonumber(ARGV[1]) end
redis.call('SET', KEYS[1], v, 'NX', 'EX', ARGV[2]); return redis.call('GET', KEYS[1])`;
    const res = await redis([
      ...ids.map((id) => ['SET', `ev:${id}`, 1, 'NX', 'EX', 3600]),
      ['EVAL', pin, 2, `cfg:${cycle}`, CONFIG_KEY, fallbackPer(), TTL],
      ['GET', GIFT_ALIASES_KEY],
    ]);
    return {
      fresh: res.slice(0, ids.length).map((r) => r === 'OK'),
      per: parsePer(res[ids.length]) ?? fallbackPer(),
      aliases: res[ids.length + 1] ?? null,
    };
  },
  /** Başarısız yazmada olay kimliklerini geri al (yeniden denenince yinelenen sayılmasın). */
  async forget(ids) { if (ids.length) await redis([['DEL', ...ids.map((id) => `ev:${id}`)]]); },
  /** true: yeni kaydedildi (toplamlar güncellendi), false: zaten kayıtlıydı. */
  async recordResult(cycle, results) {
    const [added] = await redis([['HSETNX', 'results', String(cycle), JSON.stringify(results)]]);
    if (!added) return false;
    const cmds = [['INCR', 'races']];
    for (const d of scoreDelta(results)) {
      for (const f of ['points', 'wins', 'podiums', 'dist', 'races']) cmds.push(['HINCRBY', 'totals', `${d.id}:${f}`, d[f]]);
    }
    await redis(cmds);
    return true;
  },
  async standings() {
    const [flat, races] = await redis([['HGETALL', 'totals'], ['GET', 'races']]);
    const totals = {};
    for (let i = 0; i < (flat?.length ?? 0); i += 2) {
      const [id, f] = flat[i].split(':');
      (totals[id] ??= { points: 0, wins: 0, podiums: 0, dist: 0, races: 0 })[f] = Number(flat[i + 1]);
    }
    return { races: Number(races) || 0, rows: toRows(totals) };
  },
};

const mem = { config: process.env.COINS_PER_BOOST, giftAliases: null, pin: new Map(), gifts: new Map(), seen: new Set(), results: new Map(), totals: {}, races: 0 };
const memoryStore = {
  kind: 'memory',
  async addGifts(cycle, gifts) {
    const m = mem.gifts.get(cycle) ?? mem.gifts.set(cycle, new Map()).get(cycle);
    for (const [b, id, c] of gifts) m.set(`${b}:${id}`, (m.get(`${b}:${id}`) ?? 0) + c);
  },
  async getBoosts(cycle) {
    const list = [...(mem.gifts.get(cycle) ?? [])].map(([k, c]) => { const [at, id] = k.split(':'); return [Number(id), Number(at), c]; });
    return { per: mem.pin.get(cycle) ?? fallbackPer(), list };
  },
  async forget(ids) { for (const id of ids) mem.seen.delete(id); },
  async begin(cycle, ids) {
    if (!mem.pin.has(cycle)) mem.pin.set(cycle, parsePer(mem.config) ?? fallbackPer());
    return { fresh: ids.map((id) => (mem.seen.has(id) ? false : (mem.seen.add(id), true))), per: mem.pin.get(cycle), aliases: mem.giftAliases ?? null };
  },
  async recordResult(cycle, results) {
    if (mem.results.has(cycle)) return false;
    mem.results.set(cycle, results);
    mem.races++;
    for (const d of scoreDelta(results)) {
      const t = (mem.totals[d.id] ??= { points: 0, wins: 0, podiums: 0, dist: 0, races: 0 });
      for (const f of ['points', 'wins', 'podiums', 'dist', 'races']) t[f] += d[f];
    }
    return true;
  },
  async standings() { return { races: mem.races, rows: toRows(mem.totals) }; },
};

// Vercel'de bellek yedeği güvenilmezdir (her çağrı farklı örnekte çalışabilir): Redis yoksa depo yok sayılır.
export const store = URL_ && TOKEN ? redisStore : process.env.VERCEL ? null : memoryStore;
