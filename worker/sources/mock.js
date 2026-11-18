// Sahte kaynak: ülke adlı hediyeler üretir (gerçek bağlantı olmadan uçtan uca test için).
const GIFTS = ['Turkey', 'Türkiye', 'USA', 'ABD', 'Russia', 'Rusya', 'Germany', 'Almanya', 'UK', 'England', 'Japan', 'Japonya', 'China', 'Çin', 'South Korea', 'Güney Kore', 'Rose', 'Galaxy'];
const COINS = [1, 1, 1, 5, 5, 10, 30, 99, 299, 1000];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function createMockSource({ rate }, { onGift, onStatus }) {
  let timer = null;
  let n = 0;
  return {
    start() {
      onStatus('connected');
      timer = setInterval(() => {
        const k = Math.max(1, Math.round(rate * (0.5 + Math.random())));
        for (let i = 0; i < k; i++) {
          onGift({ eventId: `mock-${Date.now()}-${n++}`, userId: `viewer${Math.floor(Math.random() * 40)}`, giftName: pick(GIFTS), coins: pick(COINS) });
        }
      }, 1000);
    },
    stop() { clearInterval(timer); onStatus('stopped'); },
  };
}
