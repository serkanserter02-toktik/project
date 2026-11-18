// Sahte TikTok hediye akışı: gerçek entegrasyon gelene kadar hediye olaylarını webhook'a gönderir.
//   node scripts/mock-tiktok.mjs [url] [saniyede-olay]
// Ortam: TIKTOK_WEBHOOK_SECRET (sunucudakiyle aynı olmalı, ayarlıysa).
const url = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '') + '/api/tiktok';
const perSec = Number(process.argv[3]) || 2;
const secret = process.env.TIKTOK_WEBHOOK_SECRET;
const COINS = [1, 1, 1, 5, 5, 10, 30, 99, 299, 1000]; // tipik hediye değerleri: küçükler sık, büyükler nadir
// Hediye adları: ülke adları (farklı yazımlarla) + eşleşmeyen birkaç ad
const GIFTS = ['Turkey', 'Türkiye', 'USA', 'ABD', 'Russia', 'Rusya', 'Germany', 'Almanya', 'UK', 'England', 'Japan', 'Japonya', 'China', 'Çin', 'South Korea', 'Güney Kore', 'Rose', 'Galaxy'];
let n = 0;

async function tick() {
  const events = Array.from({ length: Math.max(1, Math.round(perSec * (0.5 + Math.random()))) }, () => ({
    eventId: `mock-${Date.now()}-${n++}`,
    userId: `viewer${Math.floor(Math.random() * 40)}`,
    giftName: GIFTS[Math.floor(Math.random() * GIFTS.length)], // hediye adı = ülke adı (bazıları eşleşmez: yok sayılır)
    coins: COINS[Math.floor(Math.random() * COINS.length)],
  }));
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(secret ? { 'x-webhook-secret': secret } : {}) },
      body: JSON.stringify({ events }),
    });
    console.log(res.status, JSON.stringify(await res.json()));
  } catch (err) {
    console.warn('gönderilemedi:', err.message);
  }
}
setInterval(tick, 1000);
console.log(`Mock TikTok akışı → ${url} (≈${perSec} olay/sn)`);
