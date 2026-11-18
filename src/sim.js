import { Race, STEP } from './race.js';
import { mulberry32, seedFor } from './rng.js';
import { RACE_SECONDS, RUNNERS, DEFAULT_COINS_PER_BOOST } from './schedule.js';

/**
 * Bir döngünün yarışını sabit adımlarla ilerleten deterministik simülasyon.
 * Boost'lar [id, at, jeton] (yarış saniyesi) olarak gelir; bir boost, at <= adım zamanı olan ilk adımda uygulanır.
 */
export class Sim {
  constructor(count = RUNNERS) {
    this.count = count;
    this.race = new Race();
    this.cycle = -1;
    this.steps = 0;
    this.pending = []; // henüz uygulanmamış boost'lar
    this.entries = new Map(); // anahtar → boost (tekrar uygulanmasın)
    this.per = DEFAULT_COINS_PER_BOOST; // boost başına jeton (sunucu, yarış başında sabitler)
  }

  reset(cycle) {
    this.cycle = cycle;
    this.steps = 0;
    this.pending.length = 0;
    this.entries.clear();
    this.race.prepare(this.count, RACE_SECONDS, mulberry32(seedFor(cycle)));
  }

  /**
   * Sunucudaki hediye listesinin tamamı: [[id, at, jeton], ...]; per = boost başına jeton (at: yarış saniyesi; aynı (at,id) için jeton toplamı büyüyebilir).
   * Henüz uygulanmamış olanlar eklenir/güncellenir; zamanı geçmiş yeni gelenler yok sayılır (geçmiş değişmez).
   */
  setBoosts(list, per = this.per) {
    this.per = per;
    const t = this.time;
    let added = false;
    for (const [id, at, coins] of list) {
      const key = `${at}:${id}`;
      let e = this.entries.get(key);
      if (!e) {
        if (at < t) continue;
        e = { id, at, coins, done: false };
        this.entries.set(key, e);
        this.pending.push(e);
        added = true;
      } else if (!e.done) e.coins = coins;
    }
    if (added) this.pending.sort((a, b) => a.at - b.at || a.id - b.id); // sıra, gelişten bağımsız deterministik
  }

  get time() { return this.steps * STEP; }
  get done() { return this.race.mode === 'done'; }

  /** Yarış saniyesi rt'ye kadar ilerlet (rt < 0: başlamadı). */
  advanceTo(rt) {
    if (rt < 0) return;
    if (this.race.mode === 'idle') this.race.go();
    const target = Math.floor(rt / STEP + 1e-9);
    while (this.steps < target && this.race.mode !== 'done') this._step();
  }

  _step() {
    const t = this.steps * STEP;
    const p = this.pending;
    while (p.length && p[0].at <= t) { const e = p.shift(); e.done = true; this.race.gift(e.id, e.coins, this.per); }
    this.race.update(STEP);
    this.steps++;
  }

  /** Sonuç satırları [[id, mesafe]] (birinciden sonuncuya); bitmediyse null. */
  results() {
    return this.done ? this.race.results.map((r) => [r.id, Math.round(r.dist * 10) / 10]) : null;
  }
}

/** Bir döngüyü baştan sona (sunucu tarafı) hesaplar. */
export function simulateCycle(cycle, boosts, per, count = RUNNERS) {
  const sim = new Sim(count);
  sim.reset(cycle);
  sim.setBoosts(boosts, per);
  sim.advanceTo(0);
  while (!sim.done) sim._step();
  return sim.results();
}
