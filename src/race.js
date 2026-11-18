import { boostFor, BOOST_MAX_TIME } from './boost.js';

// Saf yarış mantığı (three.js'ten bağımsız). Tamamen deterministik: aynı tohum + aynı boost listesi
// her yerde (tarayıcı, sunucu) aynı sonucu verir; update() sabit STEP ile çağrılmalıdır.
export const STEP = 0.05;
const BASE_SPEED = 7;
export const STRIDE = 2.1; // rad / birim mesafe

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class Race {
  constructor() {
    this.racers = [];
    this.mode = 'idle'; // idle | racing | finishing | done
    this.elapsed = 0;
    this.duration = 0;
    this.results = [];
    this.finishDist = null; // bitiş kapısının mesafesi (süreye göre tahmin)
    this._finishFrozen = false;
    this.rng = Math.random;
    this._finishTimer = 0;
  }

  /** Koşucuları başlangıç çizgisine dizer; yarış go() ile başlar. */
  prepare(count, seconds, rng = Math.random) {
    this.rng = rng;
    this.racers = Array.from({ length: count }, (_, i) => ({
      id: i,
      dist: 0,
      speed: 0,
      v: 0,
      target: BASE_SPEED,
      nextChange: this._r(0.1, 0.8),
      skill: this._r(0.96, 1.04),
      boostTime: 0,
      boostGain: 0,
      coins: 0, // bu yarışta uygulanan toplam jeton
      boosts: 0, // bu yarışta tetiklenen boost sayısı
      carry: 0, // henüz bir boost'a yetmeyen jeton
      boostLevel: 0,
      phase: this._r(0, Math.PI * 2),
      rank: i + 1,
    }));
    this.elapsed = 0;
    this.duration = seconds;
    this.results = [];
    this.finishDist = null;
    this._finishFrozen = false;
    this.mode = 'idle';
  }

  go() {
    if (this.mode === 'idle' && this.racers.length) this.mode = 'racing';
  }

  _r(a, b) { return a + this.rng() * (b - a); }

  /**
   * Jeton hediyesi: jetonlar koşucuda birikir; her `per` jeton bir boost birimi eder (artan kısım sonraki hediyeye kalır).
   * Birim sayısı büyükse hız artışı ve süre büyür; üst üste gelenler süreyi uzatır.
   */
  gift(i, coins, per) {
    const r = this.racers[i];
    if (this.mode !== 'racing' || !r || !(coins > 0)) return false;
    r.coins += coins;
    r.carry += coins;
    const units = Math.floor(r.carry / per);
    if (!units) return false;
    r.carry -= units * per;
    r.boosts += units;
    const { gain, duration } = boostFor(units);
    r.boostGain = r.boostTime > 0 ? Math.max(r.boostGain, gain) : gain;
    r.boostTime = Math.min(BOOST_MAX_TIME, r.boostTime + duration);
    return true;
  }

  update(dt) {
    if (this.mode === 'idle' || this.mode === 'done') return;
    const rs = this.racers;
    const racing = this.mode === 'racing';

    if (racing) {
      this.elapsed += dt;
      if (this.elapsed >= this.duration) {
        this.elapsed = this.duration;
        const order = this._sorted();
        order.forEach((r, i) => { r.rank = i + 1; }); // final sıralama kesinleşir (kutlama bu sıraya göre)
        this.results = order.map((r) => ({ id: r.id, dist: r.dist }));
        this.mode = 'finishing';
        this._finishTimer = 1.2;
      }
    } else {
      this._finishTimer -= dt;
      if (this._finishTimer <= 0) {
        this.mode = 'done';
        for (const r of rs) { r.v = 0; r.speed = 0; r.boostLevel = 0; r.boostTime = 0; }
        return;
      }
    }

    let mean = 0;
    for (const r of rs) mean += r.dist;
    mean /= rs.length;

    // Bitiş kapısı: kalan süre 20 sn'nin altına inince, ortalama hıza göre grubun
    // süre bittiğinde olacağı yere konur; son 4 sn'de sabitlenir.
    const remaining = this.duration - this.elapsed;
    if (racing && !this._finishFrozen && remaining <= 20 && this.elapsed > 1) {
      const est = mean + (mean / this.elapsed) * remaining;
      this.finishDist = this.finishDist == null ? est : this.finishDist + (est - this.finishDist) * (1 - Math.exp(-2 * dt));
      if (remaining <= 4) this._finishFrozen = true;
    }

    const decay = Math.exp(-4 * dt);
    const ease = 1 - Math.exp(-2.5 * dt);
    for (const r of rs) {
      let v;
      if (this.mode === 'racing') {
        r.nextChange -= dt;
        if (r.nextChange <= 0) {
          r.target = BASE_SPEED * r.skill * this._r(0.82, 1.18);
          r.nextChange = this._r(0.7, 2.5);
        }
        r.speed += (r.target - r.speed) * ease;

        // Rubber-band: grubu çok dağıtmasın, kamera hepsini kadrajda tutsun
        const gap = r.dist - mean;
        let k = 1 - clamp(gap * 0.015, -0.1, 0.1);
        if (gap > 12) k *= 1 - clamp((gap - 12) * 0.15, 0, 0.85);
        else if (gap < -9) k *= 1 + clamp((-9 - gap) * 0.15, 0, 0.7);

        if (r.boostTime > 0) r.boostTime -= dt;
        const bt = r.boostTime > 0 ? 1 : 0;
        r.boostLevel += (bt - r.boostLevel) * (1 - Math.exp(-(bt ? 10 : 4) * dt));

        v = r.speed * k * (1 + r.boostGain * r.boostLevel);
      } else {
        r.speed *= decay;
        r.boostLevel *= decay;
        v = r.speed;
      }
      r.v = v;
      r.dist += v * dt;
      r.phase += v * STRIDE * dt;
    }

    if (this.mode === 'racing') {
      const order = this._sorted();
      for (let i = 0; i < order.length; i++) order[i].rank = i + 1;
    }
  }

  _sorted() {
    return [...this.racers].sort((a, b) => b.dist - a.dist);
  }
}
