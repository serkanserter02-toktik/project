import { store } from './_lib/store.js';
import { send, query, at } from './_lib/http.js';
import { cycleDoneAt } from '../src/schedule.js';
import { simulateCycle } from '../src/sim.js';

// GET /api/standings[?c=<biten döngü>] — genel sıralama.
// c verilirse ve o yarış bittiyse, sonuç sunucuda (boost kayıtlarından) yeniden hesaplanıp bir kez kaydedilir.
// İstemci sonucu bildirmez; yalnızca "şu yarış bitti" der, sonucu sunucu üretir (sahte sonuç yazılamaz).
export default async function handler(req, res) {
  if (!store) return send(res, 503, { races: 0, rows: [], reason: 'no-store' });
  const raw = query(req).get('c');
  let recorded = true;
  if (raw != null) {
    const c = Number(raw);
    const now = at(Date.now()).cycle;
    if (!Number.isInteger(c) || c > now || c < now - 3) return send(res, 400, { races: 0, rows: [] });
    if (Date.now() >= cycleDoneAt(c)) {
      const { per, list } = await store.getBoosts(c);
      await store.recordResult(c, simulateCycle(c, list, per));
    } else {
      recorded = false; // henüz bitmedi (saat farkı): bu yanıt önbelleğe alınmasın
    }
  }
  send(res, 200, await store.standings(), recorded ? 'public, s-maxage=10, stale-while-revalidate=20' : 'no-store');
}
