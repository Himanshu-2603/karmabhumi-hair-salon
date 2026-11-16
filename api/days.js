'use strict';
/* GET /api/days -> { days: ["2026-11-06", ...], today, cutoff }  newest first (report date chips + month export).
   Also runs the once-a-day clean-up that deletes records outside the retention window. */
const { redis } = require('./_redis');
const { DAY_RE, todayKey, cutoffKey, cleanup, send } = require('./_common');

module.exports = async (req, res) => {
  try {
    const today = todayKey(), cutoff = cutoffKey(today);
    try { await cleanup(redis); } catch (e) { /* never block the list because of clean-up */ }
    const list = (await redis(['SMEMBERS', 'kbs:days'])) || [];
    const days = list.filter((d) => DAY_RE.test(d) && d >= cutoff).sort().reverse();
    send(res, 200, { days, today, cutoff });
  } catch (e) {
    send(res, e.code === 503 ? 503 : 502, { error: e.message || 'Server error' });
  }
};
