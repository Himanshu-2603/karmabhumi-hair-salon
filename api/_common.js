'use strict';
/* Shared helpers for the API (underscore = not a public route on Vercel).
   - salon time is India time (IST), no matter where the server runs
   - customers who book themselves are appended to a per-day "inbox" string (atomic APPEND),
     so they can never be lost by an admin save that happens at the same moment
   - retention: keep the current month; keep last month only for the first GRACE_DAYS days of a month */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ['waiting', 'cutting', 'done'];
const GRACE_DAYS = 7;                 /* last month stays visible until the 7th (deleted from the 8th) */
const TTL = 40 * 24 * 3600;           /* safety net: Redis drops any day key by itself after 40 days */

const pad = (n) => String(n).padStart(2, '0');
const istNow = () => new Date(Date.now() + 330 * 60 * 1000);
const todayKey = () => istNow().toISOString().slice(0, 10);

/* first date (YYYY-MM-DD) that must still be kept */
function cutoffKey(today) {
  const [y, m, d] = (today || todayKey()).split('-').map(Number);
  let cy = y, cm = m;
  if (d <= GRACE_DAYS) { cm -= 1; if (cm === 0) { cm = 12; cy -= 1; } }
  return `${cy}-${pad(cm)}-01`;
}

const iso = (v) => { if (!v) return null; const d = new Date(v); return isNaN(d) ? null : d.toISOString(); };
const cleanId = (v) => String(v || '').replace(/[^a-z0-9]/gi, '').slice(0, 24);
const cleanName = (v) => String(v || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);

function clean(date, body) {
  const list = Array.isArray(body && body.customers) ? body.customers.slice(0, 500) : [];
  const customers = list.map((c, i) => ({
    id: cleanId(c && c.id) || Math.random().toString(36).slice(2, 10),
    no: Number(c && c.no) > 0 ? Math.floor(Number(c.no)) : i + 1,
    name: cleanName(c && c.name),
    status: STATUSES.includes(c && c.status) ? c.status : 'waiting',
    src: c && c.src === 'customer' ? 'customer' : undefined,
    addedAt: iso(c && c.addedAt) || new Date().toISOString(),
    startedAt: iso(c && c.startedAt),
    doneAt: iso(c && c.doneAt)
  })).filter((c) => c.name);
  const removed = (Array.isArray(body && body.removed) ? body.removed : []).map(cleanId).filter(Boolean).slice(-500);
  return { date, customers, removed };
}

/* stored day + self-booked customers waiting in the inbox */
function merge(date, rawDay, rawInbox) {
  let day = { date, customers: [], removed: [] };
  if (rawDay) { try { day = clean(date, JSON.parse(rawDay)); } catch (e) { /* keep empty */ } }
  const seen = new Set(day.customers.map((c) => c.id));
  const gone = new Set(day.removed);
  String(rawInbox || '').split('\n').forEach((line) => {
    if (!line) return;
    let it; try { it = JSON.parse(line); } catch (e) { return; }
    const id = cleanId(it && it.id);
    if (!id || seen.has(id) || gone.has(id)) return;
    const name = cleanName(it.name);
    if (!name) return;
    seen.add(id);
    day.customers.push({
      id, no: Number(it.no) > 0 ? Math.floor(Number(it.no)) : day.customers.length + 1, name,
      status: 'waiting', src: 'customer', addedAt: iso(it.addedAt) || new Date().toISOString(), startedAt: null, doneAt: null
    });
  });
  return day;
}

const keys = (date) => ({ day: 'kbs:day:' + date, inbox: 'kbs:inbox:' + date, no: 'kbs:no:' + date });

/* delete everything older than the retention window (runs at most once a day) */
async function cleanup(redis) {
  const today = todayKey();
  if ((await redis(['GET', 'kbs:lastclean'])) === today) return 0;
  const cut = cutoffKey(today);
  const days = (await redis(['SMEMBERS', 'kbs:days'])) || [];
  let n = 0;
  for (const d of days) {
    if (DAY_RE.test(d) && d >= cut) continue;
    const k = keys(d);
    await redis(['DEL', k.day, k.inbox, k.no]);
    await redis(['SREM', 'kbs:days', d]);
    n++;
  }
  await redis(['SET', 'kbs:lastclean', today, 'EX', 172800]);
  return n;
}

function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') { try { return Promise.resolve(JSON.parse(req.body)); } catch (e) { return Promise.resolve({}); } }
    return Promise.resolve(req.body);
  }
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 200000) req.destroy(); });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}
function send(res, code, obj, cache) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache || 'no-store');
  res.end(JSON.stringify(obj));
}

module.exports = { DAY_RE, GRACE_DAYS, TTL, todayKey, cutoffKey, clean, cleanName, cleanId, merge, keys, cleanup, readBody, send };
