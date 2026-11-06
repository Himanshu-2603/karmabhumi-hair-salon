'use strict';
/*  GET  /api/day?date=YYYY-MM-DD   -> { date, customers: [...] }   (public, cached a few seconds)
    PUT  /api/day?date=YYYY-MM-DD   -> saves the day                (admin)
    Optional: set env var ADMIN_PIN in Vercel to require a PIN for saving.  */
const { redis } = require('./_redis');

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ['waiting', 'cutting', 'done'];
const iso = (v) => { if (!v) return null; const d = new Date(v); return isNaN(d) ? null : d.toISOString(); };

function clean(date, body) {
  const list = Array.isArray(body && body.customers) ? body.customers.slice(0, 500) : [];
  const customers = list.map((c, i) => ({
    id: String((c && c.id) || '').replace(/[^a-z0-9]/gi, '').slice(0, 24) || Math.random().toString(36).slice(2, 10),
    no: Number(c && c.no) > 0 ? Math.floor(Number(c.no)) : i + 1,
    name: String((c && c.name) || '').replace(/\s+/g, ' ').trim().slice(0, 40),
    status: STATUSES.includes(c && c.status) ? c.status : 'waiting',
    addedAt: iso(c && c.addedAt) || new Date().toISOString(),
    startedAt: iso(c && c.startedAt),
    doneAt: iso(c && c.doneAt)
  })).filter((c) => c.name);
  return { date, customers };
}
function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') { try { return Promise.resolve(JSON.parse(req.body)); } catch { return Promise.resolve({}); } }
    return Promise.resolve(req.body);
  }
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 200000) req.destroy(); });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}
function send(res, code, obj, cache) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache || 'no-store');
  res.end(JSON.stringify(obj));
}

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const date = url.searchParams.get('date') || '';
    if (!DAY_RE.test(date)) return send(res, 400, { error: 'Bad date' });
    const key = 'kbs:day:' + date;

    if (req.method === 'GET') {
      const raw = await redis(['GET', key]);
      let day = { date, customers: [] };
      if (raw) { try { day = clean(date, JSON.parse(raw)); } catch {} }
      /* admin asks with ?fresh=1 (never cached); customers share a 5-second edge cache */
      return send(res, 200, day, url.searchParams.get('fresh') ? 'no-store' : 'public, s-maxage=5, max-age=0');
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const pin = process.env.ADMIN_PIN;
      if (pin && String(req.headers['x-admin-pin'] || '') !== String(pin)) return send(res, 401, { error: 'Wrong or missing PIN' });
      const day = clean(date, await readBody(req));
      await redis(['SET', key, JSON.stringify(day)]);
      await redis(['SADD', 'kbs:days', date]);
      return send(res, 200, day);
    }
    send(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    send(res, e.code === 503 ? 503 : 502, { error: e.message || 'Server error' });
  }
};
