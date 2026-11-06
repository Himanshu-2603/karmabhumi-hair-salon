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
const meKey = () => 'kbs:me:' + (current ? current.date : '');
const getMe = () => { try { return localStorage.getItem(meKey()); } catch { return null; } };
const setMe = (id) => { try { id ? localStorage.setItem(meKey(), id) : localStorage.removeItem(meKey()); } catch {} render(); };

function render() {
  if (!current) return;
  const list = current.customers;
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
      h('span', { class: 'tag' }, '#' + pad2(c.no)),
      h('div', { class: 'nm' }, h('small', {}, 'In the chair'), c.name),
      h('div', { class: 'tm' }, 'Started', h('b', {}, fmtTime(c.startedAt))), sc));
  });

  const meId = getMe();
  const wBox = $('#waiting'); wBox.replaceChildren();
  if (!waiting.length) wBox.append(h('div', { class: 'empty' }, h('b', {}, 'No one waiting'), 'The line is empty right now'));
  waiting.forEach((c, i) => {
    wBox.append(h('div', { class: 'ticket' + (c.id === meId ? ' me' : ''), style: `animation-delay:${Math.min(i, 8) * 0.05}s`, onclick: () => setMe(c.id === meId ? null : c.id) },
      h('div', { class: 'pos' }, String(i + 1)),
      h('div', { class: 'in' }, h('div', { class: 'nm' }, c.name), h('div', { class: 'sub' }, 'Arrived ' + fmtTime(c.addedAt) + '  ·  Token #' + pad2(c.no))),
      i === 0 ? h('span', { class: 'next' }, 'Next') : null));
  });

  const meBox = $('#meBox'); meBox.replaceChildren();
  if (meId) {
    const me = list.find((c) => c.id === meId);
    if (me) {
      const wi = waiting.findIndex((c) => c.id === meId);
      let big, sub;
      if (me.status === 'waiting') {
        big = 'Your number is ' + (wi + 1);
        sub = wi === 0 ? "You're next — please get ready!" : `${wi} ${wi === 1 ? 'customer is' : 'customers are'} ahead of you` + (cutting.length ? ` (plus ${cutting.length} in the chair)` : '');
      } else if (me.status === 'cutting') { big = "You're in the chair"; sub = 'Started at ' + fmtTime(me.startedAt); }
      else { big = 'All done ✓'; sub = 'Thank you for visiting. See you again!'; }
      meBox.append(h('div', { class: 'me-card' },
        h('div', { class: 'eyebrow' }, me.name + '  ·  arrived ' + fmtTime(me.addedAt)),
        h('div', { class: 'big' }, big), h('p', {}, sub),
        h('button', { onclick: () => setMe(null) }, 'Clear')));
    } else { try { localStorage.removeItem(meKey()); } catch {} }
  }
  $('#doneLine').textContent = done.length ? `${done.length} ${done.length === 1 ? 'customer' : 'customers'} served today` : '';
}

Store.subscribeToday((day) => { current = day; render(); }, (ok) => {
  $('#live').classList.toggle('off', !ok);
  $('#liveTxt').textContent = ok ? 'Live' : 'Reconnecting';
});
