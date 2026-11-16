'use strict';
const S = window.SALON;
$('#logo').innerHTML = SCISSORS;
$('#title').textContent = S.name;
document.title = 'Admin — ' + S.name;
$('#openCustomer').onclick = () => window.open('index.html', '_blank');

Store.setAdmin();
let day = { date: Store.todayKey(), customers: [] };
let loaded = false;
const selected = new Set();
let info = S;

/* ---------- ui helpers ---------- */
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2000);
}
function ask({ title, text, input, ok = 'OK', cancel = 'Cancel' }) {
  return new Promise((resolve) => {
    const dlg = $('#dlg');
    const field = input !== undefined ? h('input', { value: input, maxlength: 40 }) : null;
    let settled = false;
    const finish = (v) => { if (settled) return; settled = true; dlg.close(); resolve(v); };
    const form = h('form', { onsubmit: (e) => { e.preventDefault(); finish(field ? field.value : true); } },
      h('h3', {}, title), text ? h('p', {}, text) : null, field,
      h('div', { class: 'btns' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => finish(null) }, cancel),
        h('button', { class: 'btn', type: 'submit' }, ok)));
    dlg.replaceChildren(form);
    dlg.oncancel = () => { settled = true; resolve(null); };
    dlg.showModal();
    if (field) field.select();
  });
}

/* ---------- data actions ---------- */
function commit() {
  render();
  if (day.date !== Store.todayKey()) return;
  saveNow();
}
function saveNow() {
  Store.save(day).catch(async (e) => {
    if (e && e.code === 401) {
      const pin = await ask({ title: 'Admin PIN', text: 'Enter the PIN to save changes.', input: '', ok: 'Unlock' });
      if (pin) { Store.setPin(pin.trim()); saveNow(); } else toast('Not saved — PIN needed');
    } else if (e && e.code === 503) toast('Storage not connected — see README (Upstash)');
    else toast('Could not save — check internet');
  });
}
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
function setStatus(c, status) {
  const now = new Date().toISOString();
  c.status = status;
  if (status === 'waiting') { c.startedAt = null; c.doneAt = null; }
  if (status === 'cutting') { c.startedAt = c.startedAt || now; c.doneAt = null; }
  if (status === 'done') { c.startedAt = c.startedAt || now; c.doneAt = now; }
}
function setMany(ids, status) {
  day.customers.forEach((c) => { if (ids.includes(c.id)) setStatus(c, status); });
  selected.clear(); commit();
}
$('#addForm').onsubmit = (e) => {
  e.preventDefault();
  if (!loaded) return;
  const name = $('#newName').value.replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!name) return;
  const no = day.customers.reduce((m, c) => Math.max(m, c.no || 0), 0) + 1;
  day.customers.push({ id: uid(), no, name, status: 'waiting', addedAt: new Date().toISOString(), startedAt: null, doneAt: null });
  $('#newName').value = ''; $('#newName').focus();
  commit(); toast('Added: ' + name);
};
async function rename(c) {
  const v = await ask({ title: 'Edit name', input: c.name, ok: 'Save' });
  if (v && v.trim()) { c.name = v.replace(/\s+/g, ' ').trim().slice(0, 40); commit(); toast('Updated'); }
}
async function remove(c) {
  const ok = await ask({ title: 'Delete customer?', text: `"${c.name}" will be removed from today's list.`, ok: 'Delete' });
  if (ok) {
    day.customers = day.customers.filter((x) => x.id !== c.id); selected.delete(c.id);
    day.removed = [...(day.removed || []), c.id].slice(-500);     /* so a self-booked name cannot come back */
    commit(); toast('Deleted');
  }
}
function move(c, dir) {
  const L = day.customers; const i = L.indexOf(c); let j = i + dir;
  while (j >= 0 && j < L.length && L[j].status !== 'waiting') j += dir;
  if (j >= 0 && j < L.length) { [L[i], L[j]] = [L[j], L[i]]; commit(); }
}
$('#bStart').onclick = () => setMany([...selected], 'cutting');
$('#bDone').onclick = () => setMany([...selected], 'done');
$('#bWait').onclick = () => setMany([...selected], 'waiting');
$('#bClear').onclick = () => { selected.clear(); render(); };

