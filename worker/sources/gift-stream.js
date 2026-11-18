// TikTok gift olaylarını (kütüphane biçimi) iç biçime çevirir ve hediye serilerini doğru sayar. Saf mantık: ağ yok, test edilebilir.
//   - seri hediye (giftDetails.giftType 1): yalnızca seri bitince (repeatEnd) final repeatCount ile BİR kez sayılır
//   - diğerleri: gelir gelmez bir kez
//   - seri repeatEnd gelmeden idleMs sessiz kalırsa (yayın koptu vb.) son bilinen değerle sayılır
export const STREAK_IDLE_MS = 6000;

export function toInternal(ev) {
  const gd = ev.giftDetails ?? {};
  const diamonds = Number(gd.diamondCount);
  const repeat = Number(ev.repeatCount) || 1;
  if (!(diamonds > 0)) return null; // değeri bilinmeyen hediye
  const user = ev.user ?? {};
  return {
    eventId: String(ev.common?.msgId ?? `${user.userId}:${ev.groupId}:${ev.giftId}:${repeat}`),
    userId: String(user.userId ?? user.uniqueId ?? ''),
    giftName: String(gd.giftName ?? ''),
    coins: Math.floor(diamonds * repeat),
  };
}

export function createGiftStream(onGift, { idleMs = STREAK_IDLE_MS, now = Date.now } = {}) {
  const streaks = new Map(); // groupId → { ev, last }
  const emit = (ev) => { const g = toInternal(ev); if (g) onGift(g); };
  return {
    handle(ev) {
      if (ev.giftDetails?.giftType !== 1) return emit(ev);
      const key = String(ev.groupId ?? `${ev.user?.userId}:${ev.giftId}`);
      if (ev.repeatEnd) { streaks.delete(key); return emit(ev); }
      streaks.set(key, { ev, last: now() });
    },
    /** Süresi dolan açık serileri sayar. */
    sweep() { const t = now(); for (const [k, s] of streaks) if (t - s.last > idleMs) { streaks.delete(k); emit(s.ev); } },
    /** Kapanışta açık serileri kaybetme. */
    flush() { for (const s of streaks.values()) emit(s.ev); streaks.clear(); },
  };
}
