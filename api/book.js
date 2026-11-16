'use strict';
/*  POST /api/book   body: { id, name }   (public – used by add_appointment.html)
    Adds the customer to today's waiting list. Safe to call twice with the same id (no duplicates).
    -> { ok, date, customer: { id, no, name, addedAt }, ahead }                                    */
const { redis } = require('./_redis');
const { TTL, todayKey, cleanName, cleanId, merge, keys, cleanup, readBody, send } = require('./_common');

const MAX_PER_DAY = 400;      /* token counter ceiling per day */
const MAX_PER_HOUR_IP = 40;   /* generous: a salon's Wi-Fi shares one IP between many customers */

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  try {
    const body = await readBody(req);
    const name = cleanName(body && body.name);
    if (!name) return send(res, 400, { error: 'Please enter your name' });
    const id = cleanId(body && body.id) || Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

    const date = todayKey();
    const k = keys(date);

    /* same id again (double tap / retry) -> return the existing entry */
    const [rawDay0, rawInbox0] = await redis(['MGET', k.day, k.inbox]);
    const before = merge(date, rawDay0, rawInbox0);
    const existing = before.customers.find((c) => c.id === id);
    if (existing) {
      const ahead = before.customers.filter((c) => c.status === 'waiting').findIndex((c) => c.id === id);
      return send(res, 200, { ok: true, date, customer: { id, no: existing.no, name: existing.name, addedAt: existing.addedAt }, ahead: Math.max(ahead, 0) });
    }

    /* light spam guard */
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
    const rlKey = 'kbs:rl:' + ip.replace(/[^0-9a-f:.]/gi, '').slice(0, 45) + ':' + new Date().toISOString().slice(0, 13);
    const hits = await redis(['INCR', rlKey]);
    if (hits === 1) await redis(['EXPIRE', rlKey, '3700']);
    if (hits > MAX_PER_HOUR_IP) return send(res, 429, { error: 'Too many requests. Please ask the salon to add you.' });

    /* next token number (never lower than what is already stored) */
    let no = await redis(['INCR', k.no]);
    if (no > MAX_PER_DAY) return send(res, 429, { error: 'The list is full for today. Please call the salon.' });
    const maxStored = before.customers.reduce((m, c) => Math.max(m, c.no || 0), 0);
    if (no <= maxStored) { no = maxStored + 1; await redis(['SET', k.no, String(no), 'EX', String(TTL)]); }

    const customer = { id, no, name, addedAt: new Date().toISOString() };
    await redis(['APPEND', k.inbox, JSON.stringify(customer) + '\n']);   /* atomic – cannot clash with an admin save */
    await redis(['EXPIRE', k.inbox, String(TTL)]);
    await redis(['EXPIRE', k.no, String(TTL)]);
    await redis(['SADD', 'kbs:days', date]);
    try { await cleanup(redis); } catch (e) { /* ignore */ }

    const after = merge(date, rawDay0, (rawInbox0 || '') + JSON.stringify(customer) + '\n');
    const ahead = after.customers.filter((c) => c.status === 'waiting').findIndex((c) => c.id === id);
    send(res, 200, { ok: true, date, customer, ahead: Math.max(ahead, 0) });
  } catch (e) {
    send(res, e.code === 503 ? 503 : 502, { error: e.code === 503 ? 'Storage not connected' : 'Could not save. Please try again.' });
  }
};
