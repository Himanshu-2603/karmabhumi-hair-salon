'use strict';
/* Customer booking page: one name field -> save -> thank you -> live queue (index.html) */
const S = window.SALON;
document.title = 'Add your name — ' + S.name;
$('#crest').innerHTML = SCISSORS;
$('#callLink').href = 'tel:+91' + S.phone;
const mq = ['Welcome', 'Add your name', 'Relax & wait', 'We will call you', 'Premium grooming'];
$('#marquee').innerHTML = [...mq, ...mq, ...mq, ...mq].map((t) => `<span>${t}</span><i>✦</i>`).join('');

const REDIRECT_MS = 5000;
const form = $('#apForm'), input = $('#apName'), err = $('#apErr'), saveBtn = $('#apSave');
let attemptId = newId();       /* same id on retry => the server never adds a name twice */
let busy = false, redirectT = null, barT = null;

function newId() { return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-5); }
const cleanName = (v) => v.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
const meKey = () => 'kbs:me:' + Store.todayKey();
function setError(msg) { err.textContent = msg || ''; $('.ap-field').classList.toggle('bad', !!msg); }

input.addEventListener('input', () => { $('#apCount').textContent = input.value.length + '/40'; if (err.textContent) setError(''); });


/* friendly "people waiting" line (optional – hidden if it cannot load) */
Store.get(Store.todayKey()).then((day) => {
  const w = day.customers.filter((c) => c.status === 'waiting').length;
  const c = day.customers.filter((c) => c.status === 'cutting').length;
  $('#apNowTxt').textContent = w ? `${w} ${w === 1 ? 'customer is' : 'customers are'} waiting right now` : (c ? 'No one is waiting — you will be next' : 'No one is waiting — walk right in');
  $('#apNow').hidden = false;
}).catch(() => {});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (busy) return;
  const name = cleanName(input.value);
  if (!name) { setError('Please write your name.'); input.focus(); return; }
  if (name.length < 2) { setError('Name is too short.'); input.focus(); return; }
  if (!/[\p{L}\p{N}]/u.test(name)) { setError('Please use letters in your name.'); input.focus(); return; }

  busy = true; saveBtn.classList.add('loading'); saveBtn.disabled = true; setError('');
  try {
    const r = await Store.book(name, attemptId);
    const c = r.customer;
    try {
      localStorage.setItem('kbs:justAdded', JSON.stringify({ date: r.date || Store.todayKey(), id: c.id, no: c.no, name: c.name, addedAt: c.addedAt, ts: Date.now() }));
    } catch {}
    showThanks(c, r.ahead);
  } catch (ex) {
    const offline = !navigator.onLine || ex instanceof TypeError;
    setError(offline ? 'No internet. Please check your connection and tap Confirm again.'
      : ex && ex.code === 503 ? 'Booking is not available right now. Please tell the salon.'
      : (ex && ex.message) || 'Could not save. Please try again.');
    busy = false; saveBtn.classList.remove('loading'); saveBtn.disabled = false;
  }
});

function showThanks(c, ahead) {
  $('#formView').hidden = true; $('#thanksView').hidden = false;
  $('#thName').textContent = 'Thank you, ' + c.name.split(' ')[0] + '!';
  $('#thAhead').textContent = ahead;
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const t0 = Date.now(), bar = $('#thBar');
  barT = setInterval(() => {
    const p = Math.min(1, (Date.now() - t0) / REDIRECT_MS);
    bar.style.width = (p * 100) + '%';
    $('#thTxt').textContent = 'Opening the live queue in ' + Math.max(1, Math.ceil((REDIRECT_MS - (Date.now() - t0)) / 1000)) + 's…';
  }, 100);
  redirectT = setTimeout(() => { location.href = 'index.html'; }, REDIRECT_MS);
}

$('#thAnother').addEventListener('click', () => {
  clearTimeout(redirectT); clearInterval(barT);
  attemptId = newId(); input.value = ''; $('#apCount').textContent = '0/40';
  busy = false; saveBtn.classList.remove('loading'); saveBtn.disabled = false;
  $('#thanksView').hidden = true; $('#formView').hidden = false;
  input.focus();
});
