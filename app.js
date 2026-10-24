const $ = s => document.querySelector(s);
function h(tag, props, ...kids){
  const e = document.createElement(tag);
  for (const [k,v] of Object.entries(props || {})) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of kids.flat()) { if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(c)); }
  return e;
}
const pick = a => a[Math.floor(Math.random() * a.length)];
const fmt = t => new Date(t).toLocaleString([], {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'});
const fmtDay = d => new Date(d + 'T00:00:00').toLocaleDateString([], {year:'numeric', month:'short', day:'numeric'});
const dayKey = () => new Date().toISOString().slice(0, 10);
const todayLocal = () => new Date().toLocaleDateString('en-CA');
function ago(t){
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return m + ' min ago';
  const hr = Math.floor(m / 60); if (hr < 24) return hr + ' hr ago';
  const d = Math.floor(hr / 24); return d + (d === 1 ? ' day ago' : ' days ago');
}

let db = null, userNs = null, room = null, dl = null, uid = null, prevSeen = null, seenWritten = false;
const S = {notes:[], movies:[], decisions:[], capsules:[], memories:[], bucket:[], thanks:[], spins:[], strokes:[], story:[],
  daily:{}, moods:{}, people:{}, pings:{}, g:{}, visit:null, ours:null, night:null, storyMeta:null, doodleMeta:null};
const names = {}, seen = new Set();
let curTab = 'home', curGame = 'ttt';

const PROMPTS = ['The best part of my day was…', 'Something small that made me think of you…', 'I am looking forward to…', 'One thing I want us to do when we are together…', 'Something I am proud of this week…', 'A memory of us that I replay…', 'Right now I wish you were here because…', 'Something I never told you about…'];
const DAILY = ['What is one thing that made you smile today?', 'What is a small habit of mine that you love?', 'Where would we go if we had a free weekend tomorrow?', 'What song would you put on our wedding playlist?', 'What is the first thing you want to do when we see each other?', 'What did you dream about last night?', 'What is something you are nervous about right now?', 'What was your favourite part of our last call?', 'If you could teleport me to you for one hour, what would we do?', 'What is a food you want to cook for me?', 'What is something new you learned this week?', 'Which of my messages do you reread?', 'What does an ideal ordinary Tuesday with me look like?', 'What are you most proud of lately?', 'What is a place that reminds you of us?', 'What is one thing you want us to try this month?', 'What is the kindest thing someone did for you recently?', 'What is a tiny thing that would make your week better?', 'What is your favourite photo of us, and why?', 'What would you say to us a year from now?', 'What is something you admire about the way I handle distance?', 'What nickname would you give our future home?', 'Which film should we never watch again?', 'What do you miss most about being in the same room?', 'What is a goal you want me to cheer you on for?', 'What is your comfort meal on a bad day?', 'What is a memory from childhood you want to tell me about?', 'What is one thing I could do to make you feel closer?', 'What are three words for how this week felt?', 'What are you grateful for today?'];
const WYR = [['Always be 10 minutes early', 'Always be 10 minutes late'], ['Live by the sea together', 'Live in the mountains together'], ['Only text for a month', 'Only call for a month'], ['A surprise visit tomorrow', 'A planned trip in a month'], ['Cook every meal together', 'Eat out every meal together'], ['Never see snow again', 'Never see the sun set again'], ['Travel the world for a year', 'Build our dream home in one'], ['Rewatch one favourite show forever', 'Never rewatch anything'], ['Write each other letters', 'Send each other voice notes'], ['Know the date we live together', 'Be surprised by it'], ['Our own tiny café', 'Our own tiny bookshop'], ['A dog together', 'A cat together'], ['Karaoke night', 'Board game night'], ['Breakfast in bed every Sunday', 'Dinner out every Friday'], ['A road trip with no plan', 'A trip planned to the minute'], ['Matching pyjamas, always', 'Matching sneakers, always']];
const KNOW = ['What is my go-to comfort food?', 'What is my biggest pet peeve?', 'What song do I play when I am happy?', 'What did I want to be when I was 10?', 'What is my dream holiday?', 'What am I most afraid of?', 'What is my favourite thing about myself?', 'What is the best gift I have ever received?', 'What do I do first when I wake up?', 'What is my guilty pleasure?', 'What was my first impression of you?', 'What is my favourite film of all time?'];
const WORDS = ['kiss', 'airplane', 'sunrise', 'postcard', 'video call', 'suitcase', 'snowman', 'pizza', 'lighthouse', 'guitar', 'bicycle', 'rainbow', 'balloon', 'passport', 'umbrella', 'campfire', 'cupcake', 'octopus'];
const PINGS = ['Thinking of you', 'Sending a hug', 'Sending a kiss', 'Miss you', 'Good morning', 'Goodnight'];
const MOODS = ['Glowing', 'Calm', 'Okay', 'Tired', 'Stressed', 'Lonely'];
const WHEELS = {
  date: {label:'Virtual date', items:['Cook the same recipe on video','Watch a movie in sync','Co-op game night','Virtual museum tour','Order takeout for each other','Stargaze on call','Online jigsaw puzzle','Write letters to open later','Walk and talk','Build a shared playlist']},
  irl: {label:'Date in person', items:['Cook something new together','Picnic in the park','Museum afternoon','Board game cafe','Sunset hike','Thrift challenge: $10 each','Bake something ridiculous','Photo-booth strips','Late-night drive and snacks','Pyjamas and a movie']},
  truth: {label:'Truth', items:['A fear you rarely admit?','Your happiest memory of us?','What did you think when we met?','Something you are shy to ask me?','A secret talent you have?','What do you miss most right now?','A dream you have not said aloud?','What made you fall for me?']},
  dare: {label:'Sweet dare', items:['Send a voice note singing a chorus','Draw me in 60 seconds','Write four lines about us','Show me your fridge','Do your best impression of me','Send a silly selfie','Tell me three things you love about me','Share your last camera roll photo']},
  dinner: {label:'Dinner', items:['Italian','Thai','Mexican','Indian','Japanese','Burgers','Breakfast for dinner','Surprise me']},
  topic: {label:'Call topic', items:['Dream trip','Childhood stories','Plans for next year','Goals this month','Songs and why','If we won the lottery','Our future home','A rant about my day']},
  cheer: {label:'Cheer me up', items:['Send a voice note','Share a funny video','Order me a treat','Three compliments','Plan a surprise call','Photo of something that reminded you of me','Sing a lullaby','Send a playlist']},
  gift: {label:'Surprise gift', items:['Handwritten letter by post','Coffee delivered to their door','Playlist with notes','Care package of snacks','Flowers delivered','A photo book','An online class together','Matching mugs']},
  genre: {label:'Genre', items:['Comedy','Thriller','Romance','Sci-fi','Animation','Documentary','Drama','Horror']},
  yesno: {label:'Yes or no', items:['Yes','No','Ask me nicely','Sleep on it']},
  list: {label:'Our watchlist', items:null},
  ours: {label:'Our own', items:null}
};

function nameOf(id){ return id === uid ? 'You' : (names[id] || 'Your person'); }
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 3200); }
async function write(fn){
  try { await fn(); return true; }
  catch (e) { toast(e && e.code === 'quota_exceeded' ? 'The journal is full. Delete something old first.' : 'Could not save that. Check your connection and try again.'); return false; }
}
const empty = (title, text) => h('div', {class:'empty'}, h('b', null, title), text);
function keep(root, fn){
  const vals = {}; root.querySelectorAll('input[id],textarea[id]').forEach(e => vals[e.id] = e.value);
  const ae = document.activeElement, aid = ae && root.contains(ae) ? ae.id : null, ss = aid ? ae.selectionStart : null;
  fn();
  for (const [id, v] of Object.entries(vals)) { const e = document.getElementById(id); if (e && e.value === '' && v) e.value = v; }
  if (aid) { const e = document.getElementById(aid); if (e) { e.focus(); try { e.setSelectionRange(ss, ss); } catch {} } }
}
function idsIn(o, out = new Set(), depth = 0){
  if (depth > 6 || o == null) return out;
  if (typeof o === 'string') { if (/^u_[A-Za-z0-9]{20,40}$/.test(o)) out.add(o); return out; }
  if (typeof o !== 'object') return out;
  for (const [k, v] of Object.entries(o)) { if (!Array.isArray(o)) idsIn(k, out, depth + 1); idsIn(v, out, depth + 1); }
  return out;
}
function partner(){ for (const id of Object.keys(S.people)) if (id !== uid) return id; const all = [...idsIn(S)].filter(i => i !== uid); return all[0] || null; }
const upsert = (path, exists, data) => exists ? db.doc(path).update(data) : db.doc(path).set(data);

