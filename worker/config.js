// Çalışma ortamı yapılandırması (yalnızca env). Geçersiz değerde açık hata verip başlamaz.
const int = (name, def, min, max) => {
  const raw = process.env[name];
  if (raw == null || raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be an integer in [${min}, ${max}] (got "${raw}")`);
  return n;
};

export function loadConfig(env = process.env) {
  const source = env.SOURCE === 'mock' ? 'mock' : 'tiktok';
  const username = (env.TIKTOK_USERNAME ?? '').replace(/^@/, '').trim();
  if (source === 'tiktok' && !username) throw new Error('TIKTOK_USERNAME is required (the streamer to listen to, without @)');

  const webhookUrl = env.WEBHOOK_URL?.trim() || null;
  const redis = Boolean((env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL) && (env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN));
  if (!webhookUrl && !redis) throw new Error('Set either KV_REST_API_URL + KV_REST_API_TOKEN (direct Redis writes) or WEBHOOK_URL (forward to /api/tiktok)');
  if (webhookUrl && !env.TIKTOK_WEBHOOK_SECRET) throw new Error('TIKTOK_WEBHOOK_SECRET is required with WEBHOOK_URL');

  return {
    source,
    username,
    signApiKey: env.TIKTOK_SIGN_API_KEY || undefined, // Euler Stream imzalama anahtarı (üretim için önerilir)
    sink: webhookUrl ? 'webhook' : 'direct',
    webhookUrl,
    webhookSecret: env.TIKTOK_WEBHOOK_SECRET,
    flushMs: int('FLUSH_MS', 500, 100, 10000),
    maxBatch: int('MAX_BATCH', 200, 1, 200), // /api/tiktok istek başına en çok 200 olay kabul eder
    maxQueue: int('MAX_QUEUE', 5000, 100, 100000),
    port: int('PORT', 8080, 0, 65535), // 0: sağlık uç noktası kapalı
    mockRate: int('MOCK_RATE', 3, 1, 100), // saniyede ortalama sahte hediye
    offlineRetryMs: int('OFFLINE_RETRY_MS', 30000, 1000, 600000), // yayıncı yayında değilken yeniden deneme aralığı
  };
}
