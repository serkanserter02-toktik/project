import { Sim } from './sim.js';
import { laneOrder } from './rng.js';
import { at, CYCLE, COUNTDOWN, RACE_SECONDS, RUNNERS } from './schedule.js';
import { scoreDelta, toRows } from './scoring.js';

const TWO_PI = Math.PI * 2;
const POLL_MS = 2000;

/**
 * İstemci tarafı oyun: yarış, gerçek saatten türetilen çizelge + deterministik simülasyonla burada hesaplanır.
 * Boost'lar TikTok hediyelerinden (jeton) gelir ve sunucuda toplanır; istemci yalnızca onları okur (tıklama/dokunma ile boost yok).
 * Sunucu (1) saat, (2) boost listesi ve (3) genel sıralama için çağrılır; hepsi hafif ve CDN'de önbelleklenir.
 */
export function createGame() {
  const sim = new Sim(RUNNERS);
  let offset = 0; // sunucu saati - yerel saat (ms)
  let synced = false;
  let ready = false;
  let apiOff = false; // /api yoksa (statik barındırma): boost gelmez, yarış yine akar
  let failures = 0;
  let resCache = null;

  const nowServer = () => Date.now() + offset;

  async function syncTime() {
    try {
      const t0 = Date.now();
      const res = await fetch('/api/time', { cache: 'no-store' });
      const t1 = Date.now();
      if (res.ok) offset = (await res.json()).t + (t1 - t0) / 2 - t1;
      else if (res.status === 404) apiOff = true;
    } catch { /* yerel saat kullanılır */ }
    synced = true;
  }
  syncTime();
  setInterval(syncTime, 5 * 60 * 1000);

  async function fetchBoosts(cycle) {
    if (apiOff) return true;
    try {
      const res = await fetch(`/api/boosts?c=${cycle}`);
      if (res.status === 404 || res.status === 503) { apiOff = true; return true; }
      if (!res.ok) throw new Error(String(res.status));
      if (sim.cycle === cycle) { const j = await res.json(); sim.setBoosts(j.list, j.per); }
      failures = 0;
      return true;
    } catch {
      failures++;
      return false;
    }
  }

  // Boost listesini yalnızca yarış sırasında, 2 sn'de bir (sekme görünürken) çek. BOOST_DELAY bu aralığa göre seçilmiştir.
  let tick = 0;
  setInterval(() => {
    if (document.hidden || apiOff || !ready) return;
    if (failures >= 3 && ++tick % 10) return; // art arda hatada seyrek dene
    const { cycle, t } = at(nowServer());
    const rt = t - COUNTDOWN;
    if (cycle === sim.cycle && rt > -1.5 && rt < RACE_SECONDS + 1) fetchBoosts(cycle);
  }, POLL_MS);

  function startCycle(cycle, rt) {
    sim.reset(cycle);
    laneOrder(cycle, RUNNERS, snap.lanes); // bu yarışın şerit dizilimi
    resCache = null;
    if (rt <= 0.5) { ready = true; return; } // yarış başında: yakalanacak geçmiş yok
    ready = false; // ortadan katılım: geçmiş boost'lar gelmeden simüle etme (sunucuyla aynı sonuç için)
    fetchBoosts(cycle).then(() => { if (sim.cycle === cycle) ready = true; });
  }

  // Sekme uzun süre gizli kaldıysa kaçırdığı boost'lar olabilir: bu yarışı baştan, tam listeyle yeniden kur
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt > 2000 && sim.cycle >= 0) startCycle(sim.cycle, 1);
    hiddenAt = 0;
  });

  const snap = {
    seq: 0, lanes: Array.from({ length: RUNNERS }, (_, i) => i), phase: 'waiting', n: RUNNERS, e: 0, d: RACE_SECONDS, w: 0, nx: null, f: null, age: 0,
    r: Array.from({ length: RUNNERS }, () => [0, 0, 0, 0, 0, 0, 0]), res: null,
  };

  return {
    /** Her karede çağrılır; senkron değilse null. Aynı nesneyi yeniden kullanır (GC'siz). */
    snapshot() {
      if (!synced) return null;
      const { cycle, t } = at(nowServer());
      if (cycle !== sim.cycle) startCycle(cycle, t - COUNTDOWN);
      if (!ready) return null;

      const rt = t - COUNTDOWN;
      sim.advanceTo(rt);
      const race = sim.race;
      const done = sim.done;

      snap.seq = cycle;
      snap.phase = rt < 0 ? 'countdown' : done ? 'waiting' : race.mode === 'racing' ? 'racing' : 'finishing';
      snap.e = Math.min(RACE_SECONDS, Math.max(0, rt));
      snap.w = Math.max(0, COUNTDOWN - t);
      snap.nx = snap.phase === 'countdown' ? COUNTDOWN - t : done ? CYCLE - t + COUNTDOWN : null;
      snap.f = race.finishDist;
      snap.age = done || rt < 0 ? 0 : Math.min(0.3, Math.max(0, rt - sim.time));
      if (done) snap.res = resCache ??= sim.results();
      else snap.res = null;

      for (let i = 0; i < RUNNERS; i++) {
        const x = race.racers[i], row = snap.r[i];
        row[0] = x.dist; row[1] = x.v; row[2] = x.phase % TWO_PI; row[3] = x.boostLevel;
        row[4] = x.coins;
        row[5] = x.rank;
        row[6] = x.boosts;
      }
      return snap;
    },

    /** Genel sıralama. cycle: az önce biten yarış (varsa sunucuya kaydettirir). Sunucu yoksa yerelde (localStorage) tutar. */
    async standings(cycle) {
      if (!apiOff) {
        try {
          const res = await fetch(`/api/standings${cycle != null ? `?c=${cycle}` : ''}`);
          if (res.ok) return await res.json();
          if (res.status === 404 || res.status === 503) apiOff = true;
        } catch { /* yerel yedek */ }
      }
      return localStandings(cycle, sim);
    },
  };
}

// ---- Yerel yedek (statik barındırma / depo yok): yalnızca bu tarayıcıda izlenen yarışlar
function localStandings(cycle, sim) {
  let st = { races: 0, totals: {}, last: -1 };
  try { st = JSON.parse(localStorage.getItem('bm.standings')) ?? st; } catch { /* boş başla */ }
  const res = cycle != null && sim.cycle === cycle ? sim.results() : null;
  if (res && cycle > st.last) {
    st.races++;
    st.last = cycle;
    for (const d of scoreDelta(res)) {
      const t = (st.totals[d.id] ??= { points: 0, wins: 0, podiums: 0, dist: 0, races: 0 });
      for (const f of ['points', 'wins', 'podiums', 'dist', 'races']) t[f] += d[f];
    }
    try { localStorage.setItem('bm.standings', JSON.stringify(st)); } catch { /* dolu/engelli */ }
  }
  return { races: st.races, rows: toRows(st.totals) };
}