/* ---------- render ---------- */
function card(c, kind, idx, total) {
  const sel = selected.has(c.id);
  const t = kind === 'waiting' ? 'Arrived ' + fmtTime(c.addedAt)
    : kind === 'cutting' ? `Arrived ${fmtTime(c.addedAt)} · Started ${fmtTime(c.startedAt)}`
    : `Arrived ${fmtTime(c.addedAt)} · Done ${fmtTime(c.doneAt)}`;
  const acts = [];
  if (kind === 'waiting') {
    acts.push(h('button', { class: 'btn sm grow', onclick: () => setMany([c.id], 'cutting') }, '▶ Start'));
    acts.push(h('button', { class: 'ico', title: 'Move up', disabled: idx === 0, onclick: () => move(c, -1) }, '↑'));
    acts.push(h('button', { class: 'ico', title: 'Move down', disabled: idx === total - 1, onclick: () => move(c, 1) }, '↓'));
  } else if (kind === 'cutting') {
    acts.push(h('button', { class: 'btn sm grow', onclick: () => setMany([c.id], 'done') }, '✓ Done'));
    acts.push(h('button', { class: 'ico', title: 'Back to waiting', onclick: () => setMany([c.id], 'waiting') }, '↺'));
  } else {
    acts.push(h('button', { class: 'btn ghost sm grow', onclick: () => setMany([c.id], 'cutting') }, '↺ Reopen'));
  }
  acts.push(h('button', { class: 'ico', title: 'Edit', onclick: () => rename(c) }, '✎'));
  acts.push(h('button', { class: 'ico', title: 'Delete', onclick: () => remove(c) }, '✕'));
  return h('div', { class: `card ${kind}` + (sel ? ' sel' : ''), style: 'animation-delay:0s' },
    h('div', { class: 'top' },
      kind !== 'done' ? h('input', { class: 'chk', type: 'checkbox', checked: sel, onchange: (e) => { e.target.checked ? selected.add(c.id) : selected.delete(c.id); render(); } }) : null,
      h('div', { class: 'nm' }, h('span', {}, c.name), h('small', {}, t)),
      kind === 'waiting' ? h('span', { class: 'no pos' }, String(idx + 1)) : null),
    h('div', { class: 'acts' }, acts));
}
const fillCol = (box, nodes, msg) => box.replaceChildren(...(nodes.length ? nodes : [h('div', { class: 'col-empty' }, msg)]));

function render() {
  const list = day.customers;
  [...selected].forEach((id) => { if (!list.some((c) => c.id === id && c.status !== 'done')) selected.delete(id); });
  const cutting = list.filter((c) => c.status === 'cutting');
  const waiting = list.filter((c) => c.status === 'waiting');
  const done = list.filter((c) => c.status === 'done');

  $('#dateTxt').textContent = fmtDate(day.date);
  setNum($('#aTotal'), list.length); setNum($('#aCut'), cutting.length); setNum($('#aWait'), waiting.length); setNum($('#aDone'), done.length);
  $('#eCut').textContent = cutting.length; $('#eWait').textContent = waiting.length; $('#eDone').textContent = done.length;

  fillCol($('#lCut'), cutting.map((c, i) => card(c, 'cutting', i, cutting.length)), 'No one in the chair');
  fillCol($('#lWait'), waiting.map((c, i) => card(c, 'waiting', i, waiting.length)), 'No one waiting');
  fillCol($('#lDone'), done.slice().reverse().map((c, i) => card(c, 'done', i, done.length)), 'No one done yet');

  $('#bulk').classList.toggle('show', selected.size > 0);
  if (selected.size) $('#bulkCnt').textContent = selected.size + ' selected';
}

/* live data (also picks up changes from another admin tab / device) */
let warned = false;
Store.subscribeToday((d) => {
  const first = !loaded;
  day = d; loaded = true;
  if (first || !document.activeElement || !document.activeElement.closest('dialog')) render();
}, (ok, err) => {
  if (!ok && err && err.code === 503 && !warned) { warned = true; toast('Storage not connected — see README (Upstash)'); }
});

/* ---------- reports ---------- */
$('#repDate').value = Store.todayKey();
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthLabel = (m) => { const [y, mo] = m.split('-').map(Number); return `${MONTHS[mo - 1]} ${y}`; };
let allDays = [];

async function loadDays() {
  Store.pruneOld();                                   /* local / Firebase modes (the server cleans api mode itself) */
  allDays = await Store.listDays();
  $('#dayChips').replaceChildren(...allDays.slice(0, 14).map((d) =>
    h('button', { class: 'chip', onclick: () => { $('#repDate').value = d; showReport(); } }, fmtDate(d))));

  const months = [...new Set(allDays.map((d) => d.slice(0, 7)))].sort().reverse();
  const sel = $('#repMonth'), keep = sel.value;
  sel.replaceChildren(...(months.length ? months : [Store.todayKey().slice(0, 7)]).map((m) => h('option', { value: m }, monthLabel(m))));
  if (keep && months.includes(keep)) sel.value = keep;

  /* retention note */
  const t = Store.todayKey(), [ty, tm, td] = t.split('-').map(Number);
  const prev = tm === 1 ? `${ty - 1}-12` : `${ty}-${pad2(tm - 1)}`;
  const hasPrev = months.includes(prev), note = $('#keepNote');
  const lastDay = Store.GRACE_DAYS;
  if (td <= lastDay && hasPrev) {
    note.className = 'keep warn';
    note.textContent = `${monthLabel(prev)} records will be deleted automatically after ${lastDay} ${MONTHS[tm - 1]}. Please export them now.`;
  } else {
    note.className = 'keep';
    note.textContent = `Storage keeps ${monthLabel(t.slice(0, 7))} only. Last month's records stay until the ${lastDay}th of each month, then they are deleted automatically.`;
  }
}
loadDays(); setInterval(loadDays, 30000);

