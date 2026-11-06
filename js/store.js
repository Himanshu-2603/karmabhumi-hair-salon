/* Storage layer + shared helpers. No server needed.
   - Default: browser localStorage (live-syncs across tabs/windows of the same browser).
   - Optional: Firebase Realtime Database over plain REST (live-syncs across devices). */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'checked' || k === 'value' || k === 'disabled') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach((c) => { if (c != null && c !== false) e.append(c); });
  return e;
}
const pad2 = (n) => String(n).padStart(2, '0');
const fmtTime = (iso) => iso
  ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase()
  : '—';
const fmtDate = (key) => { const [y, m, d] = key.split('-'); return `${d}-${m}-${y}`; };
const fmtLongDate = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};
const SCISSORS = `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="16" cy="48" r="8"/><circle cx="48" cy="48" r="8"/><path d="M21.5 42 L52 8M42.5 42 L12 8"/></svg>`;
const PHONE = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.6a1 1 0 0 1-.25 1z"/></svg>`;

const Store = (() => {
  const cfg = window.SALON || {};
  const fb = (cfg.firebaseUrl || '').trim().replace(/\/+$/, '');
  /* cloud = Firebase (optional) | api = this site's /api (Vercel + Upstash) | local = opened as a file */
  const mode = fb ? 'cloud' : (location.protocol === 'file:' ? 'local' : 'api');
  const PREFIX = 'kbs:day:';
  let isAdmin = false;

  const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
  const norm = (d, x) => {
    const customers = x && x.customers ? (Array.isArray(x.customers) ? x.customers : Object.values(x.customers)) : [];
    return { date: d, customers: customers.filter(Boolean) };
  };
  const httpErr = async (r) => {
    const j = await r.json().catch(() => ({}));
    const e = new Error(j.error || 'Server error'); e.code = r.status; return e;
  };
  const getPin = () => { try { return localStorage.getItem('kbs:pin') || ''; } catch { return ''; } };
  const setPin = (p) => { try { localStorage.setItem('kbs:pin', p); } catch {} };

  let bc = null;
  try { bc = new BroadcastChannel('kbs'); } catch {}

  async function get(d) {
    if (mode === 'api') {
      const r = await fetch(`/api/day?date=${d}${isAdmin ? '&fresh=1' : ''}`, { cache: 'no-store' });
      if (!r.ok) throw await httpErr(r);
      return norm(d, await r.json());
    }
    if (mode === 'cloud') {
      const r = await fetch(`${fb}/days/${d}.json`, { cache: 'no-store' });
      if (!r.ok) throw new Error('Cloud read failed');
      return norm(d, await r.json());
    }
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(PREFIX + d)); } catch {}
    return norm(d, raw);
  }
  async function write(day) {
    if (mode === 'api') {
      const r = await fetch(`/api/day?date=${day.date}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-pin': getPin() },
        body: JSON.stringify(day)
      });
      if (!r.ok) throw await httpErr(r);
      return;
    }
    if (mode === 'cloud') {
      const r = await fetch(`${fb}/days/${day.date}.json`, { method: 'PUT', body: JSON.stringify(day) });
      if (!r.ok) throw new Error('Cloud write failed');
      return;
    }
    localStorage.setItem(PREFIX + day.date, JSON.stringify(day));
    if (bc) bc.postMessage('changed');
  }

  /* saves run one after another; polls that overlap a save are ignored so the UI never jumps back */
  let queue = Promise.resolve(), inflight = 0, saveSeq = 0;
  function save(day) {
    saveSeq++; inflight++;
    const snap = JSON.parse(JSON.stringify(day));
    const p = queue.then(() => write(snap));
    queue = p.catch(() => {});
    return p.finally(() => { inflight--; saveSeq++; });
  }

  async function listDays() {
    if (mode === 'api') {
      try { const r = await fetch('/api/days', { cache: 'no-store' }); return r.ok ? (await r.json()).days || [] : []; }
      catch { return []; }
    }
    if (mode === 'cloud') {
      try {
        const r = await fetch(`${fb}/days.json?shallow=true`, { cache: 'no-store' });
        return Object.keys((await r.json()) || {}).sort().reverse();
      } catch { return []; }
    }
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) out.push(k.slice(PREFIX.length));
    }
    return out.sort().reverse();
  }

  /* Live subscription to TODAY (re-subscribes automatically at midnight). */
  function subscribeToday(onDay, onStatus = () => {}) {
    let date = todayKey(), stop = () => {}, last = '';
    const push = (day) => { const s = JSON.stringify(day); if (s !== last) { last = s; onDay(day); } };
    const refresh = async () => {
      const seq = saveSeq;
      try {
        const day = await get(date);
        if (inflight > 0 || seq !== saveSeq) return;
        push(day); onStatus(true);
      } catch (e) { onStatus(false, e); }
    };

    function start() {
      date = todayKey(); last = '';
      refresh();
      if (mode === 'cloud') {
        let es;
        try {
          es = new EventSource(`${fb}/days/${date}.json`);
          es.addEventListener('put', refresh);
          es.addEventListener('patch', refresh);
          es.onerror = () => onStatus(false);
          es.onopen = () => onStatus(true);
        } catch {}
        const poll = setInterval(refresh, 10000);
        stop = () => { if (es) es.close(); clearInterval(poll); };
      } else if (mode === 'api') {
        /* customers: new data every ~6s (server cache 5s). admin: every 15s. */
        const poll = setInterval(() => { if (!document.hidden) refresh(); }, isAdmin ? 15000 : 6000);
        stop = () => clearInterval(poll);
      } else {
        const onStorage = (e) => { if (!e.key || e.key === PREFIX + date) refresh(); };
        window.addEventListener('storage', onStorage);
        if (bc) bc.onmessage = refresh;
        const poll = setInterval(refresh, 1500);
        stop = () => { window.removeEventListener('storage', onStorage); clearInterval(poll); };
      }
    }
    start();
    setInterval(() => { if (todayKey() !== date) { stop(); start(); } }, 20000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  }

  return { mode, todayKey, get, save, listDays, subscribeToday, setPin, setAdmin: () => { isAdmin = true; } };
})();

/* Animated number */
function setNum(el, n) {
  const from = Number(el.dataset.v ?? el.textContent) || 0;
  el.dataset.v = n;
  if (from === n) { el.textContent = n; return; }
  el.textContent = n;
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}
