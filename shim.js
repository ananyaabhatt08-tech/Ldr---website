/* Adapter: gives the journal app (app.js) its db / user / room / downloads
   interface on top of Supabase. One instance per signed-in member of a space.

   space = { coupleId, userId, members: [{user_id, display_name}], isCreator }
*/
(function () {
  const clone = o => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
  const newId = () => { const a = new Uint8Array(10); crypto.getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2, '0')).join(''); };
  const idFor = uuid => 'u_' + String(uuid).replace(/-/g, '');

  function merge(a, b) {
    if (!a || typeof a !== 'object' || Array.isArray(a) || !b || typeof b !== 'object' || Array.isArray(b)) return clone(b);
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) {
      out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k]) ? merge(out[k], v) : clone(v);
    }
    return out;
  }
  const fail = (code, message) => Object.assign(new Error(message || code), { code });
  const mapError = e => {
    if (!e) return fail('unavailable');
    if (e.code === '42501' || e.code === 'P0002') return fail('invalid_argument', e.message);
    if (/too large|payload/i.test(e.message || '')) return fail('quota_exceeded', e.message);
    return fail('unavailable', e.message);
  };

  window.makeClaude = function makeClaude(sb, space) {
    const cid = space.coupleId, myId = idFor(space.userId);
    const cache = new Map();            // path -> data
    const listeners = new Set();        // {match(path), run()}
    let pending = new Set(), flushing = false, loaded = false;

    function schedule(l) { pending.add(l); if (!flushing) { flushing = true; queueMicrotask(() => { const run = [...pending]; pending = new Set(); flushing = false; run.forEach(x => { try { x.run(); } catch (e) { console.error(e); } }); }); } }
    function notify(path) { for (const l of listeners) if (l.match(path)) schedule(l); }
    function notifyAll() { for (const l of listeners) schedule(l); }

    async function loadAll() {
      const fresh = new Map();
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from('docs').select('path,data').eq('couple_id', cid).eq('deleted', false).range(from, from + 999);
        if (error) throw mapError(error);
        data.forEach(r => fresh.set(r.path, r.data));
        if (data.length < 1000) break;
      }
      cache.clear(); fresh.forEach((v, k) => cache.set(k, v)); loaded = true;
      notifyAll();
    }

    /* ---- db ---- */
    const snapDoc = path => ({ id: path.split('/').pop(), exists: cache.has(path), data: () => clone(cache.get(path)), metadata: { fromCache: false, hasPendingWrites: false } });
    function colDocs(col) {
      const pre = col + '/', out = [];
      for (const [p, d] of cache) if (p.startsWith(pre) && !p.slice(pre.length).includes('/')) out.push({ id: p.slice(pre.length), d });
      return out;
    }
    function runQuery(col, o) {
      let ds = colDocs(col);
      for (const [f, op, val] of o.where || []) ds = ds.filter(x => (op === '==' || op === 'eq') ? x.d[f] === val : (op === '!=' ? x.d[f] !== val : true));
      if (o.f) ds.sort((a, b) => { const x = a.d[o.f], y = b.d[o.f]; if (x == null) return 1; if (y == null) return -1; return (o.dir === 'desc' ? -1 : 1) * ((x > y) - (x < y)); });
      else ds.sort((a, b) => (a.id > b.id) - (a.id < b.id));
      if (o.n) ds = ds.slice(0, o.n);
      const docs = ds.map(x => ({ id: x.id, exists: true, data: () => clone(x.d), metadata: { fromCache: false, hasPendingWrites: false } }));
      return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } };
    }
    const parentOf = p => p.slice(0, p.lastIndexOf('/'));

    function docRef(path) {
      if (!/^([^/]+\/[^/]+)(\/[^/]+\/[^/]+)*$/.test(path)) throw new TypeError('A document path has an even number of segments: ' + path);
      return {
        id: path.split('/').pop(), path,
        get: async () => snapDoc(path),
        async set(data) {
          const prev = cache.get(path); cache.set(path, clone(data)); notify(path);
          const { error } = await sb.from('docs').upsert({ couple_id: cid, path, data, deleted: false }, { onConflict: 'couple_id,path' });
          if (error) { if (prev === undefined) cache.delete(path); else cache.set(path, prev); notify(path); throw mapError(error); }
        },
        async update(data) {
          if (!cache.has(path)) throw fail('invalid_argument', 'document does not exist');
          const prev = cache.get(path); cache.set(path, merge(prev, data)); notify(path);
          const { error } = await sb.rpc('merge_doc', { p_couple: cid, p_path: path, p_data: data });
          if (error) { cache.set(path, prev); notify(path); throw mapError(error); }
        },
        async delete() {
          const prev = cache.get(path); cache.delete(path); notify(path);
          const { error } = await sb.from('docs').update({ deleted: true, data: {} }).eq('couple_id', cid).eq('path', path);
          if (error) { if (prev !== undefined) cache.set(path, prev); notify(path); throw mapError(error); }
        },
        onSnapshot(next) {
          const l = { match: p => p === path, run: () => next(snapDoc(path)) };
          listeners.add(l); if (loaded) schedule(l);
          return () => listeners.delete(l);
        },
        collection: sub => collectionRef(path + '/' + sub),
      };
    }
    function collectionRef(col, o = {}) {
      const q = {
        path: col,
        where: (f, op, v) => collectionRef(col, { ...o, where: [...(o.where || []), [f, op, v]] }),
        orderBy: (f, dir) => collectionRef(col, { ...o, f, dir }),
        limit: n => collectionRef(col, { ...o, n }),
        get: async () => runQuery(col, o),
        onSnapshot(next) {
          const l = { match: p => parentOf(p) === col, run: () => next(runQuery(col, o)) };
          listeners.add(l); if (loaded) schedule(l);
          return () => listeners.delete(l);
        },
        doc: id => docRef(col + '/' + (id || newId())),
        async add(data) { const ref = q.doc(); await ref.set(data); return ref; },
      };
      return q;
    }
    const dbm = { doc: docRef, collection: c => collectionRef(c) };

    /* realtime: document changes */
    let subscribedOnce = false;
    const docsChannel = sb.channel('docs:' + cid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'docs', filter: 'couple_id=eq.' + cid }, p => {
        const r = p.new; if (!r || !r.path) return;
        if (r.deleted) cache.delete(r.path); else cache.set(r.path, r.data);
        notify(r.path);
      })
      .subscribe(status => { if (status === 'SUBSCRIBED') { if (subscribedOnce) loadAll().catch(() => {}); subscribedOnce = true; } });

    /* ---- user ---- */
    const nameFor = id => { const m = space.members.find(x => idFor(x.user_id) === id); return m ? m.display_name : ''; };
    const colors = ['#c8372f', '#2a58a8', '#1b6b60', '#8a5a12'];
    const profile = id => ({ id, name: nameFor(id), avatarUrl: '', color: colors[id.length % colors.length], email: null, isMe: id === myId, guest: false });
    const userm = {
      isOwner: async () => !!space.isCreator, canEdit: async () => true, can: async () => true,
      id: async () => myId,
      me: async () => ({ ...profile(myId), isOwner: !!space.isCreator, canEdit: true }),
      name: async () => nameFor(myId),
      profiles: async ids => Object.fromEntries([].concat(ids).map(i => [i, profile(i)])),
      search: async () => [],
    };

    /* ---- room: presence and moments ---- */
    const presenceKey = myId + '.' + Math.random().toString(36).slice(2, 8);
    const topicHandlers = new Map(), peerHandlers = new Set();
    let myPresence = { by: myId }, tracked = false;
    const roomCh = sb.channel('room:' + cid, { config: { broadcast: { self: true }, presence: { key: presenceKey } } });
    const peerList = () => {
      const st = roomCh.presenceState(), out = [];
      for (const [key, metas] of Object.entries(st)) { const m = metas[metas.length - 1] || {}; out.push({ peer: key, by: m.by || null, isMe: key === presenceKey, sameTab: key === presenceKey, kind: 'viewer', guest: false, presence: m, updatedAt: Date.now() }); }
      return out;
    };
    roomCh.on('broadcast', { event: '*' }, msg => {
      const hs = topicHandlers.get(msg.event); if (!hs) return;
      const p = msg.payload || {};
      hs.forEach(fn => fn({ topic: msg.event, data: p.d, by: p.by || null, peer: p.by, isMe: p.by === myId, sameTab: p.by === myId, kind: 'viewer', guest: false }));
    });
    roomCh.on('presence', { event: 'sync' }, () => { const peers = peerList(); peerHandlers.forEach(fn => fn({ peers, joined: [], left: [], updated: [] })); });
    roomCh.subscribe(async status => { if (status === 'SUBSCRIBED' && !tracked) { tracked = true; await roomCh.track(myPresence); } });
    const roomm = {
      emit: async (topic, data) => { if (roomCh.state !== 'joined') return; await roomCh.send({ type: 'broadcast', event: topic, payload: { by: myId, d: data } }); },
      on: (topic, fn) => { if (!topicHandlers.has(topic)) topicHandlers.set(topic, new Set()); topicHandlers.get(topic).add(fn); return () => topicHandlers.get(topic).delete(fn); },
      presence: async patch => { myPresence = { ...myPresence, ...patch, by: myId }; if (tracked) await roomCh.track(myPresence); },
      peers: peerList,
      onPeers: fn => { peerHandlers.add(fn); return () => peerHandlers.delete(fn); },
      connected: () => roomCh.state === 'joined',
      onConnection: fn => { fn(roomCh.state === 'joined'); return () => {}; },
    };

    /* ---- downloads ---- */
    const dlm = {
      save: async ({ filename, data }) => {
        const a = document.createElement('a'), url = URL.createObjectURL(new Blob([data], { type: 'text/plain;charset=utf-8' }));
        a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      },
    };

    const ready = loadAll();
    return {
      ready,
      leave() { sb.removeChannel(docsChannel); sb.removeChannel(roomCh); },
      use: async name => { if (name === 'db' || name === 'user' || name === 'room' || name === 'downloads') await ready; return ({ db: dbm, user: userm, room: roomm, downloads: dlm })[name] || null; },
    };
  };
})();
