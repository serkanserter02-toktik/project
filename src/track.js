// Oval stadyum pisti: iki düz + iki viraj. Koşucular -z yönünde başlar, sola döner (saat yönünün tersi).
// Koordinatlar x/z düzleminde; psi = yön açısı (0 → -z). "Sağ" (dış) yön = (cos psi, -sin psi).
export const Rc = 28; // referans (orta) çizgi viraj yarıçapı
export const S = 70; // düzlük uzunluğu
export const LAP = 2 * S + 2 * Math.PI * Rc;

/** off: referans çizgiden yanal kayma (sağ = +). s: bu çizgi boyunca yay uzunluğu. s=0 → ana düzlüğün ortası. */
export function path(s, off, out) {
  const r = Rc + off;
  const L = 2 * S + 2 * Math.PI * r;
  let t = (((s + S / 2) % L) + L) % L;
  const arc = Math.PI * r;
  if (t < S) {
    out.x = r; out.z = S / 2 - t; out.psi = 0;
  } else if ((t -= S) < arc) {
    const a = t / r;
    out.x = r * Math.cos(a); out.z = -S / 2 - r * Math.sin(a); out.psi = a;
  } else if ((t -= arc) < S) {
    out.x = -r; out.z = -S / 2 + t; out.psi = Math.PI;
  } else {
    t -= S;
    const a = Math.PI + t / r;
    out.x = r * Math.cos(a); out.z = S / 2 - r * Math.sin(a); out.psi = a;
  }
  return out;
}

/** Koşucu konumu: ilerleme s referans çizgide, o kadar yanal kayma (tüm şeritler aynı kesitte kalır). */
export function lane(s, o, out) {
  path(s, 0, out);
  out.x += o * Math.cos(out.psi);
  out.z -= o * Math.sin(out.psi);
  return out;
}
