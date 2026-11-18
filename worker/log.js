// Yapılandırılmış (tek satır JSON) günlük: platform günlük toplayıcıları için uygun.
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const level = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;
const out = (lvl, msg, extra) => {
  if (LEVELS[lvl] > level) return;
  (lvl === 'error' || lvl === 'warn' ? console.error : console.log)(JSON.stringify({ t: new Date().toISOString(), level: lvl, msg, ...extra }));
};
export const log = { error: (m, e) => out('error', m, e), warn: (m, e) => out('warn', m, e), info: (m, e) => out('info', m, e), debug: (m, e) => out('debug', m, e) };
