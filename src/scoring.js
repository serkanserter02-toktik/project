// Puanlama: sıraya göre puan. Sonuç satırı = [id, mesafe] (birinciden sonuncuya).
export const POINTS = [10, 8, 6, 5, 4, 3, 2, 1];

/** Bir yarışın toplamlara katkısı: [{ id, points, wins, podiums, dist, races }] */
export function scoreDelta(results) {
  return results.map(([id, dist], i) => ({
    id, points: POINTS[i] ?? 0, wins: i === 0 ? 1 : 0, podiums: i < 3 ? 1 : 0, dist: Math.round(dist), races: 1,
  }));
}

/** totals: { [id]: {points,wins,podiums,dist,races} } → sıralı satırlar [[id, puan, galibiyet, podyum, mesafe, yarış]] */
export function toRows(totals) {
  const rows = Object.entries(totals).map(([id, t]) => [Number(id), t.points, t.wins, t.podiums, t.dist, t.races]);
  rows.sort((a, b) => b[1] - a[1] || b[2] - a[2] || b[4] - a[4]);
  return rows;
}
