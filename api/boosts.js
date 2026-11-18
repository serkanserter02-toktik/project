import { store } from './_lib/store.js';
import { send, query, nearCycle } from './_lib/http.js';

// GET /api/boosts?c=<döngü> — o yarışın boost listesi { per: boost başına jeton, list: [[koşucu, saniye, jeton], ...] }. 2 sn CDN önbelleği: yüzlerce izleyici tek fonksiyon çağrısına iner.
export default async function handler(req, res) {
  if (!store) return send(res, 503, { list: [], reason: 'no-store' });
  const c = Number(query(req).get('c'));
  if (!nearCycle(c)) return send(res, 400, { list: [] });
  send(res, 200, await store.getBoosts(c), 'public, s-maxage=2');
}