const summary = (s) => { const c = s.customers; const done = c.filter((x) => x.status === 'done').length; return { total: c.length, done, other: c.length - done }; };
async function getReport() {
  const d = $('#repDate').value;
  if (!d) { toast('Pick a date first'); return null; }
  return Store.get(d);
}
async function showReport() {
  const s = await getReport(); if (!s) return;
  const t = summary(s);
  $('#repSum').textContent = `${fmtLongDate(s.date)} — ${t.total} customers · ${t.done} done` + (t.other ? ` · ${t.other} not finished` : '');
  $('#repList').replaceChildren(...(s.customers.length ? s.customers.map((c) =>
    h('div', { class: 'card' + (c.status === 'done' ? ' done' : '') },
      h('div', { class: 'top' },
        h('div', { class: 'nm' }, h('span', {}, c.name), h('small', {}, `Arrived ${fmtTime(c.addedAt)} · Started ${fmtTime(c.startedAt)} · Done ${fmtTime(c.doneAt)}`))))) : [h('div', { class: 'col-empty' }, 'No data for this date')]));
}
$('#repShow').onclick = showReport;

function printDoc(title, kind, metaL, metaR, head, rows, docTitle, extraClass) {
  $('#print').replaceChildren(
    h('div', { class: 'ph' }, h('h1', {}, info.name), h('p', {}, kind)),
    h('div', { class: 'meta' }, h('span', {}, metaL), h('span', {}, metaR)),
    h('table', { class: extraClass || '' }, h('thead', {}, h('tr', {}, head.map((x) => h('th', {}, x)))), h('tbody', {}, rows)),
    h('div', { class: 'foot' }, `${info.owner} · ${info.phone} · Generated ${new Date().toLocaleString('en-IN')}`));
  const old = document.title; document.title = docTitle;
  setTimeout(() => { window.print(); document.title = old; }, 150);
}

$('#repPdf').onclick = async () => {
  const s = await getReport(); if (!s) return;
  if (!s.customers.length) { toast('No data for this date'); return; }
  const t = summary(s);
  const rows = s.customers.map((c) => h('tr', {}, h('td', {}, c.name), h('td', {}, fmtTime(c.addedAt)), h('td', {}, fmtTime(c.startedAt)), h('td', {}, fmtTime(c.doneAt)), h('td', {}, c.status.toUpperCase())));
  printDoc('', 'DAILY CUSTOMER REPORT', 'Date: ' + fmtLongDate(s.date),
    `Total: ${t.total}  |  Done: ${t.done}` + (t.other ? `  |  Not finished: ${t.other}` : ''),
    ['Customer', 'Arrived', 'Started', 'Done', 'Status'], rows, `${info.name} - ${fmtDate(s.date)}`);
};

/* ----- monthly export ----- */
async function loadMonth() {
  const m = $('#repMonth').value;
  const days = allDays.filter((d) => d.startsWith(m)).sort();
  if (!days.length) { toast('No data for this month'); return null; }
  toast('Preparing ' + monthLabel(m) + '…');
  const data = await Promise.all(days.map((d) => Store.get(d)));
  const rows = [];
  data.forEach((s) => s.customers.forEach((c) => rows.push({ date: s.date, ...c })));
  if (!rows.length) { toast('No customers in this month'); return null; }
  return { m, days: data.filter((s) => s.customers.length).length, rows };
}
$('#monPdf').onclick = async () => {
  const r = await loadMonth(); if (!r) return;
  const done = r.rows.filter((x) => x.status === 'done').length;
  const trs = r.rows.map((c) => h('tr', {}, h('td', {}, fmtDate(c.date)), h('td', {}, c.name), h('td', {}, fmtTime(c.addedAt)), h('td', {}, fmtTime(c.startedAt)), h('td', {}, fmtTime(c.doneAt)), h('td', {}, c.status.toUpperCase())));
  printDoc('', 'MONTHLY CUSTOMER REPORT', 'Month: ' + monthLabel(r.m),
    `Customers: ${r.rows.length}  |  Done: ${done}  |  Working days: ${r.days}`,
    ['Date', 'Customer', 'Arrived', 'Started', 'Done', 'Status'], trs, `${info.name} - ${monthLabel(r.m)}`, 'mon');
};
$('#monCsv').onclick = async () => {
  const r = await loadMonth(); if (!r) return;
  const esc = (v) => '"' + String(v).replace(/"/g, '""') + '"';
  const lines = [['Date', 'Customer', 'Arrived', 'Started', 'Done', 'Status'].map(esc).join(',')]
    .concat(r.rows.map((c) => [fmtDate(c.date), c.name, fmtTime(c.addedAt), fmtTime(c.startedAt), fmtTime(c.doneAt), c.status].map(esc).join(',')));
  const a = h('a', { href: URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })), download: `karmabhumi-${r.m}.csv` });
  document.body.append(a); a.click(); a.remove();
  toast('CSV downloaded');
};
