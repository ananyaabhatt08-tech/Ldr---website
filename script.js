const $ = id => document.getElementById(id);
const store = {
  get(k){ try { return localStorage.getItem(k); } catch { return null; } },
  set(k,v){ try { localStorage.setItem(k,v); } catch {} },
  del(k){ try { localStorage.removeItem(k); } catch {} }
};
const pick = arr => arr[Math.floor(Math.random()*arr.length)];

// Countdown
let cd = null;
try { cd = JSON.parse(store.get('cd')); } catch {}
function renderCd(){
  if(!cd){ $('cd-display').hidden = true; return; }
  $('cd-display').hidden = false;
  $('cd-title').textContent = cd.name || 'Until we meet';
  let diff = new Date(cd.date) - new Date();
  if(diff <= 0){
    $('cd-title').textContent = (cd.name || 'The day') + ' is here! 💞';
    diff = 0;
  }
  const s = Math.floor(diff/1000);
  $('cd-d').textContent = Math.floor(s/86400);
  $('cd-h').textContent = Math.floor(s%86400/3600);
  $('cd-m').textContent = Math.floor(s%3600/60);
  $('cd-s').textContent = s%60;
}
$('cd-form').addEventListener('submit', e => {
  e.preventDefault();
  cd = { name: $('cd-name').value.trim(), date: $('cd-date').value };
  store.set('cd', JSON.stringify(cd));
  renderCd();
});
$('cd-clear').addEventListener('click', () => { cd = null; store.del('cd'); renderCd(); });

// Together since
function renderSince(){
  const v = store.get('since');
  if(!v){ $('since-out').textContent = ''; return; }
  $('since-date').value = v;
  const days = Math.floor((new Date() - new Date(v))/864e5);
  $('since-out').textContent = days >= 0 ? `${days} days of loving each other, and counting. 💗` : '';
}
$('since-form').addEventListener('submit', e => {
  e.preventDefault();
  if($('since-date').value) store.set('since', $('since-date').value);
  renderSince();
});

// Time zones
const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['UTC'];
const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
for(const sel of [$('tz1'), $('tz2')]){
  for(const z of zones){ const o = document.createElement('option'); o.value = o.textContent = z; sel.appendChild(o); }
}
$('tz1').value = store.get('tz1') || local;
$('tz2').value = store.get('tz2') || (zones.includes('Europe/London') ? 'Europe/London' : local);
$('tz1-label').value = store.get('l1') || 'Me';
$('tz2-label').value = store.get('l2') || 'You';
for(const [id,k] of [['tz1','tz1'],['tz2','tz2'],['tz1-label','l1'],['tz2-label','l2']])
  $(id).addEventListener('change', () => { store.set(k, $(id).value); renderClocks(); });

function offsetMin(tz, d){
  const f = new Intl.DateTimeFormat('en-US',{timeZone:tz,hourCycle:'h23',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',second:'numeric'});
  const p = Object.fromEntries(f.formatToParts(d).map(x => [x.type, +x.value]));
  return (Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second) - d.getTime())/60000;
}
function renderClocks(){
  const now = new Date();
  for(const n of [1,2]){
    const tz = $('tz'+n).value;
    $('t'+n).textContent = now.toLocaleTimeString([], {timeZone:tz, hour:'2-digit', minute:'2-digit'});
    $('d'+n).textContent = now.toLocaleDateString([], {timeZone:tz, weekday:'long', month:'short', day:'numeric'});
  }
  const diff = (offsetMin($('tz2').value, now) - offsetMin($('tz1').value, now))/60;
  const a = $('tz1-label').value || 'You', b = $('tz2-label').value || 'Them';
  $('tz-diff').textContent = diff === 0 ? 'Same time zone!' :
    `${b} is ${Math.abs(diff)} hour${Math.abs(diff)===1?'':'s'} ${diff>0?'ahead of':'behind'} ${a}.`;
}

// Content
const dates = [
  'Cook the same recipe together on video call and rate each other\'s result.',
  'Watch a movie in sync and pause for commentary.',
  'Play an online co-op game or a classic like chess or Scrabble.',
  'Take a virtual museum tour, then pick favorites.',
  'Order each other\'s favorite takeout to your own door.',
  'Stargaze on call and find the same constellation.',
  'Do a 1,000-piece jigsaw puzzle online together.',
  'Write letters to open on your next visit.',
  'Walk and talk: each of you takes a stroll, then show each other the view.',
  'Make a shared playlist, one song at a time, with a reason for each.',
  'Do a "10 questions" night where you each answer honestly.',
  'Pick a spot on Google Maps and plan an imaginary trip there.',
  'Read the same book chapter and discuss it over tea.',
  'Dress up fancy and have a candlelit dinner over video.'
];
const questions = [
  'What was the best part of your day?',
  'What is a small thing that made you smile this week?',
  'Where do you want us to travel first, once we are together?',
  'What is your favorite memory of us so far?',
  'What do you miss most about being in the same place?',
  'If we had a free weekend tomorrow, what would we do?',
  'What song reminds you of me?',
  'What is something you are looking forward to?',
  'What is one thing I do that makes you feel loved?',
  'Describe our dream home in three sentences.',
  'What is something you have never told me about your childhood?',
  'What would a perfect lazy Sunday look like for us?'
];
const notes = [
  'Distance is just a number; you are still my favorite person.',
  'Every call with you is the best part of my day.',
  'I am counting down the days until I can hold your hand again.',
  'Thank you for choosing us, even from far away.',
  'Wherever you are is where my heart wants to be.',
  'Good morning, beautiful. I hope your day is as lovely as you are.',
  'I am so proud of you. Never forget that.',
  'Sleep well. I will see you in my dreams, and soon in real life.',
  'You make the miles feel small.'
];
function wire(btn, out, list){
  const go = () => { $(out).textContent = pick(list); };
  $(btn).addEventListener('click', go);
}
wire('date-btn','date-idea',dates);
wire('q-btn','q-out',questions);
wire('note-btn','note-out',notes);
$('q-out').textContent = pick(questions);
$('note-out').textContent = pick(notes);
$('note-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('note-out').textContent); $('note-copy').textContent = 'Copied!'; }
  catch { $('note-copy').textContent = 'Copy failed'; }
  setTimeout(() => $('note-copy').textContent = 'Copy', 1500);
});

renderCd(); renderSince(); renderClocks();
setInterval(() => { renderCd(); renderClocks(); }, 1000);
