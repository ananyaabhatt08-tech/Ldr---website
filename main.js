/* Screens and sign-in: landing, account, space setup, then the journal (app.js). */
(function () {
  const cfg = window.BETWEEN_US_CONFIG || {};
  const $ = s => document.querySelector(s);
  const VIEWS = ['landing', 'auth', 'reset', 'onboard', 'setup', 'app'];
  const configured = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !/YOUR-/.test(cfg.SUPABASE_URL + cfg.SUPABASE_ANON_KEY);
  let sb = null, space = null, started = false, authMode = 'signup', recovering = false;

  function show(v) { VIEWS.forEach(x => { $('#v-' + x).hidden = x !== v; }); window.scrollTo(0, 0); }
  const errText = e => (e && e.message ? e.message.replace(/^Error: /, '') : 'Something went wrong. Try again.');

  /* landing content from config */
  ['#buy-hero', '#buy-price', '#buy-onboard'].forEach(s => { const a = $(s); if (cfg.BUY_URL) a.href = cfg.BUY_URL; else a.addEventListener('click', e => { e.preventDefault(); alert('The purchase link is not set up yet.'); }); });
  if (cfg.PRICE_LABEL) $('#price-label').textContent = cfg.PRICE_LABEL;
  if (cfg.SUPPORT_EMAIL) ['#support-1', '#support-2'].forEach(s => { $(s).textContent = cfg.SUPPORT_EMAIL; });
  document.querySelectorAll('[data-go]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    const g = a.dataset.go;
    if (g === 'landing') return show('landing');
    if (!configured) return show('setup');
    setAuthMode(g === 'signin' ? 'signin' : 'signup'); show('auth');
  }));

  /* auth */
  function setAuthMode(m) {
    authMode = m; const up = m === 'signup';
    $('#seg-up').classList.toggle('on', up); $('#seg-in').classList.toggle('on', !up);
    $('#auth-title').textContent = up ? 'Create your account' : 'Welcome back';
    $('#auth-sub').textContent = up ? 'One account each. You will link them in the next step.' : 'Sign in to open your journal.';
    $('#a-name-l').hidden = !up; $('#a-go').textContent = up ? 'Create account' : 'Sign in';
    $('#a-pass').autocomplete = up ? 'new-password' : 'current-password'; $('#a-forgot').hidden = up; $('#a-err').textContent = '';
  }
  $('#seg-up').addEventListener('click', () => setAuthMode('signup'));
  $('#seg-in').addEventListener('click', () => setAuthMode('signin'));
  $('#auth-form').addEventListener('submit', async e => {
    e.preventDefault(); const err = $('#a-err'); err.textContent = ''; err.className = 'err';
    const email = $('#a-email').value.trim(), password = $('#a-pass').value, name = $('#a-name').value.trim();
    $('#a-go').disabled = true;
    try {
      if (authMode === 'signup') {
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name } } });
        if (error) throw error;
        if (!data.session) { err.className = 'err okmsg'; err.textContent = 'Check your email to confirm your account, then sign in.'; setAuthMode('signin'); $('#a-err').className = 'err okmsg'; $('#a-err').textContent = 'Check your email to confirm your account, then sign in.'; }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (ex) { err.textContent = errText(ex); }
    $('#a-go').disabled = false;
  });
  $('#a-forgot').addEventListener('click', async () => {
    const email = $('#a-email').value.trim(), err = $('#a-err');
    if (!email) { err.className = 'err'; err.textContent = 'Type your email above first.'; return; }
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    err.className = error ? 'err' : 'err okmsg'; err.textContent = error ? errText(error) : 'We sent you a link to reset your password.';
  });
  $('#reset-form').addEventListener('submit', async e => {
    e.preventDefault(); const { error } = await sb.auth.updateUser({ password: $('#r-pass').value });
    if (error) { $('#r-err').textContent = errText(error); return; }
    recovering = false; await route();
  });
  const signOut = async () => { try { await sb.auth.signOut(); } finally { location.reload(); } };
  $('#signout').addEventListener('click', signOut); $('#signout2').addEventListener('click', signOut);

  /* onboarding */
  const displayName = user => (user.user_metadata && user.user_metadata.name) || (user.email || '').split('@')[0] || 'Me';
  async function rpcFlow(fn, args, errEl, btn) {
    errEl.textContent = ''; btn.disabled = true;
    try { const { error } = await sb.rpc(fn, args); if (error) throw error; await route(); }
    catch (ex) { errEl.textContent = errText(ex); }
    btn.disabled = false;
  }
  $('#redeem-form').addEventListener('submit', async e => {
    e.preventDefault(); const { data: { user } } = await sb.auth.getUser();
    rpcFlow('redeem_license', { p_code: $('#o-code').value, p_name: displayName(user) }, $('#o-err1'), e.submitter || $('#redeem-form button'));
  });
  $('#join-form').addEventListener('submit', async e => {
    e.preventDefault(); const { data: { user } } = await sb.auth.getUser();
    rpcFlow('join_couple', { p_code: $('#o-invite').value, p_name: displayName(user) }, $('#o-err2'), e.submitter || $('#join-form button'));
  });

  /* space + app */
  async function loadMembers() {
    const { data, error } = await sb.from('members').select('user_id,display_name').eq('couple_id', space.coupleId);
    if (!error && data) { space.members = data; renderSpaceBar(); }
  }
  function renderSpaceBar() {
    const bar = $('#space-invite'), me = space.members.find(m => m.user_id === space.userId);
    $('#space-who').textContent = me ? me.display_name : '';
    bar.replaceChildren();
    if (space.members.length < 2) {
      const b = document.createElement('b'); b.textContent = space.invite;
      const copy = document.createElement('button'); copy.className = 'g'; copy.type = 'button'; copy.textContent = 'Copy';
      copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(space.invite); copy.textContent = 'Copied'; } catch { copy.textContent = 'Select and copy'; } setTimeout(() => copy.textContent = 'Copy', 1800); });
      const w = document.createElement('span'); w.className = 'invite';
      w.append('Send your partner this invite code:', b, copy);
      bar.append(w);
    }
  }
  async function route() {
    if (recovering) return;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { started = false; return show('landing'); }
    const uid = session.user.id;
    const { data: m, error } = await sb.from('members').select('couple_id,display_name,couples(invite_code,created_by)').eq('user_id', uid).maybeSingle();
    if (error) { show('onboard'); $('#o-err1').textContent = errText(error); return; }
    if (!m) return show('onboard');
    if (started) return;
    started = true;
    space = { coupleId: m.couple_id, userId: uid, invite: m.couples.invite_code, isCreator: m.couples.created_by === uid, members: [{ user_id: uid, display_name: m.display_name }] };
    await loadMembers();
    sb.channel('members:' + space.coupleId).on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: 'couple_id=eq.' + space.coupleId }, loadMembers).subscribe();
    window.claude = window.makeClaude(sb, space);
    show('app');
    await window.startApp();
  }

  if (!configured) {
    show('landing');
  } else {
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') { recovering = true; return show('reset'); }
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') setTimeout(route, 0);
      if (event === 'SIGNED_OUT') location.reload();
    });
  }
})();