/* ---- tabs ---- */
function showTab(name){
  if (!document.querySelector('[data-panel="' + name + '"]')) name = 'home';
  curTab = name;
  document.querySelectorAll('[data-panel]').forEach(p => p.hidden = p.dataset.panel !== name);
  document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  refresh();
  if (name === 'spin') drawWheel(rot);
  if (name === 'notes') renderBadges();
}
document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => { showTab(b.dataset.tab); try { history.replaceState(null, '', '#' + b.dataset.tab); } catch {} }));
function go(t){ showTab(t); try { history.replaceState(null, '', '#' + t); } catch {} window.scrollTo(0, 0); }

/* ---- header: stamp, presence ---- */
function renderStamp(){
  const v = S.visit, n = $('#stamp-n'), l = $('#stamp-l');
  if (!v || !v.date) { n.textContent = '–'; l.textContent = 'Next time we meet'; return; }
  const days = Math.ceil((new Date(v.date + 'T00:00:00') - new Date()) / 864e5);
  n.textContent = days > 0 ? days : (days === 0 ? 'Today' : 'Here');
  l.textContent = (days > 0 ? (days === 1 ? 'day until ' : 'days until ') : '') + (v.label || 'we meet') + (v.since ? ' · together ' + Math.max(0, Math.floor((Date.now() - new Date(v.since + 'T00:00:00')) / 864e5)) + ' days' : '');
}
$('#stamp-edit').addEventListener('click', () => {
  const v = S.visit || {};
  $('#v-label').value = v.label || ''; $('#v-date').value = v.date || ''; $('#v-since').value = v.since || '';
  $('#visit-form').hidden = false; $('#stamp-edit').hidden = true;
});
$('#v-cancel').addEventListener('click', () => { $('#visit-form').hidden = true; $('#stamp-edit').hidden = false; });
$('#visit-form').addEventListener('submit', async e => {
  e.preventDefault(); if (!db) return;
  const ok = await write(() => db.doc('meta/visit').set({label: $('#v-label').value.trim(), date: $('#v-date').value, since: $('#v-since').value}));
  if (ok) { $('#visit-form').hidden = true; $('#stamp-edit').hidden = false; }
});
const isHere = () => !!room && room.peers().some(p => !p.isMe && p.kind === 'viewer');
function renderHere(){
  const on = isHere();
  $('#dot').classList.toggle('on', on);
  $('#here-t').textContent = on ? 'Your person is here now' : (S.people[partner()] && S.people[partner()].lastSeen ? 'Last here ' + ago(S.people[partner()].lastSeen) : 'Not here right now');
}
function renderBadges(){
  const n = prevSeen == null ? 0 : S.notes.filter(x => x.by !== uid && x.at > prevSeen).length;
  const b = $('#b-notes'); b.hidden = !n || curTab === 'notes'; b.textContent = n;
}
function burstHearts(){
  const box = $('#hearts');
  for (let i = 0; i < 14; i++) {
    const s = h('span', null, '♥'); s.style.left = (Math.random() * 96) + '%'; s.style.animationDelay = (Math.random() * 0.8) + 's'; s.style.fontSize = (18 + Math.random() * 28) + 'px';
    box.append(s); setTimeout(() => s.remove(), 3600);
  }
}
async function sendPing(kind){
  if (!db) return;
  burstHearts();
  if (room) room.emit('ping', {kind}).catch(() => {});
  const p = S.pings[uid] || {};
  await write(() => db.doc('pings/' + uid).set({by: uid, kind, at: Date.now(), count: (p.count || 0) + 1}));
}

/* ---- HOME ---- */
function streakCount(){
  const done = d => { const a = (S.daily[d] || {}).answers || {}; return Object.keys(a).length >= 2; };
  let d = new Date(); if (!done(d.toISOString().slice(0, 10))) d.setUTCDate(d.getUTCDate() - 1);
  let n = 0;
  while (done(d.toISOString().slice(0, 10))) { n++; d.setUTCDate(d.getUTCDate() - 1); }
  return n;
}
function renderHome(){
  const box = $('#home'); const pid = partner();
  keep(box, () => {
    box.replaceChildren();
    /* away summary */
    const newNotes = prevSeen == null ? 0 : S.notes.filter(x => x.by !== uid && x.at > prevSeen).length;
    const pp = pid ? S.pings[pid] : null, newPing = pp && prevSeen != null && pp.at > prevSeen;
    if (newNotes || newPing) box.append(h('div', {class:'notice'}, 'While you were away: ', newNotes ? newNotes + (newNotes === 1 ? ' new note' : ' new notes') : '', newNotes && newPing ? ' and ' : '', newPing ? nameOf(pid) + ' sent "' + pp.kind.toLowerCase() + '" ' + ago(pp.at) : '', '.', ' ', newNotes ? h('button', {class:'t', type:'button', onclick: () => go('notes')}, 'Read') : null));
    /* row 1: here + ping, mood */
    const me = S.moods[uid], them = pid ? S.moods[pid] : null;
    const pingCard = h('div', {class:'card'},
      h('h3', null, 'Reach out'),
      h('div', {class:'big'}, isHere() ? 'They are here right now' : 'Send something small'),
      h('div', {class:'pings'}, PINGS.map(k => h('button', {class:'g', type:'button', onclick: () => sendPing(k)}, k))),
      pp ? h('div', {class:'sub'}, nameOf(pid) + ' last sent: ' + pp.kind + ' · ' + ago(pp.at)) : h('div', {class:'sub'}, 'Pings appear on their screen as hearts if they are here.'));
    const moodCard = h('div', {class:'card'},
      h('h3', null, 'How are you today?'),
      h('div', {class:'mood-btns'}, MOODS.map(m => h('button', {class:'g' + (me && me.mood === m && me.day === todayLocal() ? ' on' : ''), type:'button', onclick: () => write(() => db.doc('moods/' + uid).set({mood: m, note: (me && me.note) || '', at: Date.now(), day: todayLocal()}))}, m))),
      h('div', {class:'row'}, h('input', {id:'mood-note', maxlength:'80', placeholder:'One line about it (optional)', 'aria-label':'Mood note', value: me && me.day === todayLocal() ? me.note || '' : ''}),
        h('button', {class:'g', type:'button', onclick: () => { const v = $('#mood-note').value.trim(); write(() => db.doc('moods/' + uid).set({mood: (me && me.mood) || 'Okay', note: v, at: Date.now(), day: todayLocal()})); }}, 'Save')),
      them ? h('div', {class:'mt'}, h('span', {class:'sub'}, nameOf(pid) + ' · ' + (them.day === todayLocal() ? 'today' : ago(them.at))), h('div', {class:'big', style:'font-size:1.5rem'}, them.mood), them.note ? h('div', {class:'quote'}, them.note) : null) : h('div', {class:'sub mt'}, 'Their mood shows up here.'));
    box.append(h('div', {class:'grid'}, pingCard, moodCard));
    /* row 2: daily question, clocks */
    const key = dayKey(), qi = Math.floor(Date.now() / 864e5) % DAILY.length, dd = S.daily[key], ans = (dd && dd.answers) || {}, mine = ans[uid], both = Object.keys(ans).length >= 2;
    const daily = h('div', {class:'card'}, h('h3', null, 'Today\'s question'), h('div', {class:'big', style:'font-size:1.6rem'}, DAILY[qi]));
    if (!mine) daily.append(h('textarea', {id:'daily-a', maxlength:'400', style:'margin-top:10px', 'aria-label':'Your answer', placeholder:'Your answer stays hidden until they answer too'}),
      h('div', {class:'row mt'}, h('button', {class:'b', type:'button', onclick: () => { const v = $('#daily-a').value.trim(); if (v) write(() => upsert('daily/' + key, !!dd, {answers: {[uid]: v}})); }}, 'Submit answer')));
    else if (!both) daily.append(h('div', {class:'status mt'}, 'Locked in. Waiting for ' + (pid ? nameOf(pid) : 'your person') + '.'));
    else for (const id of Object.keys(ans)) daily.append(h('div', {class:'mt'}, h('span', {class:'sub'}, nameOf(id)), h('div', {class:'quote'}, ans[id])));
    const st = streakCount();
    daily.append(h('div', {class:'row mt'}, h('span', {class:'streak'}, String(st)), h('span', {class:'sub'}, st === 1 ? 'day in a row you both answered' : 'days in a row you both answered')));
    const myTz = Intl.DateTimeFormat().resolvedOptions().timeZone, theirTz = pid && S.people[pid] && S.people[pid].tz;
    const clockBox = (label, tz) => {
      const t = tz ? new Date().toLocaleTimeString([], {timeZone: tz, hour:'2-digit', minute:'2-digit'}) : '--:--';
      const hr = tz ? +new Date().toLocaleTimeString('en-GB', {timeZone: tz, hour:'2-digit', hour12:false}) : null;
      const note = hr == null ? '' : (hr >= 8 && hr < 21 ? 'Good time to call' : hr >= 21 && hr < 23 ? 'Getting late' : (hr >= 23 || hr < 7) ? 'Probably asleep' : 'Early morning');
      return h('div', null, h('div', {class:'sub'}, label), h('div', {class:'clock'}, t), h('div', {class:'sub'}, tz ? tz.replace('_', ' ') : 'Not shared yet'), h('div', {class:'chips'}, note ? h('span', {class:'chip'}, note) : null));
    };
    const clocks = h('div', {class:'card'}, h('h3', null, 'Right now, there and here'), h('div', {class:'clocks'}, clockBox('You', myTz), clockBox(pid ? nameOf(pid) : 'Your person', theirTz)));
    box.append(h('div', {class:'grid'}, daily, clocks));
    /* quick starts */
    box.append(h('div', {class:'card'}, h('h3', null, 'Do something together tonight'),
      h('div', {class:'row'}, h('button', {class:'b', type:'button', onclick: () => go('spin')}, 'Spin for a date'), h('button', {class:'g', type:'button', onclick: () => go('games')}, 'Play a game'), h('button', {class:'g', type:'button', onclick: () => go('movies')}, 'Pick a movie'), h('button', {class:'g', type:'button', onclick: () => go('notes')}, 'Write a note'))));
  });
}

