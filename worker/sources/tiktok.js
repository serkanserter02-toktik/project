import { log } from '../log.js';
import { createGiftStream } from './gift-stream.js';

const BACKOFF = { min: 1000, max: 60000, stable: 60000 };

// Kütüphane hataları bazen nesne olarak gelir: okunur bir metne çevir
const describe = (err) => (typeof err === 'string' ? err : err?.message ?? err?.info ?? JSON.stringify(err) ?? String(err));
const isOffline = (err) => err?.name === 'UserOfflineError' || /offline|not online|isn.?t online|not.*live/i.test(describe(err));

/**
 * TikTok LIVE hediye kaynağı (tiktok-live-connector; resmî olmayan, tersine mühendislik).
 * Yeniden bağlanma: üstel bekleme + sapma; yayıncı yayında değilse sabit aralıkla yeniden dener.
 * Hediye serileri gift-stream.js'te sayılır.
 */
export function createTikTokSource(cfg, { onGift, onStatus }) {
  let stopped = false;
  let conn = null;
  let timer = null;
  let attempts = 0;
  let connectedAt = 0;
  const gifts = createGiftStream(onGift);
  const sweep = setInterval(() => gifts.sweep(), 2000);

  async function connect() {
    if (stopped) return;
    const { TikTokLiveConnection, WebcastEvent, ControlEvent } = await import('tiktok-live-connector');
    conn = new TikTokLiveConnection(cfg.username, { ...(cfg.signApiKey ? { signApiKey: cfg.signApiKey } : {}) });
    conn.on(WebcastEvent.GIFT, (ev) => gifts.handle(ev));
    conn.on(WebcastEvent.STREAM_END, () => { log.info('stream ended'); });
    conn.on(ControlEvent.DISCONNECTED, () => { onStatus('disconnected'); schedule(); });
    conn.on(ControlEvent.ERROR, (err) => log.warn('connection error', { err: describe(err) }));
    onStatus('connecting');
    try {
      const state = await conn.connect();
      connectedAt = Date.now();
      onStatus('connected');
      log.info('connected', { roomId: state?.roomId });
    } catch (err) {
      const offline = isOffline(err);
      log.warn(offline ? 'streamer is offline' : 'connect failed', { err: describe(err) });
      onStatus(offline ? 'offline' : 'error');
      schedule(offline);
    }
  }

  function schedule(offline = false) {
    if (stopped || timer) return;
    try { conn?.removeAllListeners?.(); conn?.disconnect?.(); } catch { /* zaten kapalı */ }
    conn = null;
    if (connectedAt && Date.now() - connectedAt > BACKOFF.stable) attempts = 0; // uzun süre sağlam bağlandıysa sayaç sıfırlanır
    connectedAt = 0;
    const base = offline ? cfg.offlineRetryMs : Math.min(BACKOFF.max, BACKOFF.min * 2 ** attempts++);
    const wait = Math.round(base * (0.75 + Math.random() * 0.5)); // sapma: toplu yeniden bağlanmayı dağıtır
    log.info('reconnecting', { inMs: wait, attempt: attempts });
    timer = setTimeout(() => { timer = null; connect().catch((e) => { log.error('connect crashed', { err: String(e) }); schedule(); }); }, wait);
  }

  return {
    start() { connect().catch((e) => { log.error('start failed', { err: describe(e) }); schedule(); }); },
    stop() {
      stopped = true;
      clearTimeout(timer);
      clearInterval(sweep);
      gifts.flush(); // yarım kalan serileri kaybetme
      try { conn?.disconnect?.(); } catch { /* ignore */ }
      onStatus('stopped');
    },
  };
}
