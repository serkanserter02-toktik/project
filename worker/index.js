// Brick Marathon — TikTok hediye işçisi (kalıcı süreç). Vercel fonksiyonları kalıcı bağlantı tutamadığı için ayrı çalışır.
//   TikTok LIVE ─▶ (bu süreç: seri/yinelenen ayıklama, toplu gönderim, yeniden bağlanma) ─▶ Redis (ya da /api/tiktok) ─▶ uygulama
import http from 'node:http';
import { loadConfig } from './config.js';
import { log } from './log.js';

let cfg;
try { cfg = loadConfig(); } catch (err) { console.error(`Config error: ${err.message}`); process.exit(1); }

const { createSink } = await import('./sink.js');
const sink = await createSink(cfg);

const stats = { received: 0, sent: 0, accepted: 0, duplicates: 0, unmatched: 0, late: 0, dropped: 0, flushErrors: 0 };
const state = { source: 'starting', lastFlushOk: Date.now(), lastFlushError: null, unmatchedNames: new Set() };
let queue = [];

function enqueue(ev) {
  stats.received++;
  queue.push(ev);
  if (queue.length > cfg.maxQueue) { // sınırlı bellek: aşırı birikimde en eskiyi at
    const over = queue.length - cfg.maxQueue;
    queue.splice(0, over);
    stats.dropped += over;
  }
}

let flushing = false;
let backoff = 0;
let nextFlushAt = 0;
async function flush() {
  if (flushing || !queue.length || Date.now() < nextFlushAt) return;
  flushing = true;
  const batch = queue.splice(0, cfg.maxBatch);
  try {
    const out = await sink.send(batch);
    stats.sent += batch.length;
    for (const k of ['accepted', 'duplicates', 'unmatched', 'late']) stats[k] += out?.[k] ?? 0;
    for (const n of out?.unmatchedNames ?? []) state.unmatchedNames.add(n);
    state.lastFlushOk = Date.now();
    state.lastFlushError = null;
    backoff = 0;
  } catch (err) {
    stats.flushErrors++;
    state.lastFlushError = String(err?.message ?? err);
    const permanent = err?.status >= 400 && err?.status < 500 && err.status !== 429; // geçersiz istek/yetki: tekrar denemek işe yaramaz
    if (permanent) { stats.dropped += batch.length; log.error('batch dropped (permanent error)', { err: state.lastFlushError, size: batch.length }); }
    else {
      queue.unshift(...batch); // geçici hata: sıraya geri koy (olay kimlikleri yinelemeyi önler)
      backoff = Math.min(30000, backoff ? backoff * 2 : 1000);
      nextFlushAt = Date.now() + backoff;
      log.warn('flush failed, will retry', { err: state.lastFlushError, retryInMs: backoff, queued: queue.length });
    }
  } finally {
    flushing = false;
  }
}
const flushTimer = setInterval(flush, cfg.flushMs);

// Kaynak
const onStatus = (s) => { state.source = s; log.info('source status', { status: s }); };
let source;
if (cfg.source === 'mock') {
  source = (await import('./sources/mock.js')).createMockSource({ rate: cfg.mockRate }, { onGift: enqueue, onStatus });
} else {
  source = (await import('./sources/tiktok.js')).createTikTokSource(cfg, { onGift: enqueue, onStatus });
}
source.start();

// Sağlık: platform (Fly/Railway/K8s) bu uç noktayı yoklar
const health = () => {
  const flushStale = state.lastFlushError && Date.now() - state.lastFlushOk > 60000;
  const ok = !flushStale && state.source !== 'error';
  return { ok, source: state.source, sink: sink.kind, queued: queue.length, lastFlushError: state.lastFlushError, unmatchedGiftNames: [...state.unmatchedNames], stats };
};
const server = cfg.port
  ? http.createServer((req, res) => {
    if (req.url !== '/healthz') { res.writeHead(404).end(); return; }
    const h = health();
    res.writeHead(h.ok ? 200 : 503, { 'Content-Type': 'application/json' }).end(JSON.stringify(h));
  }).listen(cfg.port, () => log.info('health endpoint', { port: cfg.port }))
  : null;

const statsTimer = setInterval(() => log.info('stats', { ...stats, queued: queue.length, source: state.source, unmatchedGiftNames: [...state.unmatchedNames] }), 60000);

log.info('worker started', { source: cfg.source, sink: sink.kind, username: cfg.username || undefined });

// Düzgün kapanış: kaynağı durdur, kuyruğu boşalt
let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  log.info('shutting down', { signal, queued: queue.length });
  source.stop();
  clearInterval(flushTimer);
  clearInterval(statsTimer);
  nextFlushAt = 0;
  const deadline = Date.now() + 8000;
  while (queue.length && Date.now() < deadline) { await flush(); if (flushing) await new Promise((r) => setTimeout(r, 50)); }
  server?.close();
  process.exit(queue.length ? 1 : 0);
}
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => shutdown(s));
process.on('unhandledRejection', (err) => log.error('unhandled rejection', { err: String(err?.stack ?? err) }));