/* ---- notes ---- */
$('#note-prompt').addEventListener('click', () => { const t = $('#note-text'); if (!t.value.trim()) t.value = pick(PROMPTS) + ' '; t.focus(); });
$('#note-form').addEventListener('submit', async e => {
  e.preventDefault(); if (!db) return;
  const text = $('#note-text').value.trim(); if (!text) return;
  const ok = await write(() => db.collection('notes').add({text, mood: $('#note-mood').value, by: uid, at: Date.now(), reacts: {}}));
  if (ok) { $('#note-text').value = ''; $('#note-mood').value = ''; }
});
function renderNotes(){
  const box = $('#note-list'); box.replaceChildren();
  if (!S.notes.length) box.append(empty('No notes yet', 'Write the first one above. Your person will see it when they open this page.'));
  for (const n of S.notes) {
    const mine = n.by === uid, hearts = Object.keys(n.reacts || {}).filter(k => n.reacts[k]), liked = hearts.includes(uid);
    box.append(h('article', {class:'letter' + (mine ? ' mine' : '') + (!mine && prevSeen != null && n.at > prevSeen ? ' new' : '')},
      h('div', {class:'meta'}, h('span', null, nameOf(n.by), n.mood ? ' · ' : '', n.mood ? h('span', {class:'mood'}, n.mood) : null), h('span', null, fmt(n.at))),
      h('p', null, n.text),
      h('div', {class:'row'},
        h('button', {class:'g' + (liked ? ' on' : ''), type:'button', 'aria-label':'Heart this note', onclick: () => write(() => db.doc('notes/' + n.id).update({reacts: {[uid]: !liked}}))}, '♥ ' + (hearts.length || '')),
        mine ? h('button', {class:'t', type:'button', onclick: () => write(() => db.doc('notes/' + n.id).delete())}, 'Delete') : null)));
  }
}
$('#cap-form').addEventListener('submit', async e => {
  e.preventDefault(); if (!db) return;
  const title = $('#cap-title').value.trim(), text = $('#cap-text').value.trim();
  if (!title || !text) { toast('Add a title and the letter.'); return; }
  const ok = await write(() => db.collection('capsules').add({title, text, unlock: $('#cap-date').value, by: uid, at: Date.now(), openedAt: 0}));
  if (ok) { $('#cap-title').value = ''; $('#cap-text').value = ''; $('#cap-date').value = ''; }
});
function renderCaps(){
  const box = $('#cap-list'); box.replaceChildren();
  if (!S.capsules.length) { box.append(empty('No sealed letters yet', 'Write one for a day they will need it.')); return; }
  const today = todayLocal();
  for (const c of S.capsules) {
    const mine = c.by === uid, locked = c.unlock && c.unlock > today;
    if (mine) box.append(h('div', {class:'seal'}, h('span', {class:'sub'}, 'You wrote this' + (c.unlock ? ' · locked until ' + fmtDay(c.unlock) : '') + (c.openedAt ? ' · opened ' + ago(c.openedAt) : ' · not opened yet')), h('div', {class:'big'}, c.title), h('div', {class:'quote'}, c.text), h('button', {class:'t', type:'button', onclick: () => write(() => db.doc('capsules/' + c.id).delete())}, 'Delete')));
    else if (locked) box.append(h('div', {class:'seal'}, h('span', {class:'sub'}, 'Sealed · from ' + nameOf(c.by)), h('div', {class:'big'}, c.title), h('span', {class:'sub'}, 'Opens on ' + fmtDay(c.unlock))));
    else if (!c.openedAt) box.append(h('div', {class:'seal'}, h('span', {class:'sub'}, 'Sealed · from ' + nameOf(c.by)), h('div', {class:'big'}, c.title), h('button', {class:'b', type:'button', onclick: () => write(() => db.doc('capsules/' + c.id).update({openedAt: Date.now()}))}, 'Open it')));
    else box.append(h('div', {class:'seal'}, h('span', {class:'sub'}, 'Opened · from ' + nameOf(c.by)), h('div', {class:'big'}, c.title), h('div', {class:'quote'}, c.text)));
  }
}

/* ---- movies ---- */
$('#movie-form').addEventListener('submit', async e => {
  e.preventDefault(); if (!db) return;
  const title = $('#m-title').value.trim(); if (!title) return;
  const ok = await write(() => db.collection('movies').add({title, kind: $('#m-kind').value, by: uid, at: Date.now(), likes: {}, watched: false, ratings: {}}));
  if (ok) $('#m-title').value = '';
});
const likedBy = m => Object.keys(m.likes || {}).filter(k => m.likes[k]);
function renderMovies(){
  const todo = S.movies.filter(m => !m.watched), done = S.movies.filter(m => m.watched);
  const tb = $('#m-todo'), dn = $('#m-done'); tb.replaceChildren(); dn.replaceChildren();
  if (!todo.length) tb.append(empty('The list is empty', 'Add a movie or series you both want to see.'));
  for (const m of todo) {
    const l = likedBy(m), im = l.includes(uid);
    tb.append(h('div', {class:'film'},
      h('div', null, h('div', {class:'t1'}, m.title), h('div', {class:'sub'}, m.kind + ' · added by ' + nameOf(m.by)),
        l.length ? h('div', {class:'chips'}, l.map(id => h('span', {class:'chip'}, id === uid ? "You're in" : nameOf(id) + ' is in'))) : null),
      h('div', {class:'acts'},
        h('button', {class:'g' + (im ? ' on' : ''), type:'button', onclick: () => write(() => db.doc('movies/' + m.id).update({likes: {[uid]: !im}}))}, im ? "I'm in" : 'Count me in'),
        h('button', {class:'g', type:'button', onclick: () => write(() => db.doc('movies/' + m.id).update({watched: true, watchedAt: Date.now()}))}, 'Watched'),
        m.by === uid ? h('button', {class:'t', type:'button', onclick: () => write(() => db.doc('movies/' + m.id).delete())}, 'Remove') : null)));
  }
  if (!done.length) dn.append(empty('Nothing watched yet', 'Mark a title as watched and rate it.'));
  for (const m of done) {
    const r = m.ratings || {}, mine = r[uid] || 0;
    dn.append(h('div', {class:'film'},
      h('div', null, h('div', {class:'t1'}, m.title), h('div', {class:'sub'}, m.kind),
        h('div', {class:'chips'}, Object.keys(r).filter(k => r[k]).map(id => h('span', {class:'chip'}, nameOf(id) + ': ' + r[id] + '/5')))),
      h('div', {class:'acts'},
        h('div', {class:'stars', role:'group', 'aria-label':'Your rating'}, [1,2,3,4,5].map(n => h('button', {class:'g' + (mine >= n ? ' on' : ''), type:'button', 'aria-label': n + ' of 5', onclick: () => write(() => db.doc('movies/' + m.id).update({ratings: {[uid]: n}}))}, String(n)))),
        h('button', {class:'t', type:'button', onclick: () => write(() => db.doc('movies/' + m.id).update({watched: false}))}, 'Put back'))));
  }
  const nt = S.night, show = $('#night-show');
  if (nt && nt.when) {
    const ms = new Date(nt.when) - Date.now(), d = Math.floor(ms / 864e5), hr = Math.floor(ms % 864e5 / 36e5);
    show.textContent = (nt.title || 'Movie night') + (ms > 0 ? ' · in ' + (d ? d + 'd ' : '') + hr + 'h' : ' · ' + fmt(nt.when));
  } else show.textContent = 'Not planned yet';
}
$('#m-pick').addEventListener('click', () => {
  const todo = S.movies.filter(m => !m.watched);
  if (!todo.length) { $('#m-picked').textContent = 'Add something first'; $('#m-picked-why').textContent = ''; return; }
  const both = todo.filter(m => likedBy(m).length >= 2), pool = both.length ? both : todo;
  $('#m-picked').textContent = pick(pool).title;
  $('#m-picked-why').textContent = both.length ? 'Picked from titles you are both in for' : 'Picked from the whole list';
});
$('#night-form').addEventListener('submit', async e => {
  e.preventDefault(); if (!db) return;
  await write(() => db.doc('meta/night').set({title: $('#n-title').value.trim(), when: $('#n-when').value}));
});
let syncTimer = null;
function startSync(){
  clearInterval(syncTimer);
  const box = $('#sync'), n = $('#sync-n'); let left = 10; box.hidden = false; n.textContent = left; $('#sync-t').textContent = 'Get your movie ready.';
  syncTimer = setInterval(() => {
    left--; n.textContent = left > 0 ? left : 'Play';
    if (left <= 0) { clearInterval(syncTimer); $('#sync-t').textContent = 'Press play now. Tap anywhere to close.'; }
  }, 1000);
}
$('#sync').addEventListener('click', () => { if ($('#sync-n').textContent === 'Play') { $('#sync').hidden = true; } });
$('#sync-btn').addEventListener('click', () => { if (room && room.connected()) room.emit('sync', {}).catch(startSync); else { startSync(); toast('Your person is not connected, so this ran on your screen only.'); } });

