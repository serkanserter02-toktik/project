// Ülke bayrakları: kodla çizilir (görsel dosyası yok). Yuvarlak rozet olarak hem 3D sahnede hem DOM'da kullanılır.
const S = 128;

function star(g, cx, cy, R, rot = -Math.PI / 2) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? R * 0.382 : R;
    const a = rot + (i * Math.PI) / 5;
    g[i ? 'lineTo' : 'moveTo'](cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  g.closePath();
  g.fill();
}
const fill = (g, c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const disc = (g, c, x, y, r) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
const line = (g, c, w, x1, y1, x2, y2) => { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };

const DRAW = {
  TR(g) {
    fill(g, '#e30a17', 0, 0, S, S);
    disc(g, '#fff', 52, 64, 28);
    disc(g, '#e30a17', 60, 64, 22.5);
    g.fillStyle = '#fff';
    star(g, 88, 64, 12, 0);
  },
  US(g) {
    for (let i = 0; i < 7; i++) fill(g, i % 2 ? '#fff' : '#b22234', 0, (i * S) / 7, S, S / 7 + 1);
    fill(g, '#3c3b6e', 0, 0, 62, 74);
    g.fillStyle = '#fff';
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) disc(g, '#fff', 14 + c * 17, 15 + r * 20, 3.6);
  },
  RU(g) {
    fill(g, '#fff', 0, 0, S, S / 3 + 1);
    fill(g, '#0039a6', 0, S / 3, S, S / 3 + 1);
    fill(g, '#d52b1e', 0, (2 * S) / 3, S, S / 3 + 1);
  },
  DE(g) {
    fill(g, '#000', 0, 0, S, S / 3 + 1);
    fill(g, '#dd0000', 0, S / 3, S, S / 3 + 1);
    fill(g, '#ffce00', 0, (2 * S) / 3, S, S / 3 + 1);
  },
  GB(g) {
    fill(g, '#012169', 0, 0, S, S);
    line(g, '#fff', 24, 0, 0, S, S); line(g, '#fff', 24, S, 0, 0, S);
    line(g, '#c8102e', 9, 0, 0, S, S); line(g, '#c8102e', 9, S, 0, 0, S);
    fill(g, '#fff', 0, 48, S, 32); fill(g, '#fff', 48, 0, 32, S);
    fill(g, '#c8102e', 0, 55, S, 18); fill(g, '#c8102e', 55, 0, 18, S);
  },
  JP(g) {
    fill(g, '#fff', 0, 0, S, S);
    disc(g, '#bc002d', 64, 64, 32);
  },
  CN(g) {
    fill(g, '#de2910', 0, 0, S, S);
    g.fillStyle = '#ffde00';
    star(g, 38, 42, 22);
    for (const [x, y] of [[74, 20], [88, 36], [88, 56], [74, 70]]) star(g, x, y, 7);
  },
  KR(g) {
    fill(g, '#fff', 0, 0, S, S);
    g.fillStyle = '#cd2e3a'; g.beginPath(); g.arc(64, 64, 25, Math.PI, 0); g.fill();
    g.fillStyle = '#0047a0'; g.beginPath(); g.arc(64, 64, 25, 0, Math.PI); g.fill();
    disc(g, '#cd2e3a', 51.5, 64, 12.5);
    disc(g, '#0047a0', 76.5, 64, 12.5);
    // dört köşede üçlü çizgiler (trigramlar, sadeleştirilmiş)
    for (const a of [-135, -45, 45, 135]) {
      const rad = (a * Math.PI) / 180, cx = 64 + 46 * Math.cos(rad), cy = 64 + 46 * Math.sin(rad);
      const nx = -Math.sin(rad), ny = Math.cos(rad), tx = Math.cos(rad), ty = Math.sin(rad);
      for (let k = -1; k <= 1; k++) {
        const ox = cx + tx * k * 7, oy = cy + ty * k * 7;
        line(g, '#111', 4, ox - nx * 11, oy - ny * 11, ox + nx * 11, oy + ny * 11);
      }
    }
  },
};

const cache = new Map();
/** Beyaz kenarlıklı yuvarlak bayrak (128×128 canvas). */
export function flagCanvas(code) {
  let c = cache.get(code);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.save();
  g.beginPath(); g.arc(S / 2, S / 2, 61, 0, Math.PI * 2); g.clip();
  DRAW[code]?.(g);
  g.restore();
  g.strokeStyle = '#fff'; g.lineWidth = 6;
  g.beginPath(); g.arc(S / 2, S / 2, 61, 0, Math.PI * 2); g.stroke();
  cache.set(code, c);
  return c;
}

/** DOM için `.fl-XX` sınıfları (arka plan görseli) — bir kez eklenir. */
export function injectFlagStyles(codes) {
  const el = document.createElement('style');
  el.textContent = codes.map((c) => `.fl-${c}{background-image:url(${flagCanvas(c).toDataURL()})  !important;background-size:cover !important;background-position:center !important;background-repeat:no-repeat !important}`).join('\n');
  document.head.appendChild(el);
}
