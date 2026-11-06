'use strict';
/* GET /api/days -> { days: ["2026-11-06", ...] } newest first (for the report date chips) */
const { redis } = require('./_redis');
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const list = (await redis(['SMEMBERS', 'kbs:days'])) || [];
    res.statusCode = 200;
    res.end(JSON.stringify({ days: list.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse() }));
  } catch (e) {
    res.statusCode = e.code === 503 ? 503 : 502;
    res.end(JSON.stringify({ error: e.message || 'Server error' }));
  }
};