/* ---- wheel ---- */
const cv = $('#wheel'), ctx = cv.getContext('2d');
let curKey = 'date', curItems = WHEELS.date.items, rot = 0, spinning = false, lastSpinAt = 0;
function wheelItems(key){
  if (key === 'list') { const t = S.movies.filter(m => !m.watched).map(m => m.title.slice(0, 40)).slice(0, 12); return t.length >= 2 ? t : null; }
  if (key === 'ours') { const t = (S.ours && S.ours.items) || []; return t.length >= 2 ? t : null; }
  return WHEELS[key].items;
}
const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function drawWheel(r){
  const W = cv.width, c = W / 2, R = c - 10, items = curItems || [], n = items.length;
  ctx.clearRect(0, 0, W, W);
  if (!n) {
    ctx.fillStyle = cssv('--soft'); ctx.beginPath(); ctx.arc(c, c, R, 0, 7); ctx.fill();
    ctx.fillStyle = cssv('--muted'); ctx.font = '500 32px ' + cssv('--body'); ctx.textAlign = 'center'; ctx.fillText('Add at least 2 options', c, c); return;
  }
  const seg = Math.PI * 2 / n, fills = [cssv('--w1'), cssv('--w2'), cssv('--w3'), cssv('--w4')];
  for (let i = 0; i < n; i++) {
    const a0 = r + i * seg - Math.PI / 2;
    ctx.beginPath(); ctx.moveTo(c, c); ctx.arc(c, c, R, a0, a0 + seg); ctx.closePath();
    ctx.fillStyle = fills[i % 4]; ctx.fill(); ctx.strokeStyle = cssv('--card'); ctx.lineWidth = 4; ctx.stroke();
    ctx.save(); ctx.translate(c, c); ctx.rotate(a0 + seg / 2); ctx.textAlign = 'right';
    ctx.fillStyle = '#fff'; ctx.font = '700 ' + (n > 8 ? 26 : 30) + 'px ' + cssv('--body');
    ctx.fillText(items[i].length > 20 ? items[i].slice(0, 19) + '…' : items[i], R - 24, 10); ctx.restore();
  }
  ctx.beginPath(); ctx.arc(c, c, 34, 0, 7); ctx.fillStyle = cssv('--card'); ctx.fill(); ctx.strokeStyle = cssv('--ink'); ctx.lineWidth = 4; ctx.stroke();
}
function animateTo(idx, done){
  const n = curItems.length, seg = Math.PI * 2 / n;
  let target = -(idx + 0.5) * seg;
  while (target > rot - Math.PI * 8) target -= Math.PI * 2;
  const start = rot, t0 = performance.now(), dur = 4200, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  spinning = true; $('#spin-btn').disabled = true; $('#spin-result').replaceChildren();
  const step = now => {
    const p = reduce ? 1 : Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    rot = start + (target - start) * e; drawWheel(rot);
    if (p < 1) requestAnimationFrame(step);
    else { rot = target % (Math.PI * 2); spinning = false; $('#spin-btn').disabled = !curItems; done(); renderWheelTabs(); }
  };
  requestAnimationFrame(step);
}
const showResult = s => $('#spin-result').replaceChildren(s.items[s.idx], h('small', null, 'Spun by ' + nameOf(s.by)));
function renderWheelTabs(){
  const box = $('#wheel-tabs'); box.replaceChildren();
  for (const k of Object.keys(WHEELS)) box.append(h('button', {class:'g' + (k === curKey ? ' on' : ''), type:'button', disabled: spinning, onclick: () => selectWheel(k)}, WHEELS[k].label));
  $('#ours-form').hidden = curKey !== 'ours';
}
function selectWheel(k){
  curKey = k; curItems = wheelItems(k); rot = 0;
  $('#spin-result').replaceChildren(); $('#spin-btn').disabled = !curItems;
  renderWheelTabs(); drawWheel(rot);
}
$('#spin-btn').addEventListener('click', async () => {
  if (!db || spinning || !curItems) return;
  const idx = Math.floor(Math.random() * curItems.length), s = {key: curKey, items: curItems.slice(), idx, by: uid, at: Date.now()};
  lastSpinAt = s.at;
  animateTo(idx, () => showResult(s));
  write(() => db.collection('spins').add(s));
});
$('#ours-form').addEventListener('submit', async e => {
  e.preventDefault(); if (!db) return;
  const items = $('#ours-text').value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 12);
  if (items.length < 2) { toast('Add at least two options.'); return; }
  await write(() => db.doc('spin/ours').set({items}));
});
function onSpins(){
  const s = S.spins[0]; if (!s || !s.items || s.at === lastSpinAt) return;
  lastSpinAt = s.at;
  if (s.by !== uid && Date.now() - s.at < 20000 && !spinning && curTab === 'spin') {
    curKey = WHEELS[s.key] ? s.key : curKey; curItems = s.items; renderWheelTabs();
    animateTo(s.idx, () => showResult(s));
  } else if (!spinning && curTab === 'spin') showResult(s);
}
function renderSpinHist(){
  const box = $('#spin-hist'); box.replaceChildren();
  if (!S.spins.length) { box.append(empty('No spins yet', 'Results from both of you land here.')); return; }
  for (const s of S.spins.slice(0, 10)) box.append(h('div', null, h('span', null, (WHEELS[s.key] ? WHEELS[s.key].label + ': ' : '') + (s.items[s.idx] || '')), h('span', {class:'sub'}, nameOf(s.by) + ' · ' + ago(s.at))));
}

