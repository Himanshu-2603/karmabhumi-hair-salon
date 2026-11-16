'use strict';
/*  GET  /api/day?date=YYYY-MM-DD   -> { date, customers: [...], removed: [...] }   (public, cached a few seconds)
    PUT  /api/day?date=YYYY-MM-DD   -> saves the day                                (admin)
    Self-booked customers (see /api/book) are merged in on every read.
    Optional: set env var ADMIN_PIN in Vercel to require a PIN for saving.  */
const { redis } = require('./_redis');
const { DAY_RE, TTL, clean, merge, keys, readBody, send } = require('./_common');

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const date = url.searchParams.get('date') || '';
    if (!DAY_RE.test(date)) return send(res, 400, { error: 'Bad date' });
    const k = keys(date);

    if (req.method === 'GET') {
      const [rawDay, rawInbox] = await redis(['MGET', k.day, k.inbox]);
      const day = merge(date, rawDay, rawInbox);
      /* admin asks with ?fresh=1 (never cached); customers share a 5-second edge cache */
      return send(res, 200, day, url.searchParams.get('fresh') ? 'no-store' : 'public, s-maxage=5, max-age=0');
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const pin = process.env.ADMIN_PIN;
      if (pin && String(req.headers['x-admin-pin'] || '') !== String(pin)) return send(res, 401, { error: 'Wrong or missing PIN' });
      const day = clean(date, await readBody(req));
      await redis(['SET', k.day, JSON.stringify(day), 'EX', String(TTL)]);
      await redis(['SADD', 'kbs:days', date]);
      return send(res, 200, day);
    }
    send(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    send(res, e.code === 503 ? 503 : 502, { error: e.message || 'Server error' });
  }
};
