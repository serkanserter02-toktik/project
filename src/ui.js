import { RUNNER_DEFS, cssColor } from './config.js';
import { injectFlagStyles } from './flags.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmtCoins = (n) => (n >= 10000 ? Math.round(n / 1000) + 'K' : n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n));
const fmtTime = (s) => {
  s = Math.max(0, Math.ceil(s));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};

export function createUI({ getStandings }) {
  injectFlagStyles(RUNNER_DEFS.map((d) => d.code));
  const el = {
    hud: $('hud'), timeLeft: $('timeLeft'), progress: $('progress'), leaderName: $('leaderName'), leaderDist: $('leaderDist'),
    countdown: $('countdown'), banner: $('banner'), boosts: $('boosts'),
    results: $('results'), resTitle: $('resTitle'), rankList: $('rankList'), totalList: $('totalList'), resTabs: $('resTabs'), resBar: $('resBar'), tkTrack: $('tkTrack'), nextIn: $('nextIn'), conn: $('conn'),
  };
  let buttons = [];
  let phase = null;
  let seq = -1;
  const last = { time: '', leader: '', dist: '', progress: -1, count: null, next: -1 };

  function build(count) {
    el.boosts.replaceChildren();
    buttons = [];
    for (let i = 0; i < count; i++) {
      const d = RUNNER_DEFS[i];
      const b = document.createElement('div'); // dokunulamaz şerit rozeti: boost yalnızca TikTok hediyelerinden gelir
      b.className = 'boost';
      b.style.setProperty('--c', cssColor(d.color));
      b.style.setProperty('--fg', d.fg);
      b.innerHTML = `<span class="rk">${i + 1}</span><span class="flg fl fl-${d.code}"></span><b>${i + 1}</b><small class="cn">🪙 0</small><small class="bs">⚡ 0</small>`;
      el.boosts.appendChild(b);
      buttons.push({ b, rk: b.querySelector('.rk'), cn: b.querySelector('.cn'), bs: b.querySelector('.bs'), rank: i + 1, coins: 0, nb: 0, on: false });
    }
    phase = null; // sonraki sync'te durum yeniden uygulansın
  }

  function setCountdown(text) {
    if (text === last.count) return;
    last.count = text;
    el.countdown.hidden = text == null;
    if (text == null) return;
    el.countdown.textContent = text;
    el.countdown.classList.remove('pop');
    void el.countdown.offsetWidth;
    el.countdown.classList.add('pop');
  }

  // Sonuç sekmeleri: önce bu yarış, sonra kendiliğinden genel sonuç (kullanıcı dokunursa otomatik geçiş durur)
  let tabTimer = 0;
  let standingsReq = 0;
  function showTab(tab) {
    el.rankList.hidden = tab !== 'race';
    el.totalList.hidden = tab !== 'total';
    for (const b of el.resTabs.children) b.classList.toggle('on', b.dataset.tab === tab);
  }

  // Sonuç görünümleri süreli dönüşümlü gösterilir: bu yarış → genel → bu yarış ...
  const VIEW_MS = 8000;
  const PANEL_DELAY = matchMedia('(prefers-reduced-motion: reduce)').matches ? 3000 : 8000; // style.css'teki panel gecikmesi
  const barFill = el.resBar.firstElementChild;
  function cycle(tab, delay) {
    clearTimeout(tabTimer);
    showTab(tab);
    barFill.style.animation = 'none';
    void barFill.offsetWidth; // animasyonu yeniden başlat
    barFill.style.animation = `resBar ${VIEW_MS}ms linear ${delay}ms both`;
    tabTimer = setTimeout(() => cycle(tab === 'race' ? 'total' : 'race', 0), delay + VIEW_MS);
  }
  el.resTabs.addEventListener('click', (e) => {
    const t = e.target.closest('button')?.dataset.tab;
    if (t && !el.resBar.hidden) cycle(t, 0); // elle seçilen sekme kendi süresini yeniden başlatır
  });

  function renderStandings({ races, rows }) {
    el.totalList.replaceChildren(...rows.map(([id, pts, wins, podiums, dist], i) => {
      const d = RUNNER_DEFS[id];
      if (!d) return document.createComment('');
      const li = document.createElement('li');
      li.style.setProperty('--c', cssColor(d.color));
      const medal = ['🥇', '🥈', '🥉'][i] ?? i + 1;
      li.innerHTML = `<span class="no">${medal}</span><span class="dot fl fl-${d.code}"></span><span class="nm">${d.name} (#${id + 1})</span>` +
        `<span class="ds">${pts} pts<small>${wins} ${wins === 1 ? 'win' : 'wins'} · ${podiums} ${podiums === 1 ? 'podium' : 'podiums'}</small></span>`;
      return li;
    }));
    return races;
  }

  // Üst şerit: genel sonuç, soldan sağa kayan yazı. DOM yalnızca veri değişince yeniden kurulur.
  const TICKER_PX_PER_S = 55;
  let tickerKey = '';
  function renderTicker({ races, rows }) {
    const key = JSON.stringify([races, rows]);
    if (key === tickerKey) return;
    tickerKey = key;
    const copy = document.createElement('span');
    if (!races) {
      copy.textContent = 'No races yet — overall standings will appear here after the first race';
    } else {
      const head = document.createElement('span');
      head.textContent = `After ${races} ${races === 1 ? 'race' : 'races'}:`;
      copy.append(head);
      rows.forEach(([id, pts], i) => {
        const d = RUNNER_DEFS[id];
        if (!d) return;
        const it = document.createElement('span');
        it.style.setProperty('--c', cssColor(d.color));
        const medal = ['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`;
        it.innerHTML = `${medal} <i class="fl fl-${d.code}"></i>${d.name}<em>${pts} pts</em>`;
        copy.append(it);
      });
    }
    // Dikişsiz döngü için aynı içerik iki kez; hız sabit (px/sn), süre içerik genişliğinden
    el.tkTrack.replaceChildren(copy, copy.cloneNode(true));
    const w = Math.max(copy.getBoundingClientRect().width, 1);
    el.tkTrack.style.setProperty('--tk-dur', (w / TICKER_PX_PER_S).toFixed(1) + 's');
  }

  async function loadStandings(withRace, cycleId) {
    const req = ++standingsReq;
    try {
      const data = await getStandings(cycleId);
      if (req !== standingsReq) return;
      renderTicker(data);
      const races = renderStandings(data);
      if (!races) { el.resTabs.hidden = true; el.resBar.hidden = true; showTab('race'); return; }
      el.resTabs.children[1].textContent = `Overall (${races} ${races === 1 ? 'race' : 'races'})`;
      if (withRace) { el.resBar.hidden = false; cycle('race', PANEL_DELAY); }
    } catch { /* ağ hatası: yalnızca bu yarışın sonucu gösterilir */ }
  }

  function enter(s) {
    const p = s.phase;
    buttons.forEach((x, i) => { x.b.style.order = s.lanes[i]; }); // rozetler, bu yarışın şerit sırasına göre dizilir
    const inRace = p === 'racing' || p === 'finishing';
    el.hud.hidden = !inRace;
    // Kutlama sahnesi görünsün: "BİTTİ!" kutlama boyunca kalır, sıralama paneli CSS ile gecikmeli açılır
    el.banner.hidden = !(p === 'finishing' || (p === 'waiting' && s.res));
    el.boosts.hidden = p === 'waiting';
    el.results.hidden = p !== 'waiting';
    el.results.classList.toggle('late', p === 'waiting' && !!s.res);
    if (p !== 'countdown' && p !== 'racing') setCountdown(null);
    clearTimeout(tabTimer);
    if (p === 'waiting') {
      const hasRes = !!s.res;
      el.resTabs.hidden = !hasRes;
      el.resBar.hidden = true; // standings gelince (varsa) döngü başlar
      if (hasRes) {
        el.resTitle.textContent = '🏆 Standings';
        el.rankList.replaceChildren(...s.res.map(([id, dist], i) => {
          const d = RUNNER_DEFS[id];
          const li = document.createElement('li');
          li.style.setProperty('--c', cssColor(d.color));
          const medal = ['🥇', '🥈', '🥉'][i] ?? i + 1;
          li.innerHTML = `<span class="no">${medal}</span><span class="dot fl fl-${d.code}"></span><span class="nm">${d.name} (#${id + 1})</span><span class="ds">${Math.round(dist)} m</span>`;
          return li;
        }));
      } else {
        el.resTitle.textContent = 'Race starting';
        el.rankList.replaceChildren();
      }
      showTab(hasRes ? 'race' : 'total');
      loadStandings(hasRes, hasRes ? s.seq : null);
      last.next = -1;
    }
    last.time = ''; last.progress = -1;
  }

  loadStandings(false, null); // açılışta şeridi doldur

  return {
    build,
    setConnected(ok) { el.conn.hidden = ok; },
    setBar(left, width) {
      el.boosts.style.setProperty('--bar-left', left + 'px');
      el.boosts.style.setProperty('--bar-width', width + 'px');
    },
    /** Her karede çağrılır; DOM yalnızca değer değişince güncellenir. */
    sync(s, live, age) {
      if (s.phase !== phase || s.seq !== seq) { phase = s.phase; seq = s.seq; enter(s); }

      if (phase === 'countdown') {
        setCountdown(Math.max(1, Math.ceil(s.w - age)));
      } else if (phase === 'waiting') {
        const n = Math.max(0, Math.ceil((s.nx ?? 0) - age));
        if (n !== last.next) { last.next = n; el.nextIn.textContent = n; }
      } else {
        // racing / finishing
        const elapsed = Math.min(s.d, s.e + (phase === 'racing' ? age : 0));
        if (phase === 'racing') setCountdown(elapsed < 0.8 ? 'GO!' : null);
        const t = fmtTime(s.d - elapsed);
        if (t !== last.time) { last.time = t; el.timeLeft.textContent = t; }
        const p = Math.round((elapsed / s.d) * 500) / 500;
        if (p !== last.progress) { last.progress = p; el.progress.style.transform = `scaleX(${p})`; }

        let leader = live[0];
        for (let i = 0; i < s.n; i++) if (live[i].rank === 1) leader = live[i];
        const name = RUNNER_DEFS[leader.id].name;
        if (name !== last.leader) { last.leader = name; el.leaderName.textContent = name; }
        const dd = Math.floor(leader.dist) + ' m';
        if (dd !== last.dist) { last.dist = dd; el.leaderDist.textContent = dd; }

        for (let i = 0; i < s.n; i++) {
          const r = live[i], x = buttons[i];
          if (!x) continue;
          if (x.rank !== r.rank) { x.rank = r.rank; x.rk.textContent = r.rank; }
          const coins = Math.floor(r.coins);
          if (coins !== x.coins) { x.coins = coins; x.cn.textContent = '🪙 ' + fmtCoins(coins); }
          const nb = r.boosts;
          if (nb !== x.nb) { x.nb = nb; x.bs.textContent = '⚡ ' + fmtCoins(nb); }
          const on = r.boostLevel > 0.25;
          if (on !== x.on) { x.on = on; x.b.classList.toggle('boosting', on); }
        }
      }
    },
  };
}