/* ---- games ---- */
const GAMES = [['ttt', 'Tic-tac-toe'], ['c4', 'Connect four'], ['rps', 'Rock paper scissors'], ['wyr', 'Would you rather'], ['know', 'How well do you know me'], ['hang', 'Hangman'], ['doodle', 'Doodle pad'], ['story', 'Story ping-pong']];
const DEF = {
  ttt: {a:null, b:null, board:'_________', turn:0, winner:null, score:{}},
  c4: {a:null, b:null, board:'_'.repeat(42), turn:0, winner:null, score:{}, line:[]},
  rps: {picks:{}, score:{}, last:null},
  wyr: null, know: {phase:'idle', score:{}}, hang: {setter:null, word:'', guessed:'', score:{}}
};
const gdoc = k => S.g[k] || DEF[k];
const gset = (k, patch) => write(() => db.doc('games/' + k).set({...gdoc(k), ...patch}));
function seatBar(k, g, labels){
  const my = g.a === uid ? 0 : (g.b === uid ? 1 : -1), row = h('div', {class:'row c'});
  ['a', 'b'].forEach((s, i) => {
    if (g[s]) row.append(h('span', {class:'chip'}, labels[i] + ': ' + nameOf(g[s]) + ' (' + ((g.score || {})[g[s]] || 0) + ' wins)'));
    else if (my < 0) row.append(h('button', {class:'g', type:'button', onclick: () => gset(k, {[s]: uid})}, 'Play as ' + labels[i]));
    else row.append(h('span', {class:'chip'}, labels[i] + ': waiting for someone'));
  });
  return {row, my};
}
function seatTail(k, g, my, over, resetPatch){
  const acts = h('div', {class:'row c'});
  if (my >= 0 && g.a && g.b) acts.append(h('button', {class:'g', type:'button', onclick: () => gset(k, {...resetPatch, turn: over ? 1 - g.turn : g.turn})}, over ? 'Play again' : 'Restart'));
  if (my >= 0) acts.append(h('button', {class:'t', type:'button', onclick: () => gset(k, {[my === 0 ? 'a' : 'b']: null, ...resetPatch, turn: 0})}, 'Leave seat'));
  return acts;
}
function seatStatus(g, my, over, label){
  if (!g.a || !g.b) return 'Both of you need a seat to start.';
  if (over) return g.winner === 'draw' ? 'A draw.' : (g.winner === my ? 'You win!' : nameOf(g[g.winner === 0 ? 'a' : 'b']) + ' wins.');
  if (my < 0) return 'Watching. Both seats are taken.';
  return g.turn === my ? 'Your move.' : 'Waiting for ' + nameOf(g[g.turn === 0 ? 'a' : 'b']) + '.';
}
const TLINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
function gTTT(box){
  const g = gdoc('ttt'), {row, my} = seatBar('ttt', g, ['X', 'O']), over = g.winner != null;
  box.append(h('h3', null, 'Tic-tac-toe'), row);
  let wl = [];
  for (const l of TLINES) if (g.board[l[0]] !== '_' && g.board[l[0]] === g.board[l[1]] && g.board[l[0]] === g.board[l[2]]) wl = l;
  const board = h('div', {class:'board'});
  for (let i = 0; i < 9; i++) {
    const v = g.board[i], can = my >= 0 && !over && g.turn === my && v === '_' && g.a && g.b;
    board.append(h('button', {class:(v === 'x' ? 'x ' : v === 'o' ? 'o ' : '') + (over && wl.includes(i) ? 'win' : ''), type:'button', disabled: !can, 'aria-label':'Square ' + (i + 1),
      onclick: () => {
        const mark = my === 0 ? 'x' : 'o', b = g.board.slice(0, i) + mark + g.board.slice(i + 1);
        let win = null; for (const l of TLINES) if (b[l[0]] !== '_' && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) win = my;
        if (win == null && !b.includes('_')) win = 'draw';
        const score = {...g.score}; if (typeof win === 'number') score[uid] = (score[uid] || 0) + 1;
        gset('ttt', {board: b, turn: 1 - my, winner: win, score});
      }}, v === '_' ? '' : v.toUpperCase()));
  }
  box.append(board, h('div', {class:'status'}, seatStatus(g, my, over)), seatTail('ttt', g, my, over, {board:'_________', winner:null}));
}
function c4Win(b){
  for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) {
    const v = b[r * 7 + c]; if (v === '_') continue;
    for (const [dr, dc] of [[0,1],[1,0],[1,1],[1,-1]]) {
      const cells = [];
      for (let k = 0; k < 4; k++) { const rr = r + dr * k, cc = c + dc * k; if (rr < 0 || rr > 5 || cc < 0 || cc > 6 || b[rr * 7 + cc] !== v) break; cells.push(rr * 7 + cc); }
      if (cells.length === 4) return cells;
    }
  }
  return null;
}
function gC4(box){
  const g = gdoc('c4'), {row, my} = seatBar('c4', g, ['Red', 'Yellow']), over = g.winner != null;
  box.append(h('h3', null, 'Connect four'), row);
  const board = h('div', {class:'c4'});
  for (let c = 0; c < 7; c++) {
    const full = g.board[c] !== '_', can = my >= 0 && !over && g.turn === my && !full && g.a && g.b;
    board.append(h('button', {type:'button', disabled: !can, 'aria-label':'Drop in column ' + (c + 1),
      onclick: () => {
        let r = 5; while (r >= 0 && g.board[r * 7 + c] !== '_') r--;
        if (r < 0) return;
        const i = r * 7 + c, b = g.board.slice(0, i) + (my === 0 ? 'r' : 'y') + g.board.slice(i + 1), line = c4Win(b);
        let win = line ? my : (b.includes('_') ? null : 'draw');
        const score = {...g.score}; if (line) score[uid] = (score[uid] || 0) + 1;
        gset('c4', {board: b, turn: 1 - my, winner: win, score, line: line || []});
      }}, [0,1,2,3,4,5].map(r => h('i', {class:(g.board[r * 7 + c] === 'r' ? 'r' : g.board[r * 7 + c] === 'y' ? 'y' : '') + ((g.line || []).includes(r * 7 + c) ? ' win' : '')}))));
  }
  box.append(board, h('div', {class:'status'}, seatStatus(g, my, over)), seatTail('c4', g, my, over, {board:'_'.repeat(42), winner:null, line:[]}));
}
function gRPS(box){
  const g = gdoc('rps'), picks = g.picks || {}, ids = Object.keys(picks), mine = picks[uid], both = ids.length >= 2;
  const L = {r:'Rock', p:'Paper', s:'Scissors'}, beats = {r:'s', p:'r', s:'p'};
  box.append(h('h3', null, 'Rock paper scissors'));
  const rowEl = h('div', {class:'pickrow'});
  for (const k of ['r', 'p', 's']) rowEl.append(h('button', {class: mine === k ? 'sel' : '', type:'button', disabled: !!mine, onclick: () => {
    const other = ids.find(i => i !== uid);
    if (!other) { write(() => upsert('games/rps', !!S.g.rps, {picks: {[uid]: k}})); return; }
    const o = picks[other], score = {...g.score}; let res = 'draw';
    if (beats[k] === o) { res = uid; score[uid] = (score[uid] || 0) + 1; } else if (beats[o] === k) { res = other; score[other] = (score[other] || 0) + 1; }
    gset('rps', {picks: {[uid]: k, [other]: o}, score, last: res});
  }}, L[k]));
  box.append(rowEl);
  if (!mine) box.append(h('div', {class:'status'}, 'Pick one. It stays hidden until they pick too.'));
  else if (!both) box.append(h('div', {class:'status'}, 'Locked in. Waiting for your person.'));
  else {
    box.append(h('div', {class:'chips'}, ids.map(id => h('span', {class:'chip'}, nameOf(id) + ': ' + L[picks[id]]))), h('div', {class:'verdict'}, g.last === 'draw' ? 'A draw.' : (g.last === uid ? 'You win this round.' : nameOf(g.last) + ' wins this round.')));
  }
  const sc = Object.keys(g.score || {}); if (sc.length) box.append(h('div', {class:'chips'}, sc.map(id => h('span', {class:'chip'}, nameOf(id) + ' · ' + g.score[id] + ' wins'))));
  if (both) box.append(h('div', {class:'row mt'}, h('button', {class:'g', type:'button', onclick: () => gset('rps', {picks: {}, last: null})}, 'Next round')));
}
async function wyrNext(){ await write(() => db.doc('games/wyr').set({i: Math.floor(Math.random() * WYR.length), answers: {}})); }
function gWYR(box){
  box.append(h('h3', null, 'Would you rather'));
  const g = S.g.wyr;
  if (!g) { box.append(empty('Ready when you are', 'Start a round, answer in secret, then see if you match.'), h('div', {class:'row c mt'}, h('button', {class:'b', type:'button', onclick: wyrNext}, 'Start'))); return; }
  const q = WYR[g.i] || WYR[0], a = g.answers || {}, mine = a[uid], ids = Object.keys(a), both = ids.length >= 2;
  const opts = h('div', {class:'wyr'});
  ['a', 'b'].forEach((k, j) => opts.append(h('button', {class: mine === k ? 'sel' : '', type:'button', disabled: !!mine, onclick: () => write(() => db.doc('games/wyr').update({answers: {[uid]: k}}))}, q[j])));
  box.append(opts);
  if (!mine) box.append(h('div', {class:'status'}, 'Pick one. Your answer stays hidden until they answer too.'));
  else if (!both) box.append(h('div', {class:'status'}, 'Locked in. Waiting for your person.'));
  else box.append(h('div', {class:'chips'}, ids.map(id => h('span', {class:'chip'}, nameOf(id) + ': ' + q[a[id] === 'a' ? 0 : 1]))), h('div', {class:'verdict'}, a[ids[0]] === a[ids[1]] ? 'You matched.' : 'Different picks. Tell each other why.'));
  box.append(h('div', {class:'row mt'}, h('button', {class:'g', type:'button', onclick: wyrNext}, 'Next question')));
}
function gKnow(box){
  const g = gdoc('know'), subj = g.subject, isSubj = subj === uid, q = KNOW[g.qi] || '';
  box.append(h('h3', null, 'How well do you know me'));
  const sc = Object.keys(g.score || {}); if (sc.length) box.append(h('div', {class:'chips'}, sc.map(id => h('span', {class:'chip'}, nameOf(id) + ' · ' + g.score[id] + ' correct'))));
  if (g.phase === 'idle') { box.append(h('p', {class:'lede mt'}, 'One of you answers a question about yourself. The other guesses. Then the first one judges.'), h('button', {class:'b', type:'button', onclick: () => gset('know', {phase:'answer', subject: uid, qi: Math.floor(Math.random() * KNOW.length), answer:'', guess:'', verdict:null, guesser:null})}, 'Ask me a question')); return; }
  box.append(h('div', {class:'big mt', style:'font-size:1.6rem'}, subj ? (isSubj ? q : q.replace(/\bmy\b/g, nameOf(subj) + "'s").replace(/\bI\b/g, nameOf(subj)).replace(/\bme\b/g, nameOf(subj))) : q));
  if (g.phase === 'answer') {
    if (isSubj) box.append(h('textarea', {id:'k-a', maxlength:'200', style:'margin-top:10px', 'aria-label':'Your answer'}), h('div', {class:'row mt'}, h('button', {class:'b', type:'button', onclick: () => { const v = $('#k-a').value.trim(); if (v) gset('know', {phase:'guess', answer: v}); }}, 'Lock in my answer')));
    else box.append(h('div', {class:'status mt'}, nameOf(subj) + ' is writing an answer…'));
  } else if (g.phase === 'guess') {
    if (!isSubj) box.append(h('textarea', {id:'k-g', maxlength:'200', style:'margin-top:10px', 'aria-label':'Your guess'}), h('div', {class:'row mt'}, h('button', {class:'b', type:'button', onclick: () => { const v = $('#k-g').value.trim(); if (v) gset('know', {phase:'judge', guess: v, guesser: uid}); }}, 'Send my guess')));
    else box.append(h('div', {class:'status mt'}, 'Answer locked. Waiting for their guess.'));
  } else if (g.phase === 'judge') {
    if (isSubj) box.append(h('div', {class:'mt'}, h('span', {class:'sub'}, 'Your answer'), h('div', {class:'quote'}, g.answer), h('span', {class:'sub'}, 'Their guess'), h('div', {class:'quote'}, g.guess)),
      h('div', {class:'row mt'}, h('button', {class:'b', type:'button', onclick: () => { const score = {...g.score}; score[g.guesser] = (score[g.guesser] || 0) + 1; gset('know', {phase:'done', verdict:true, score}); }}, 'They got it'), h('button', {class:'g', type:'button', onclick: () => gset('know', {phase:'done', verdict:false})}, 'Not quite')));
    else box.append(h('div', {class:'status mt'}, 'Guess sent. Waiting for ' + nameOf(subj) + ' to judge.'));
  } else if (g.phase === 'done') {
    box.append(h('div', {class:'mt'}, h('span', {class:'sub'}, 'Answer'), h('div', {class:'quote'}, g.answer), h('span', {class:'sub'}, 'Guess'), h('div', {class:'quote'}, g.guess)), h('div', {class:'verdict'}, g.verdict ? 'Got it.' : 'Not quite. Time to tell the story.'),
      h('div', {class:'row mt'}, h('button', {class:'g', type:'button', onclick: () => gset('know', {phase:'answer', subject: g.guesser || (isSubj ? null : uid), qi: Math.floor(Math.random() * KNOW.length), answer:'', guess:'', verdict:null, guesser:null})}, 'Next round, other person answers')));
  }
}
function gHang(box){
  const g = gdoc('hang'), isSet = g.setter === uid, word = g.word || '', guessed = g.guessed || '';
  box.append(h('h3', null, 'Hangman'));
  if (!word) {
    box.append(h('p', {class:'lede'}, 'One of you picks a secret word or phrase. The other guesses letters. Seven wrong guesses and it is over.'),
      h('label', {class:'f', for:'h-w'}, 'Secret word (letters and spaces, up to 20)', h('input', {id:'h-w', maxlength:'20', autocomplete:'off'})),
      h('div', {class:'row mt'}, h('button', {class:'b', type:'button', onclick: () => { const v = $('#h-w').value.toLowerCase().replace(/[^a-z ]/g, '').trim(); if (v.length < 3) { toast('Use at least 3 letters.'); return; } gset('hang', {setter: uid, word: v, guessed: ''}); }}, 'Set the word'), h('button', {class:'g', type:'button', onclick: () => $('#h-w').value = pick(WORDS)}, 'Random word')));
    return;
  }
  const wrong = [...new Set(guessed)].filter(c => !word.includes(c)).length, won = [...word].every(c => c === ' ' || guessed.includes(c)), lost = wrong >= 7, over = won || lost;
  const svg = h('div', {class:'gallows'});
  svg.innerHTML = '<svg viewBox="0 0 140 150" width="140" height="150" aria-hidden="true"><path d="M10 145H90M30 145V10H100V25" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round"/>' +
    [['circle', 'cx="100" cy="38" r="13"'], ['path', 'd="M100 51V95"'], ['path', 'd="M100 62L82 80"'], ['path', 'd="M100 62L118 80"'], ['path', 'd="M100 95L84 120"'], ['path', 'd="M100 95L116 120"'], ['path', 'd="M94 34l4 4M98 34l-4 4M102 34l4 4M106 34l-4 4"']].map((p, i) => i < wrong ? '<' + p[0] + ' class="p" ' + p[1] + '/>' : '').join('') + '</svg>';
  box.append(svg, h('div', {class:'word'}, [...word].map(c => c === ' ' ? '  ' : (guessed.includes(c) || over || isSet ? c : '_')).join(' ')));
  if (isSet) box.append(h('div', {class:'status'}, 'You set this word. Your person is guessing.'));
  const keys = h('div', {class:'keys'});
  for (const c of 'abcdefghijklmnopqrstuvwxyz') {
    const used = guessed.includes(c);
    keys.append(h('button', {class:'g' + (used ? (word.includes(c) ? ' hit' : ' miss') : ''), type:'button', disabled: used || over || isSet, onclick: () => gset('hang', {guessed: guessed + c})}, c));
  }
  box.append(keys, h('div', {class:'status mt'}, won ? 'Solved. ' + (isSet ? 'They got your word.' : 'Nice one.') : lost ? 'Out of guesses. The word was "' + word + '".' : (isSet ? '' : (wrong + ' of 7 wrong.'))));
  if (over || isSet) box.append(h('div', {class:'row c'}, h('button', {class:'g', type:'button', onclick: () => gset('hang', {setter: null, word: '', guessed: ''})}, 'New word')));
}
/* doodle: persistent canvas so a partner's stroke never interrupts yours */
const dcv = h('canvas', {class:'doodle', width:'1000', height:'750', 'aria-label':'Shared drawing pad'}), dctx = dcv.getContext('2d');
let dcol = 0, dcur = null;
const dpal = () => [cssv('--ink'), cssv('--w1'), cssv('--w2'), cssv('--w4'), cssv('--w3'), cssv('--bg')];
function strokePath(s, col){
  if (!s.pts || s.pts.length < 2) return;
  dctx.strokeStyle = col; dctx.lineWidth = s.w; dctx.lineCap = 'round'; dctx.lineJoin = 'round'; dctx.beginPath(); dctx.moveTo(s.pts[0], s.pts[1]);
  if (s.pts.length === 2) dctx.lineTo(s.pts[0] + 0.1, s.pts[1]);
  for (let i = 2; i < s.pts.length; i += 2) dctx.lineTo(s.pts[i], s.pts[i + 1]);
  dctx.stroke();
}
function drawDoodle(){
  const pal = dpal(); dctx.fillStyle = cssv('--bg'); dctx.fillRect(0, 0, 1000, 750);
  for (const s of [...S.strokes].sort((a, b) => a.at - b.at)) strokePath(s, pal[s.c] || pal[0]);
  if (dcur) strokePath(dcur, pal[dcur.c]);
}
function dpos(e){ const r = dcv.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / r.width * 1000), Math.round((e.clientY - r.top) / r.height * 750)]; }
dcv.addEventListener('pointerdown', e => { if (!db) return; dcv.setPointerCapture(e.pointerId); const p = dpos(e); dcur = {pts: p, c: dcol, w: dcol === 5 ? 36 : 6}; drawDoodle(); });
dcv.addEventListener('pointermove', e => { if (!dcur) return; const p = dpos(e); const l = dcur.pts.length; if (Math.abs(p[0] - dcur.pts[l - 2]) + Math.abs(p[1] - dcur.pts[l - 1]) < 3) return; if (l < 3000) dcur.pts.push(p[0], p[1]); drawDoodle(); });
const dend = () => { if (!dcur) return; const s = dcur; dcur = null; if (db) write(() => db.collection('strokes').add({pts: s.pts, c: s.c, w: s.w, by: uid, at: Date.now()})); drawDoodle(); };
dcv.addEventListener('pointerup', dend); dcv.addEventListener('pointercancel', dend);
function gDoodle(box){
  const dm = S.doodleMeta;
  box.append(h('h3', null, 'Doodle pad'), h('div', {class:'row c', style:'margin-bottom:10px'},
    ['Ink', 'Red', 'Blue', 'Green', 'Gold'].map((n, i) => h('button', {class:'swatch' + (dcol === i ? ' sel' : ''), type:'button', 'aria-label': n, style:'background:' + dpal()[i], onclick: () => { dcol = i; renderGames(); }})),
    h('button', {class:'g' + (dcol === 5 ? ' on' : ''), type:'button', onclick: () => { dcol = 5; renderGames(); }}, 'Eraser'),
    h('button', {class:'g', type:'button', onclick: () => { const mine = S.strokes.filter(s => s.by === uid).sort((a, b) => b.at - a.at)[0]; if (mine) write(() => db.doc('strokes/' + mine.id).delete()); }}, 'Undo mine'),
    h('button', {class:'g', type:'button', onclick: async () => { for (const s of S.strokes) await write(() => db.doc('strokes/' + s.id).delete()); }}, 'Clear all')));
  box.append(dcv, h('div', {class:'row c mt'}, h('button', {class:'b', type:'button', onclick: () => write(() => db.doc('meta/doodle').set({word: pick(WORDS), by: uid, at: Date.now()}))}, 'Give us a word to draw'), dm && dm.word ? h('span', {class:'chip'}, 'Draw: ' + dm.word + ' · from ' + nameOf(dm.by)) : null),
    h('div', {class:'status'}, 'Your strokes appear for them when you lift your finger. Take turns drawing, or draw the word and guess it on a call.'));
  drawDoodle();
}
function gStory(box){
  const ep = (S.storyMeta && S.storyMeta.epoch) || 0, lines = S.story.filter(l => l.at >= ep).sort((a, b) => a.at - b.at), last = lines[lines.length - 1], myTurn = !last || last.by !== uid;
  box.append(h('h3', null, 'Story ping-pong'), h('p', {class:'lede'}, 'Write one sentence, then they add the next. See where the two of you take it.'));
  const st = h('div', {class:'story'});
  if (!lines.length) st.append(h('span', {class:'sub'}, 'Nothing yet. Start with: "Once upon a time…"'));
  lines.forEach(l => st.append(h('span', {class: l.by === uid ? 'me' : 'them'}, l.text + ' ')));
  box.append(st, h('div', {class:'row mt'}, h('input', {id:'s-in', maxlength:'200', placeholder: myTurn ? 'Your sentence' : 'Waiting for their sentence…', disabled: !myTurn, 'aria-label':'Next sentence'}),
    h('button', {class:'b', type:'button', disabled: !myTurn, onclick: async () => { const v = $('#s-in').value.trim(); if (v) { const ok = await write(() => db.collection('story').add({text: v, by: uid, at: Date.now()})); if (ok) $('#s-in').value = ''; } }}, 'Add')),
    h('div', {class:'row mt'}, h('button', {class:'t', type:'button', onclick: () => write(() => db.doc('meta/story').set({epoch: Date.now()}))}, 'Start a new story')));
}
const GFN = {ttt: gTTT, c4: gC4, rps: gRPS, wyr: gWYR, know: gKnow, hang: gHang, doodle: gDoodle, story: gStory};
function renderGames(){
  const nav = $('#gnav'); nav.replaceChildren(...GAMES.map(([k, n]) => h('button', {class:'g' + (k === curGame ? ' on' : ''), type:'button', onclick: () => { curGame = k; renderGames(); }}, n)));
  const stage = $('#stage');
  keep(stage, () => { dcv.remove(); stage.replaceChildren(); GFN[curGame](stage); });
}

