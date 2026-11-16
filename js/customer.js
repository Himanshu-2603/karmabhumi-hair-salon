'use strict';
const S = window.SALON;

/* static content */
const words = S.name.split(' ');
$('#title').textContent = words[0];
$('#subtitle').textContent = words.slice(1).join(' ');
document.title = S.name + ' — Live Queue';
$('#crest').innerHTML = SCISSORS;
$('#callIco').innerHTML = PHONE; $('#fab').innerHTML = PHONE;
$('#owner').textContent = S.owner;
$('#phoneTxt').textContent = S.phone.replace(/(\d{5})(\d{5})/, '$1 $2');
$('#callBtn').href = $('#fab').href = 'tel:+91' + S.phone;
const mq = ['Precision cuts', 'Clean fades', 'Sharp styling', 'Classic shaves', 'Premium grooming'];
$('#marquee').innerHTML = [...mq, ...mq, ...mq, ...mq].map((t) => `<span>${t}</span><i>✦</i>`).join('');

const tick = () => { $('#clock').textContent = new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase(); };
tick(); setInterval(tick, 15000);

let current = null;

/* name added a moment ago on add_appointment.html: show it at once, even if the cached list is a few seconds behind */
function justAdded() {
  try {
    const j = JSON.parse(localStorage.getItem('kbs:justAdded') || 'null');
    if (!j || j.date !== current.date || Date.now() - j.ts > 90000) { if (j) localStorage.removeItem('kbs:justAdded'); return null; }
    return j;
  } catch { return null; }
}

function render() {
  if (!current) return;
  const list = current.customers.slice();
  const ja = justAdded();
  if (ja) {
    if (list.some((c) => c.id === ja.id)) { try { localStorage.removeItem('kbs:justAdded'); } catch {} }
    else list.push({ id: ja.id, no: ja.no, name: ja.name, status: 'waiting', addedAt: ja.addedAt, startedAt: null, doneAt: null });
  }
  const cutting = list.filter((c) => c.status === 'cutting');
  const waiting = list.filter((c) => c.status === 'waiting');
  const done = list.filter((c) => c.status === 'done');

  $('#date').textContent = fmtLongDate(current.date);
  setNum($('#sCut'), cutting.length); setNum($('#sWait'), waiting.length); setNum($('#sDone'), done.length);
  $('#cCut').textContent = cutting.length ? cutting.length + ' active' : '';
  $('#cWait').textContent = waiting.length ? waiting.length + ' pending' : '';
  document.title = `(${waiting.length} waiting) ${S.name}`;

  const cutBox = $('#cutting'); cutBox.replaceChildren();
  if (!cutting.length) cutBox.append(h('div', { class: 'empty' }, h('b', {}, 'No chair is busy'), waiting.length ? 'The next customer is about to start' : 'The salon is free — walk right in'));
  cutting.forEach((c) => {
    const sc = h('span', { class: 'sc' }); sc.innerHTML = SCISSORS;
    cutBox.append(h('div', { class: 'chair' },
      h('div', { class: 'nm' }, h('small', {}, 'In the chair'), c.name),
      h('div', { class: 'tm' }, 'Started', h('b', {}, fmtTime(c.startedAt))), sc));
  });

  const wBox = $('#waiting'); wBox.replaceChildren();
  if (!waiting.length) wBox.append(h('div', { class: 'empty' }, h('b', {}, 'No one waiting'), 'The line is empty right now'));
  waiting.forEach((c, i) => {
    wBox.append(h('div', { class: 'ticket', style: `animation-delay:${Math.min(i, 8) * 0.05}s` },
      h('div', { class: 'pos' }, String(i + 1)),
      h('div', { class: 'in' }, h('div', { class: 'nm' }, c.name), h('div', { class: 'sub' }, 'Arrived ' + fmtTime(c.addedAt))),
      i === 0 ? h('span', { class: 'next' }, 'Next') : null));
  });

  $('#doneLine').textContent = done.length ? `${done.length} ${done.length === 1 ? 'customer' : 'customers'} served today` : '';
}

Store.subscribeToday((day) => { current = day; render(); }, (ok) => {
  $('#live').classList.toggle('off', !ok);
  $('#liveTxt').textContent = ok ? 'Live' : 'Reconnecting';
});
