import { RUNNER_DEFS } from './config.js';

// Hediye adı → koşucu (ülke). TikTok'ta hediyenin ADI ülke adı olarak yazılır ("Turkey", "Türkiye", "Rusya", ...).
// Eşleşme büyük/küçük harf, aksan (ü, ç, ş, ı, İ ...) ve noktalamadan bağımsızdır; ad içinde kelime olarak geçmesi yeter
// ("Turkey Flag" → Turkey). Ek eşleşmeler yapılandırmayla eklenir (env GIFT_ALIASES / Redis config:giftAliases).

/** Küçük harf, aksansız, yalnızca harf/rakam ve tek boşluk. */
export const normalizeName = (s) => String(s ?? '')
  .toLowerCase().replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();

// Varsayılan takma adlar (normalize edilmiş). Ülke adları ve kodları RUNNER_DEFS'ten gelir.
const DEFAULT_ALIASES = {
  TR: ['turkiye', 'turk', 'turkish'],
  US: ['usa', 'united states', 'america', 'abd', 'amerika'],
  RU: ['rusya'],
  DE: ['almanya', 'deutschland'],
  GB: ['uk', 'united kingdom', 'england', 'britain', 'great britain', 'ingiltere', 'birlesik krallik'],
  JP: ['japonya'],
  CN: ['cin'],
  KR: ['korea', 'guney kore', 'kore'],
};

/** Hedef: ülke kodu ("TR"), ülke adı ("Turkey"), ya da 1-8 arası koşucu numarası → koşucu indeksi (yoksa -1). */
export function resolveTarget(target) {
  if (typeof target === 'number' || /^\d+$/.test(String(target).trim())) {
    const n = Number(target);
    return n >= 1 && n <= RUNNER_DEFS.length ? n - 1 : -1;
  }
  const t = normalizeName(target);
  return RUNNER_DEFS.findIndex((d) => normalizeName(d.code) === t || normalizeName(d.name) === t);
}

/** Ek eşleşme JSON'unu ({ "Rose": "TR", "Lion": "Russia" }) güvenle ayrıştırır; bozuksa boş nesne. */
export function parseAliases(raw) {
  if (!raw) return {};
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

/** Eşleştirici üretir: (hediyeAdı) → koşucu indeksi ya da -1. extra: ek takma adlar (öncelikli). */
export function buildGiftMatcher(extra = {}) {
  const words = new Map(); // kelime öbeği → indeks (ad içinde geçebilir)
  const exact = new Map(); // tam eşleşme gerektirenler (kısa kodlar: yanlış pozitif olmasın)
  RUNNER_DEFS.forEach((d, i) => {
    words.set(normalizeName(d.name), i);
    exact.set(normalizeName(d.code), i);
    for (const a of DEFAULT_ALIASES[d.code] ?? []) words.set(a, i);
  });
  for (const [alias, target] of Object.entries(extra)) {
    const i = resolveTarget(target);
    const key = normalizeName(alias);
    if (i >= 0 && key) { words.set(key, i); exact.delete(key); }
  }
  const keys = [...words.keys()].sort((a, b) => b.length - a.length); // en uzun eşleşme önce
  return (giftName) => {
    const n = normalizeName(giftName);
    if (!n) return -1;
    if (exact.has(n)) return exact.get(n);
    const padded = ` ${n} `;
    for (const k of keys) if (padded.includes(` ${k} `)) return words.get(k);
    return -1;
  };
}