/* ---- decide ---- */
$('#dec-form').addEventListener('submit', async e => {
  e.preventDefault(); if (!db) return;
  const q = $('#d-q').value.trim(), options = $('#d-opts').value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 6);
  if (!q || options.length < 2) { toast('Add a question and at least two options.'); return; }
  const ok = await write(() => db.collection('decisions').add({q, options, votes: {}, by: uid, at: Date.now()}));
  if (ok) { $('#d-q').value = ''; $('#d-opts').value = ''; }
});
function renderDecisions(){
  const box = $('#dec-list'); box.replaceChildren(h('h3', null, 'Open and settled'));
  if (!S.decisions.length) { box.append(empty('Nothing to decide yet', 'Start a vote above. Each of you picks once, and you can change your mind.')); return; }
  for (const d of S.decisions) {
    const votes = d.votes || {}, ids = Object.keys(votes), counts = d.options.map((_, i) => ids.filter(id => votes[id] === i).length), top = Math.max(...counts);
    let verdict = '';
    if (ids.length >= 2) { const first = votes[ids[0]]; verdict = ids.every(id => votes[id] === first) ? 'You agree: ' + d.options[first] : 'Split vote. Talk it out.'; }
    else if (ids.length === 1) verdict = ids[0] === uid ? 'Waiting for your person to vote.' : 'Your person voted. Your turn.';
    box.append(h('div', {class:'dec'}, h('p', {class:'q'}, d.q),
      h('div', {class:'opts'}, d.options.map((o, i) => h('button', {type:'button', class:(votes[uid] === i ? 'mine ' : '') + (ids.length >= 2 && counts[i] === top && top > 0 ? 'lead' : ''), onclick: () => write(() => db.doc('decisions/' + d.id).update({votes: {[uid]: i}}))}, h('span', null, o), h('span', {class:'chip'}, ids.length >= 2 || votes[uid] === i ? counts[i] + (counts[i] === 1 ? ' vote' : ' votes') : '')))),
      verdict ? h('div', {class:'verdict'}, verdict) : null, h('div', {class:'sub mt'}, 'Asked by ' + nameOf(d.by)),
      d.by === uid ? h('button', {class:'t', type:'button', onclick: () => write(() => db.doc('decisions/' + d.id).delete())}, 'Delete') : null));
  }
}

