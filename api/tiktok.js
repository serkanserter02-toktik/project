import { send } from './_lib/http.js';
import { ingestGifts } from './_lib/tiktok.js';

const MAX_BODY = 64 * 1024;

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body; // Vercel gövdeyi önceden çözmüş olabilir
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw new Error('too large');
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
}

// POST /api/tiktok — hediye olayı webhook'u (TikTok'a bağlanan kalıcı işçi buraya iletebilir; işçi doğrudan Redis'e de yazabilir).
// Gövde: tek olay ya da { events: [...] }. Olay: { eventId, userId, giftName | runner, coins }.
// Kimlik doğrulama: x-webhook-secret = TIKTOK_WEBHOOK_SECRET (üretimde zorunlu).
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { ok: false }); }
  const secret = process.env.TIKTOK_WEBHOOK_SECRET;
  if (!secret && process.env.VERCEL) return send(res, 503, { ok: false, reason: 'webhook secret not configured' });
  if (secret && req.headers['x-webhook-secret'] !== secret) return send(res, 401, { ok: false });

  let body;
  try { body = await readJson(req); } catch { return send(res, 400, { ok: false, reason: 'bad body' }); }
  const events = Array.isArray(body?.events) ? body.events : body ? [body] : [];
  if (!events.length || events.length > 200) return send(res, 400, { ok: false, reason: 'events: 1..200' });
  const out = await ingestGifts(events);
  send(res, out.ok ? 200 : 503, out);
}
