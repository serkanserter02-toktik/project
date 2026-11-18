export const MAX_RUNNERS = 8;
export const LANE_W = 1.1;

// Koşucular = ülkeler (sıra numarası/forma numarası sabit). color: forma, pants: şort.
export const RUNNER_DEFS = [
  { name: 'Turkey', code: 'TR', color: 0xe4002b, fg: '#fff', hair: 0x2b1b12, pants: 0xf2f2f2 },
  { name: 'USA', code: 'US', color: 0x0a5fd8, fg: '#fff', hair: 0xf2c14e, pants: 0xc8102e },
  { name: 'Russia', code: 'RU', color: 0xf4f4f4, fg: '#1d2a44', hair: 0x5a3a22, pants: 0x0039a6 },
  { name: 'Germany', code: 'DE', color: 0x2a2a2a, fg: '#fff', hair: 0xd9a066, pants: 0xffce00 },
  { name: 'UK', code: 'GB', color: 0x1b2a6b, fg: '#fff', hair: 0x8a3b12, pants: 0xf2f2f2 },
  { name: 'Japan', code: 'JP', color: 0xff9ec4, fg: '#2b2b2b', hair: 0x111111, pants: 0xbc002d },
  { name: 'China', code: 'CN', color: 0xffd400, fg: '#2b2b2b', hair: 0x111111, pants: 0xde2910 },
  { name: 'South Korea', code: 'KR', color: 0x00b8c4, fg: '#fff', hair: 0x1a1a1a, pants: 0x1b2a41 },
];

export const cssColor = (hex) => '#' + hex.toString(16).padStart(6, '0');