/* ---- us ---- */
$('#mem-date').value = todayLocal();
$('#mem-form').addEventListener('submit', async e => {
  e.preventDefault(); if (!db) return;
  const title = $('#mem-title').value.trim(), date = $('#mem-date').value; if (!title || !date) { toast('Add a date and what happened.'); return; }
  const ok = await write(() => db.collection('memories').add({title, date, note: $('#mem-note').value.trim(), by: uid, at: Date.now()}));
  if (ok) { $('#mem-title').value = ''; $('#mem-note').value = ''; }
});
$('#bk-form').addEventListener('submit', async e => {
  e.preventDefault(); if (!db) return; const v = $('#bk-text').value.trim(); if (!v) return;
  if (await write(() => db.collection('bucket').add({text: v, done: false, by: uid, at: Date.now()}))) $('#bk-text').value = '';
});
$('#th-form').addEventListener('submit', async e => {
  e.preventDefault(); if (!db) return; const v = $('#th-text').value.trim(); if (!v) return;
  if (await write(() => db.collection('thanks').add({text: v, by: uid, at: Date.now()}))) $('#th-text').value = '';
});
$('#th-pull').addEventListener('click', () => {
  const o = $('#th-out');
  if (!S.thanks.length) { o.textContent = 'The jar is empty. Drop the first one in.'; return; }
  const t = pick(S.thanks); o.replaceChildren(t.text, h('div', {class:'sub'}, nameOf(t.by) + ' · ' + fmt(t.at)));
});
function renderUs(){
  const tl = $('#mem-list'); tl.replaceChildren();
  if (!S.memories.length) tl.append(empty('No memories yet', 'Add the first moment you want to remember.'));
  else { const w = h('div', {class:'tl'}); for (const m of [...S.memories].sort((a, b) => b.date.localeCompare(a.date))) w.append(h('div', null, h('div', {class:'sub'}, fmtDay(m.date) + ' · ' + nameOf(m.by)), h('div', {class:'t1'}, m.title), m.note ? h('div', {class:'quote'}, m.note) : null, m.by === uid ? h('button', {class:'t', type:'button', onclick: () => write(() => db.doc('memories/' + m.id).delete())}, 'Delete') : null)); tl.append(w); }
  const bk = $('#bk-list'); bk.replaceChildren();
  if (!S.bucket.length) bk.append(empty('Nothing here yet', 'Add something you want to do together.'));
  for (const b of [...S.bucket].sort((a, c) => (a.done - c.done) || (c.at - a.at))) bk.append(h('label', {class:'check' + (b.done ? ' done' : '')}, h('input', {type:'checkbox', checked: b.done, onchange: () => write(() => db.doc('bucket/' + b.id).update({done: !b.done}))}), h('span', null, b.text), b.by === uid ? h('button', {class:'t', type:'button', style:'margin-left:auto', onclick: e => { e.preventDefault(); write(() => db.doc('bucket/' + b.id).delete()); }}, 'Delete') : null));
  $('#th-count').textContent = S.thanks.length ? S.thanks.length + (S.thanks.length === 1 ? ' thing' : ' things') + ' in the jar' : '';
}
$('#export-btn').addEventListener('click', async () => {
  if (!dl) { toast('Saving is not available in this view.'); return; }
  const lines = ['BETWEEN US', ''];
  lines.push('NOTES'); [...S.notes].sort((a, b) => a.at - b.at).forEach(n => lines.push(fmt(n.at) + ' · ' + nameOf(n.by) + (n.mood ? ' (' + n.mood + ')' : '') + ': ' + n.text));
  lines.push('', 'TIMELINE'); [...S.memories].sort((a, b) => a.date.localeCompare(b.date)).forEach(m => lines.push(m.date + ' · ' + m.title + (m.note ? ' - ' + m.note : '')));
  lines.push('', 'THINGS TO DO TOGETHER'); S.bucket.forEach(b => lines.push((b.done ? '[x] ' : '[ ] ') + b.text));
  lines.push('', 'GRATITUDE JAR'); S.thanks.forEach(t => lines.push('- ' + t.text));
  try { await dl.save({filename: 'between-us-journal.txt', data: lines.join('\n')}); } catch (e) { if (!e || e.code !== 'declined') toast('Could not save the file.'); }
});

