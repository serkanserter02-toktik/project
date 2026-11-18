// Hediyelerin gideceği yer. direct: Redis'e doğrudan (webhook çağrısı/ek gecikme yok); webhook: /api/tiktok'a POST.
export async function createSink(cfg) {
  if (cfg.sink === 'webhook') {
    return {
      kind: 'webhook',
      async send(events) {
        const res = await fetch(cfg.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-webhook-secret': cfg.webhookSecret },
          body: JSON.stringify({ events }),
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw Object.assign(new Error(`webhook ${res.status}`), { status: res.status });
        return res.json();
      },
    };
  }
  // Env doğrulandıktan SONRA içe aktarılır (store modülü env'i yükleme anında okur)
  const { store } = await import('../api/_lib/store.js');
  if (!store || store.kind !== 'redis') throw new Error('Direct sink needs a real Redis (KV_REST_API_URL / KV_REST_API_TOKEN)');
  const { ingestGifts } = await import('../api/_lib/tiktok.js');
  return {
    kind: 'direct',
    async send(events) {
      const out = await ingestGifts(events);
      if (!out.ok) throw new Error(out.reason ?? 'ingest failed');
      return out;
    },
  };
}
