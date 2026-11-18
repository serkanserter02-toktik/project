import { at, CYCLE } from '../../src/schedule.js';

/** JSON yanıtı. cache: Cache-Control değeri (CDN/edge önbelleği sunucu yükünü düşürür). */
export function send(res, code, body, cache = 'no-store') {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache);
  res.end(JSON.stringify(body));
}

export const query = (req) => new URL(req.url, 'http://x').searchParams;

/** Geçerli bir döngü numarası mı (şimdikinin ±1'i)? */
export function nearCycle(c) {
  const now = at(Date.now()).cycle;
  return Number.isInteger(c) && Math.abs(c - now) <= 1;
}
export { at, CYCLE };