/* ---- render + data plumbing ---- */
function refresh(){
  renderStamp(); renderHere(); renderBadges();
  if (curTab === 'home') renderHome();
  else if (curTab === 'notes') { renderNotes(); renderCaps(); }
  else if (curTab === 'movies') renderMovies();
  else if (curTab === 'spin') renderSpinHist();
  else if (curTab === 'games') renderGames();
  else if (curTab === 'decide') renderDecisions();
  else if (curTab === 'us') renderUs();
  if (curTab !== 'home' && curTab !== 'movies') { /* movies list feeds the watchlist wheel */ }
}
async function resolveNames(){
  const fresh = [...idsIn(S)].filter(i => !seen.has(i));
  if (!fresh.length || !userNs) return;
  fresh.forEach(i => seen.add(i));
  const ps = await userNs.profiles(fresh);
  for (const i of fresh) if (ps[i] && ps[i].name) names[i] = ps[i].name;
  refresh();
}
function sub(query, apply){
  query.onSnapshot(snap => { apply(snap); refresh(); resolveNames(); },
    err => { if (err && err.code === 'revoked') setNotice('Your access to this journal was removed.'); });
}
const setNotice = t => { const n = $('#notice'); n.textContent = t || ''; n.hidden = !t; };

async function boot(){
  showTab((location.hash || '#home').slice(1));
  selectWheel('date');
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { drawWheel(rot); drawDoodle(); });
  setInterval(() => { if (curTab === 'home' && !document.activeElement.matches('input,textarea')) renderHome(); renderHere(); }, 30000);
  const c = window.claude;
  if (!c || !c.use) { setNotice('Could not start the journal. Reload the page.'); return; }
  [db, userNs, room, dl] = await Promise.all([c.use('db'), c.use('user'), c.use('room'), c.use('downloads')]);
  if (!db) { setNotice('Could not connect to your journal. Check your connection and reload.'); return; }
  if (userNs) {
    uid = await userNs.id();
    if ((await userNs.can('data.write')) === false) setNotice('You can read this journal but not write in it.');
  }
  if (!uid) uid = 'me';
  if (room) {
    room.presence({here: true}).catch(() => {});
    room.onPeers(() => renderHere());
    room.on('ping', m => { if (m.isMe || !m.data || !PINGS.includes(m.data.kind)) return; burstHearts(); toast('Your person: ' + m.data.kind); });
    room.on('sync', () => startSync());
  }
  const docs = snap => snap.docs.map(d => ({id: d.id, ...d.data()}));
  const map = (snap, into) => { const o = {}; snap.docs.forEach(d => o[d.id] = d.data()); S[into] = o; };
  sub(db.collection('notes').orderBy('at', 'desc').limit(200), s => S.notes = docs(s));
  sub(db.collection('movies').orderBy('at', 'desc').limit(200), s => { S.movies = docs(s); if (curKey === 'list' && !spinning) { curItems = wheelItems('list'); $('#spin-btn').disabled = !curItems; drawWheel(rot); } });
  sub(db.collection('decisions').orderBy('at', 'desc').limit(100), s => S.decisions = docs(s));
  sub(db.collection('capsules').orderBy('at', 'desc').limit(100), s => S.capsules = docs(s));
  sub(db.collection('memories').limit(300), s => S.memories = docs(s));
  sub(db.collection('bucket').limit(300), s => S.bucket = docs(s));
  sub(db.collection('thanks').orderBy('at', 'desc').limit(300), s => S.thanks = docs(s));
  sub(db.collection('spins').orderBy('at', 'desc').limit(20), s => { S.spins = docs(s); onSpins(); });
  sub(db.collection('strokes').limit(400), s => { S.strokes = docs(s); if (curTab === 'games' && curGame === 'doodle') drawDoodle(); });
  sub(db.collection('story').orderBy('at', 'desc').limit(300), s => S.story = docs(s));
  sub(db.collection('daily').limit(400), s => map(s, 'daily'));
  sub(db.collection('moods').limit(10), s => map(s, 'moods'));
  sub(db.collection('pings').limit(10), s => map(s, 'pings'));
  sub(db.collection('people').limit(10), s => {
    map(s, 'people');
    if (!seenWritten) {
      seenWritten = true; const mine = S.people[uid]; prevSeen = mine && mine.lastSeen ? mine.lastSeen : Date.now();
      write(() => db.doc('people/' + uid).set({tz: Intl.DateTimeFormat().resolvedOptions().timeZone, lastSeen: Date.now()}));
    }
  });
  for (const k of ['ttt', 'c4', 'rps', 'wyr', 'know', 'hang']) sub(db.doc('games/' + k), s => S.g[k] = s.exists ? s.data() : null);
  sub(db.doc('meta/visit'), s => S.visit = s.exists ? s.data() : null);
  sub(db.doc('meta/night'), s => { S.night = s.exists ? s.data() : null; if (S.night && document.activeElement !== $('#n-title')) { $('#n-title').value = S.night.title || ''; $('#n-when').value = S.night.when || ''; } });
  sub(db.doc('meta/story'), s => S.storyMeta = s.exists ? s.data() : null);
  sub(db.doc('meta/doodle'), s => S.doodleMeta = s.exists ? s.data() : null);
  sub(db.doc('spin/ours'), s => {
    S.ours = s.exists ? s.data() : null;
    const ta = $('#ours-text'); if (document.activeElement !== ta && S.ours) ta.value = (S.ours.items || []).join('\n');
    if (curKey === 'ours' && !spinning) { curItems = wheelItems('ours'); $('#spin-btn').disabled = !curItems; drawWheel(rot); }
  });
}
window.startApp = boot;
