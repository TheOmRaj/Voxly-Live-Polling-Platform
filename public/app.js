
async function loadPublicPoll(pollId) {
  try {
    const r = await fetch('/api/polls/' + pollId, {
      headers: localStorage.getItem('token') ? { 'Authorization': 'Bearer ' + localStorage.getItem('token') } : {}
    });
    const d = await r.json();
    if (r.status === 401) {
      // Authenticated-mode poll, user not signed in. Park the poll id and route to login.
      sessionStorage.setItem('pendingPoll', pollId);
      showToast('Sign in to respond to this poll');
      navigate('login', false);
      return;
    }
    if (!r.ok) { showToast(d.error || 'Poll not found or expired'); navigate('landing', false); return; }
    if (d.published) {
      S.selectedPoll = { id: d.id, desc: d.desc, mode: d.mode };
      navigate('results', false);
      window.history.replaceState({}, '', '/?poll=' + pollId);
      return;
    }
    renderPublicPoll(d);
    S.currentPublicPoll = d;
    S.answers = {};
    navigate('poll-public', false);
    window.history.replaceState({}, '', '/?poll=' + pollId);
  } catch(e) { showToast('Failed to load poll'); navigate('landing', false); }
}

function renderPublicPoll(d) {
  const titleEl = document.querySelector('.poll-title');
  const descEl = document.querySelector('.poll-desc');
  if (titleEl) titleEl.textContent = d.title || '';
  if (descEl) descEl.textContent = d.desc || d.description || '';

  // Mode badge
  const badgesWrap = document.querySelector('.poll-badges');
  if (badgesWrap) {
    const modeBadge = badgesWrap.querySelectorAll('.badge')[1];
    if (modeBadge) {
      const mode = d.mode || 'anonymous';
      const modeLabels = { anonymous: '🎭 Anonymous', authenticated: '🔐 Authenticated', both: '👥 Anonymous or signed in' };
      modeBadge.textContent = modeLabels[mode] || modeLabels.anonymous;
    }
  }

  // Expiry chip
  const expEl = document.getElementById('poll-exp');
  if (expEl) expEl.textContent = d.expiry ? humanExpiry(d.expiry) : 'No expiry';

  // Anon-note (the footer text inside sub-card) — make it match mode
  const anonNote = document.querySelector('.anon-note');
  if (anonNote) {
    const txt = d.mode === 'authenticated' ? 'Your response is linked to your account.'
              : d.mode === 'both' ? 'You can respond anonymously or signed in.'
              : 'Your response is completely anonymous.';
    // Keep the icon, replace the trailing text node
    const iconHtml = anonNote.querySelector('svg')?.outerHTML || '';
    anonNote.innerHTML = iconHtml + txt;
  }

  // Questions
  const qWrap = document.getElementById('poll-qs');
  if (!qWrap) return;
  const questions = d.questions || [];
  qWrap.innerHTML = questions.map((q, i) => {
    const qid = 'q' + (i + 1);
    const num = String(i + 1).padStart(2, '0');
    const isReq = q.mandatory === true || q.required === true;
    const tagHtml = isReq ? '<span class="req-tag">Required</span>' : '<span class="opt-tag">Optional</span>';
    const optsHtml = (q.options || []).map(o => {
      const text = (typeof o === 'string') ? o : (o.text || o.label || '');
      const oid = (typeof o === 'object' && o !== null) ? (o.id || '') : '';
      return `<div class="ro" data-oid="${escapeHtml(oid)}" onclick="pick(this,'${qid}')"><div class="rr"><div class="ri"></div></div><span>${escapeHtml(text)}</span></div>`;
    }).join('');
    return `<div class="qc" data-q="${qid}" data-qid="${escapeHtml(q.id || '')}" data-m="${isReq}"><div class="qh"><span class="qn">${num}</span>${tagHtml}</div><div class="qt">${escapeHtml(q.text || q.title || '')}</div><div class="qo">${optsHtml}</div></div>`;
  }).join('');

  // Progress
  const progTxt = document.getElementById('prog-txt');
  const progPct = document.getElementById('prog-pct');
  const progFill = document.getElementById('prog-fill');
  if (progTxt) progTxt.textContent = `0 of ${questions.length} answered`;
  if (progPct) progPct.textContent = '0%';
  if (progFill) progFill.style.width = '0%';

  // Hide any stale validation alert
  const v = document.getElementById('val-alert'); if (v) v.style.display = 'none';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function humanExpiry(iso) {
  const target = new Date(iso);
  const ms = target.getTime() - Date.now();
  if (isNaN(ms)) return 'No expiry';
  if (ms <= 0) return 'Expired';
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d > 7) return 'Expires ' + target.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  if (d > 0) return `${d}d ${h % 24}h left`;
  if (h > 0) return `${h}h ${m % 60}m left`;
  if (m > 0) return `${m}m left`;
  return 'Ending soon';
}

async function loadResults() {
  resetResultsUI();
  const poll = S.selectedPoll;
  if (!poll || !poll.id) { showToast('No poll selected'); return; }
  try {
    const r = await fetch('/api/polls/' + poll.id + '/results');
    const d = await r.json();
    if (!r.ok) {
      const head = document.querySelector('.res-head');
      if (head) head.innerHTML = '<h2>Results unavailable</h2><p class="tm">' + (d.error || 'Could not load results') + '</p>';
      return;
    }
    const head = document.querySelector('.res-head');
    if (head) {
      head.innerHTML = '<span class="badge pub-badge">Results published</span><h2>' + escapeHtml(d.title) + '</h2><p class="tm">' + d.totalResponses + ' total responses · ' + escapeHtml(d.desc || '') + ' · Closed</p>';
    }
    const wrap = document.querySelector('.results-wrap');
    const btn = wrap.querySelector('div[style]') || null;
    const colors = ['hi','md','lo','dim','hi','md'];
    d.questions.forEach((q, i) => {
      const barsHtml = q.options.map((o, j) => {
        const pct = o.percentage || 0;
        return '<div class="ab"><span class="abl">' + escapeHtml(o.text) + '</span><div class="abt"><div class="abf ' + colors[j % colors.length] + '" style="width:' + pct + '%"></div></div><span class="abv mono">' + pct + '%</span></div>';
      }).join('');
      const div = document.createElement('div');
      div.className = 'aq';
      div.innerHTML = '<div class="aq-h"><div><div class="aq-m">Question ' + (i+1) + '</div><div class="aq-t">' + escapeHtml(q.text) + '</div></div></div><div class="aq-bars">' + barsHtml + '</div>';
      if (btn) wrap.insertBefore(div, btn);
      else wrap.appendChild(div);
    });
  } catch(e) {
    console.error('Results error:', e);
    const head = document.querySelector('.res-head');
    if (head) head.innerHTML = '<h2>Results unavailable</h2><p class="tm">Network error — try refreshing</p>';
  }
}

function resetResultsUI() {
  const wrap = document.querySelector('.results-wrap');
  if (!wrap) return;
  // Strip any leftover/demo question blocks
  wrap.querySelectorAll('.aq').forEach(e => e.remove());
  const head = document.querySelector('.res-head');
  if (head) head.innerHTML = '<h2>Loading…</h2>';
}

async function loadAnalytics() {
  resetAnalyticsUI();
  const poll = S.selectedPoll;
  if (!poll || !poll.id) { showToast('Select a poll from the dashboard first'); navigate('dashboard', false); return; }
  const token = localStorage.getItem('token');
  try {
    const r = await fetch('/api/polls/' + poll.id + '/analytics', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const d = await r.json();
    if (!r.ok) { showToast('Could not load analytics'); return; }

    const titleEl = document.querySelector('.analytics-title');
    const subtitleEl = document.querySelector('.analytics-subtitle');
    if (titleEl) titleEl.textContent = d.title;
    if (subtitleEl) subtitleEl.textContent = (poll.desc || '') + ' · ' + poll.mode + ' · ' + d.questions.length + ' questions';

    const totalEl = document.getElementById('a-total');
    const wsEl = document.getElementById('ws-cnt');
    const expiryEl = document.getElementById('a-expiry');
    if (totalEl) totalEl.textContent = d.totalResponses;
    if (wsEl) wsEl.textContent = d.totalResponses;
    if (expiryEl) expiryEl.textContent = d.expiry ? humanExpiry(d.expiry) : '—';

    const engEl = document.getElementById('a-engagement');
    const modeEl = document.getElementById('a-mode');
    const modeSubEl = document.getElementById('a-mode-sub');
    if (engEl) engEl.textContent = (d.engagementRate != null) ? d.engagementRate + '%' : '—';
    if (modeEl) modeEl.textContent = (d.anonCount || 0) + ' · ' + (d.authCount || 0);
    if (modeSubEl) modeSubEl.textContent = 'anonymous · authenticated';

    const wsEp = document.getElementById('ws-ep');
    if (wsEp) wsEp.textContent = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;

    const wrap = document.getElementById('analytics-questions');
    if (!wrap) return;
    wrap.innerHTML = '';
    d.questions.forEach((q, i) => {
      const total = q.totalAnswers || 0;
      const colors = ['hi','md','lo','dim','hi','md'];
      const barsHtml = q.options.map((o, j) => {
        const pct = o.percentage || 0;
        return `<div class="ab"><span class="abl">${o.text}</span><div class="abt"><div class="abf ${colors[j%colors.length]}" style="width:${pct}%"></div></div><span class="abv mono">${o.count} · ${pct}%</span></div>`;
      }).join('');
      wrap.innerHTML += `<div class="aq"><div class="aq-h"><div><div class="aq-m">Question ${i+1} · ${q.mandatory?'mandatory':'optional'}</div><div class="aq-t">${q.text}</div></div><span class="aq-c mono">${total} resp.</span></div><div class="aq-bars">${barsHtml}</div></div>`;
    });
  } catch(e) { console.error('Analytics error:', e); showToast('Could not load analytics'); }
}

function resetAnalyticsUI() {
  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setText('a-total', '—');
  setText('a-engagement', '—');
  setText('a-mode', '—');
  setText('a-mode-sub', 'anonymous · authenticated');
  setText('a-expiry', '—');
  setText('ws-cnt', '0');
  setText('ws-n', '0');
  const wsEp = document.getElementById('ws-ep');
  if (wsEp) wsEp.textContent = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
  const wsNew = document.getElementById('ws-new'); if (wsNew) wsNew.style.display = 'none';
  const wrap = document.getElementById('analytics-questions'); if (wrap) wrap.innerHTML = '';
  const titleEl = document.querySelector('.analytics-title'); if (titleEl) titleEl.textContent = 'Loading…';
  const subtitleEl = document.querySelector('.analytics-subtitle'); if (subtitleEl) subtitleEl.textContent = '';
}

function dtAutoTab(el, nextId, maxLen) {
  if (el.value.length >= maxLen) {
    const next = document.getElementById(nextId);
    if (next) next.focus();
  }
}

function getDateFromInputs(prefix) {
  const dd = document.getElementById(prefix+'-dd')?.value.padStart(2,'0');
  const mm = document.getElementById(prefix+'-mm')?.value.padStart(2,'0');
  const yyyy = document.getElementById(prefix+'-yyyy')?.value;
  let hh = parseInt(document.getElementById(prefix+'-hh')?.value) || 12;
  const min = document.getElementById(prefix+'-min')?.value.padStart(2,'0') || '00';
  const ampm = document.getElementById(prefix+'-ampm')?.value;
  if (ampm === 'PM' && hh !== 12) hh += 12;
  if (ampm === 'AM' && hh === 12) hh = 0;
  if (!dd || !mm || !yyyy || yyyy.length < 4) return null;
  return new Date(`${yyyy}-${mm}-${dd}T${String(hh).padStart(2,'0')}:${min}:00`);
}
const S = {
  user: null, theme: localStorage.getItem('theme') || 'dark', answers: {}, polls: [],
  selectedPoll: null, newPoll: { title: '', desc: '', expiry: '', mode: 'anonymous' }, qCount: 0, liveCount: 127
};

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(S.theme);
  initCursor();
  initNav();
  document.getElementById('mc-anon').addEventListener('click', () => selMode('anonymous'));
  document.getElementById('mc-auth').addEventListener('click', () => selMode('authenticated'));
  document.getElementById('mc-both').addEventListener('click', () => selMode('both'));
  document.getElementById('theme-toggle').addEventListener('click', () => { applyTheme(S.theme === 'dark' ? 'light' : 'dark'); showToast(S.theme === 'light' ? '☀️ Light mode' : '🌙 Dark mode') });
  document.getElementById('login-pw').addEventListener('keydown', e => { if(e.key==='Enter') doLogin() });
  document.getElementById('signup-pw').addEventListener('keydown', e => { if(e.key==='Enter') doSignup() });
  initScrollReveal();
  animateHeroStats();
  startLiveCounter();
  addQ();
  selMode('anonymous');
  const params = new URLSearchParams(window.location.search);
  // Default to landing unless an inbound deep-link will take over (?poll= or ?code=).
  // Skipping the landing nav here keeps the URL intact for loadPublicPoll/handleOIDCCallback.
  if (!params.get('poll') && !params.get('code')) navigate('landing', false);
  if (params.get('code'))
    handleOIDCCallback(params.get('code'));
  if (params.get('poll'))
    loadPublicPoll(params.get('poll'));
  const token = localStorage.getItem('token');
  if (token) fetch('/api/auth/me', { headers: { 'Authorization': 'Bearer ' + token } }).then(r => r.json()).then(d => { if (d.user) { S.user = d.user; updateNav() } }).catch(() => { });
});

function applyTheme(t) { S.theme = t; document.documentElement.setAttribute('data-theme', t); localStorage.setItem('theme', t) }

function initCursor() {
  const dot = document.getElementById('cursor'), ring = document.getElementById('cursor-ring');
  let mx = 0, my = 0, rx = 0, ry = 0;
  document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; dot.style.left = mx + 'px'; dot.style.top = my + 'px' });
  (function tick() { rx += (mx - rx) * .13; ry += (my - ry) * .13; ring.style.left = rx + 'px'; ring.style.top = ry + 'px'; requestAnimationFrame(tick) })();
  document.querySelectorAll('button,a,[data-nav],.ro,.tc2,.feat-card,.sc').forEach(el => {
    el.addEventListener('mouseenter', () => { dot.style.width = '16px'; dot.style.height = '16px'; ring.style.width = '46px'; ring.style.height = '46px' });
    el.addEventListener('mouseleave', () => { dot.style.width = '10px'; dot.style.height = '10px'; ring.style.width = '32px'; ring.style.height = '32px' });
  });
}

function initNav() {
  document.querySelectorAll('[data-nav]').forEach(el => el.addEventListener('click', () => navigate(el.dataset.nav)));
  document.getElementById('logout-btn').addEventListener('click', doLogout);
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('user-menu');
    const wrap = e.target.closest('.user-menu-wrap');
    if (menu && menu.classList.contains('open') && !wrap) closeUserMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeUserMenu(); });
}

function toggleUserMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('user-menu');
  const btn = document.getElementById('nav-avatar');
  if (!menu) return;
  const isOpen = menu.classList.toggle('open');
  if (btn) btn.setAttribute('aria-expanded', String(isOpen));
}

function closeUserMenu() {
  const menu = document.getElementById('user-menu');
  const btn = document.getElementById('nav-avatar');
  if (menu) menu.classList.remove('open');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function navigate(page, animate = true) {
  if (animate) {
    const t = document.getElementById('page-transition');
    t.style.transition = 'transform .28s ease'; t.style.transform = 'scaleY(1)'; t.style.transformOrigin = 'top';
    setTimeout(() => { switchPage(page); t.style.transformOrigin = 'bottom'; t.style.transform = 'scaleY(0)' }, 260);
  } else switchPage(page);
}

function switchPage(page) {
  document.querySelectorAll('.page')
    .forEach(p => p.classList.remove('active'));

  const el = document.getElementById('page-' + page);

  if (el) {
    el.classList.add('active');
    window.scrollTo(0, 0);
  }

  // Keep the URL in sync with the current page so a refresh doesn't snap back to a poll.
  // Pages that own their own URL (poll-public, results) set it themselves in loadPublicPoll.
  if (page !== 'poll-public' && page !== 'results') {
    const params = new URLSearchParams(window.location.search);
    if (params.has('poll')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  updateNav();

  if (page === 'analytics') {
    setTimeout(() => loadAnalytics(), 100);
  }
  if (page === 'results') {
    setTimeout(loadResults, 100);
  }
  if (page === 'profile') {
    setTimeout(loadProfilePage, 50);
  }
  if (page === 'settings') {
    setTimeout(loadSettingsPage, 50);
  }


  if (page === 'dashboard') {
    fetchAndRenderPolls();
    animateCounters();
  }


  if (page === 'create') {
    resetCreatePoll();
  }
}

function updateNav() {
  const a = !!S.user;
  document.getElementById('nav-guest').style.display = a ? 'none' : '';
  document.getElementById('nav-auth').style.display = a ? '' : 'none';
  document.getElementById('nav-guest-btns').style.display = a ? 'none' : '';
  document.getElementById('nav-auth-btns').style.display = a ? '' : 'none';
  if (a) renderUserAvatar();
}

function renderUserAvatar() {
  if (!S.user) return;
  const initial = (S.user.name?.[0] || 'V').toUpperCase();
  const av = S.user.avatar || null;
  const setAv = (el) => {
    if (!el) return;
    if (av) { el.style.backgroundImage = "url('" + av.replace(/'/g, "\\'") + "')"; el.classList.add('has-img'); el.textContent = ''; }
    else { el.style.backgroundImage = ''; el.classList.remove('has-img'); el.textContent = initial; }
  };
  setAv(document.getElementById('nav-avatar'));
  setAv(document.getElementById('user-menu-avatar'));
  setAv(document.getElementById('profile-avatar'));
  const n = document.getElementById('user-menu-name'); if (n) n.textContent = S.user.name || '—';
  const e = document.getElementById('user-menu-email'); if (e) e.textContent = S.user.email || '—';
  const rm = document.getElementById('avatar-remove-btn'); if (rm) rm.style.display = av ? '' : 'none';
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim(), pw = document.getElementById('login-pw').value, err = document.getElementById('login-err'), btn = document.getElementById('login-btn');
  err.style.display = 'none';
  if (!email || !pw) { err.textContent = 'Please fill in all fields.'; err.style.display = ''; return }
  setLoading(btn, true);
  try {
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Login failed');
    S.user = d.user; localStorage.setItem('token', d.token);
    showToast('Welcome back, ' + d.user.name + '! 👋');
    const pending = sessionStorage.getItem('pendingPoll');
    if (pending) { sessionStorage.removeItem('pendingPoll'); loadPublicPoll(pending); }
    else navigate('dashboard');
  } catch (e) { err.textContent = e.message; err.style.display = '' }
  finally { setLoading(btn, false) }
}

async function doSignup() {
  const name = document.getElementById('signup-name').value.trim(), email = document.getElementById('signup-email').value.trim(), pw = document.getElementById('signup-pw').value, err = document.getElementById('signup-err'), btn = document.getElementById('signup-btn');
  err.style.display = 'none';
  if (!name || !email || !pw) { err.textContent = 'Please fill in all fields.'; err.style.display = ''; return }
  if (pw.length < 8) { err.textContent = 'Password must be at least 8 characters.'; err.style.display = ''; return }
  setLoading(btn, true);
  try {
    const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password: pw }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Registration failed');
    S.user = d.user; localStorage.setItem('token', d.token);
    showToast('Welcome to Voxly, ' + d.user.name + '! 🎉');
    const pending = sessionStorage.getItem('pendingPoll');
    if (pending) { sessionStorage.removeItem('pendingPoll'); loadPublicPoll(pending); }
    else navigate('dashboard');
  } catch (e) { err.textContent = e.message; err.style.display = '' }
  finally { setLoading(btn, false) }
}

function doOIDC() {
  showToast('Redirecting to OIDC provider…');
  setTimeout(() => { window.location.href = '/oidc/authorize?client_id=voxly-web&response_type=code&scope=openid profile email&redirect_uri=' + encodeURIComponent(location.origin + '/') }, 500);
}

async function handleOIDCCallback(code) {
  try {
    const r = await fetch('/api/auth/oidc/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, redirect_uri: location.origin + '/' }) });
    const d = await r.json();
    if (d.token) { S.user = d.user; localStorage.setItem('token', d.token); showToast('Signed in via OIDC 🔐'); navigate('dashboard'); window.history.replaceState({}, '', '/') }
  } catch (e) { }
}

function doLogout() { S.user = null; localStorage.removeItem('token'); showToast('Logged out'); navigate('landing') }

function setLoading(btn, on) {
  if (!btn) return;
  const bt = btn.querySelector('.bt'); const bl = btn.querySelector('.bl');
  if (bt) bt.style.display = on ? 'none' : '';
  if (bl) bl.style.display = on ? '' : 'none';
  if (!bt && !bl) {
    // Fallback for plain buttons: stash original text and swap to "…"
    if (on) { btn.dataset._t = btn.textContent; btn.textContent = '…'; }
    else if (btn.dataset._t !== undefined) { btn.textContent = btn.dataset._t; delete btn.dataset._t; }
  }
  btn.disabled = on;
}

function pwStrength(v) {
  const s = document.getElementById('pw-str'), f = document.getElementById('pw-fill'), l = document.getElementById('pw-lbl');
  if (!v) { s.style.display = 'none'; return }
  s.style.display = 'flex';
  let score = 0;
  if (v.length >= 8) score++; if (/[A-Z]/.test(v)) score++; if (/[0-9]/.test(v)) score++; if (/[^a-zA-Z0-9]/.test(v)) score++;
  const lvl = [['10%', '#ef4444', 'Too short'], ['25%', '#ef4444', 'Weak'], ['50%', '#f59e0b', 'Fair'], ['75%', '#3b82f6', 'Good'], ['100%', '#22c55e', 'Strong']];
  const [w, c, lbl] = lvl[score] || lvl[0];
  f.style.width = w; f.style.background = c; l.textContent = lbl; l.style.color = c;
}
function selMode(m) {
  S.newPoll.mode = m;

  const btnMap = {
    anonymous: 'mc-anon',
    authenticated: 'mc-auth',
    both: 'mc-both'
  };

  const checkMap = {
    anonymous: 'ck-anon',
    authenticated: 'ck-auth',
    both: 'ck-both'
  };

  ['anonymous', 'authenticated', 'both'].forEach(k => {
    const btn = document.getElementById(btnMap[k]);
    const ck = document.getElementById(checkMap[k]);
    const selected = k === m;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (selected) {
      btn.style.border = '2px solid ' + (isDark ? '#ffffff' : '#4f46e5');
      btn.style.background = isDark ? '#2a2a2a' : '#eef2ff';
      btn.style.boxShadow = isDark ? '0 0 0 1px #ffffff' : '0 0 0 1px #4f46e5';
      btn.style.opacity = '1';
    } else {
      btn.style.border = '';
      btn.style.background = '';
      btn.style.boxShadow = '';
      btn.style.opacity = '0.6';
    }
    if (ck) ck.classList.toggle('hidden', !selected);
  });
}

function resetCreatePoll() {
  // reset state
  S.newPoll = {
    title: '',
    desc: '',
    expiry: '',
    mode: 'anonymous'
  };

  S.qCount = 0;


  document.getElementById('poll-title').value = '';
  document.getElementById('poll-desc').value = '';
  document.getElementById('tc').textContent = '0';
  ['exp-dd','exp-mm','exp-yyyy','exp-hh','exp-min','start-dd','start-mm','start-yyyy','start-hh','start-min'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});


  const qContainer = document.getElementById('q-container');
  qContainer.innerHTML = '';


  document.getElementById('cs1').style.display = '';
  document.getElementById('cs2').style.display = 'none';
  document.getElementById('cs3').style.display = 'none';


  setStepState(1, 'active');
  setStepState(2, '');
  setStepState(3, '');

  document.querySelectorAll('.step-line')
    .forEach(line => line.classList.remove('done'));


  selMode('anonymous');


  addQ();
}

function addQ() {
  S.qCount++; const n = S.qCount;
  const c = document.getElementById('q-container');
  const d = document.createElement('div'); d.className = 'qcard'; d.dataset.qid = n;
  d.innerHTML = `<div class="qt2"><div style="flex:1"><div class="qnl">Question ${n}</div><input class="fi" placeholder="Enter your question…" style="margin-top:4px"/></div><button class="rmb" oncli
ck="this.closest('.qcard').remove();renumQ()">✕</button></div><div class="qol"><div class="qor"><div class="qob"></div><input class="qoi" placeholder="Option A"/><button class="rmb" onclick="rmOpt(this)">✕</button></div><div class="qor"><div class="qob"></div><input class="qoi" placeholder="Option B"/><button class="rmb" onclick="rmOpt(this)">✕</button></div></div><button class="aob" onclick="addOpt(this)">+ Add option</button><div class="qmr"><label class="sw"><input type="checkbox"/><div class="sw-t"></div></label><span class="swl">Mark as mandatory</span></div>`;
  c.appendChild(d);
}

function renumQ() { document.querySelectorAll('.qcard').forEach((c, i) => { const l = c.querySelector('.qnl'); if (l) l.textContent = 'Question ' + (i + 1) }); S.qCount = document.querySelectorAll('.qcard').length }

function addOpt(btn) {
  const list = btn.previousElementSibling; const row = document.createElement('div'); row.className = 'qor';
  const labels = 'ABCDEFGH'; const idx = list.children.length;
  row.innerHTML = `<div class="qob"></div><input class="qoi" placeholder="Option ${labels[idx] || idx + 1}"/><button class="rmb" onclick="rmOpt(this)">✕</button>`;
  list.appendChild(row);
}

function rmOpt(btn) { const row = btn.closest('.qor'); if (row.parentElement.children.length > 1) row.remove(); else showToast('Need at least one option') }

function fwd(from) {
  if (from === 1) {
    const title = document.getElementById('poll-title').value.trim();
    const expiryDate = getDateFromInputs('exp');
    if (!title) { showToast('Enter a poll title'); return }
    if (!expiryDate || isNaN(expiryDate)) { showToast('Set a valid expiry date and time'); return }
    if (expiryDate <= new Date()) { showToast('Expiry must be in the future'); return }
    const expiry = expiryDate.toISOString();
    S.newPoll.title = title;
    S.newPoll.desc = document.getElementById('poll-desc').value;
    S.newPoll.expiry = expiry;
    const startDate = getDateFromInputs('start');
    if (startDate && !isNaN(startDate)) S.newPoll.startsAt = startDate.toISOString();
    setStepState(1, 'done'); setStepState(2, 'active');
    document.getElementById('cs1').style.display = 'none'; document.getElementById('cs2').style.display = '';
  } else if (from === 2) {
    if (!document.querySelectorAll('#q-container .qcard').length) { showToast('Add at least one question'); return }
    setStepState(2, 'done'); setStepState(3, 'active');
    document.querySelectorAll('.step-line').forEach(l => l.classList.add('done'));
    document.getElementById('cs2').style.display = 'none'; document.getElementById('cs3').style.display = '';
    renderPreview();
  }
}

function back(from) {
  if (from === 2) { setStepState(2, ''); setStepState(1, 'active'); document.getElementById('cs1').style.display = ''; document.getElementById('cs2').style.display = 'none' }
  if (from === 3) { setStepState(3, ''); setStepState(2, 'active'); document.getElementById('cs2').style.display = ''; document.getElementById('cs3').style.display = 'none' }
}

function setStepState(n, state) {
  const el = document.getElementById('sd' + n), circle = el.querySelector('.sc2');
  el.className = 'step' + (state ? ' ' + state : '');
  if (state === 'done') circle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:13px;height:13px"><polyline points="20,6 9,17 4,12"/></svg>';
  else circle.textContent = n;
}

function renderPreview() {
  const qc = document.querySelectorAll('#q-container .qcard').length;
  const exp = S.newPoll.expiry ? new Date(S.newPoll.expiry).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  document.getElementById('prev-sum').innerHTML = `<div class="psr"><div class="psl">Title</div><div class="psv">${S.newPoll.title}</div></div><div class="psr"><div class="psl">Mode</div><div class="psv">${{
    anonymous: '🎭 Anonymous',
    authenticated: '🔐 Authenticated',
    both: '🌐 Both'
  }[S.newPoll.mode]}</div></div><div class="psr"><div class="psl">Questions</div><div class="psv">${qc}</div></div><div class="psr"><div class="psl">Expires</div><div class="psv">${exp}</div></div>`;
}

async function publishPoll() {
  const token = localStorage.getItem('token');
  showToast('Publishing…');

  const questions = [];
  document.querySelectorAll('#q-container .qcard').forEach(q => {
    const text = q.querySelector('.fi')?.value?.trim() || 'Untitled Question';
    const mandatory = q.querySelector('.sw input')?.checked || false;
    const options = [...q.querySelectorAll('.qoi')]
      .map(o => ({ text: o.value.trim() }))
      .filter(o => o.text);
    if (options.length > 0) questions.push({ text, mandatory, options });
  });

  if (questions.length === 0) { showToast('Add at least one question with options'); return; }

  try {
    const r = await fetch('/api/polls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        title: S.newPoll.title,
        desc: S.newPoll.desc || '',
        mode: S.newPoll.mode,
        expiry: S.newPoll.expiry,
        startsAt: S.newPoll.startsAt,
        questions
      })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Failed to publish');
    showToast('Poll published! 🚀');
    setTimeout(async () => {
      await fetchAndRenderPolls();
      const created = S.polls.find(p => p.id === d.id);
      S.selectedPoll = created || { id: d.id, title: S.newPoll.title, desc: S.newPoll.desc, mode: S.newPoll.mode };
      openShare();
      navigate('analytics');
    }, 600);
  } catch(e) {
    showToast('Error: ' + e.message);
  }
}

async function fetchAndRenderPolls() {
  const token = localStorage.getItem('token');
  if (!token) return;
  try {
    const r = await fetch('/api/polls', { headers: { 'Authorization': 'Bearer ' + token } });
    const d = await r.json();
    if (d.polls) {
      S.polls = d.polls.map(p => ({
        id: p.id,
        title: p.title,
        desc: p.desc || p.description || '',
        mode: p.mode,
        status: p.status,
        published: !!p.published,
        responses: p.responseCount || 0,
        questions: p.questionCount || 0,
        expiry: p.expiry,
        expiryDisplay: p.expiry ? new Date(p.expiry).toLocaleDateString() : '—'
      }));
    }
  } catch(e) {}
  renderPolls();
  renderDashboardStats();
}

function renderDashboardStats() {
  const polls = S.polls || [];
  const total = polls.length;
  const active = polls.filter(p => p.status === 'active').length;
  const published = polls.filter(p => p.published || p.status === 'published').length;
  const responses = polls.reduce((s, p) => s + (p.responses || 0), 0);

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('d-total-polls', total.toLocaleString());
  set('d-total-responses', responses.toLocaleString());
  set('d-active-polls', active);
  set('d-published-polls', published);

  // Subtitles
  const expired = polls.filter(p => p.status === 'expired').length;
  set('d-total-polls-sub', total === 0 ? 'No polls yet' : (expired > 0 ? expired + ' expired' : 'all healthy'));
  set('d-active-polls-sub', active === 1 ? '1 accepting responses' : active + ' accepting responses');
}

function renderPolls(filter = '') {
  const tbody = document.getElementById('polls-body'); if (!tbody) return;
  const list = S.polls.filter(p => p.title.toLowerCase().includes(filter.toLowerCase()) || p.desc.toLowerCase().includes(filter.toLowerCase()));
  tbody.innerHTML = '';
  list.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><div class="pn">${p.title}</div><div class="pm">${p.desc} · ${p.mode}</div></td><td>${sBadge(p.status)}</td><td class="mono">${p.responses.toLocaleString()}</td><td class="mono">${Array.isArray(p.questions)?p.questions.length:p.questions}</td><td class="mono" style="font-size:.76rem;color:var(--text3)">${p.expiryDisplay || '—'}</td><td><div class="abts">${sActions(p)}</div></td>`;
    tr.addEventListener('click', () => {
      S.selectedPoll = p;
      navigate('analytics');
    });
    tbody.appendChild(tr);
  });
}

function renderAnalytics() {
  const poll = S.selectedPoll;

  if (!poll) return;


  document.querySelector('.analytics-title').textContent =
    poll.title;


  document.querySelector('.analytics-subtitle').textContent =
    `${poll.desc} · ${poll.mode} · ${poll.questions.length} questions`;


  document.getElementById('a-total').textContent =
    poll.responses;


  document.getElementById('a-expiry').textContent =
    poll.expiry;

  const qWrap =
    document.getElementById('analytics-questions');

  qWrap.innerHTML = '';

  if (poll.questions?.length) {

    poll.questions.forEach((q, i) => {

      qWrap.innerHTML += `
      <div class="aq">
        <div class="aq-h">
          <div>
            <div class="aq-m">
              Question ${i + 1}
            </div>

            <div class="aq-t">
              ${q.title}
            </div>
          </div>

          <span class="aq-c mono">
            ${poll.responses} resp.
          </span>
        </div>

        <div class="aq-bars">
          ${q.options.map(opt => `
            <div class="ab">
              <span class="abl">
                ${opt}
              </span>

              <div class="abt">
                <div class="abf ab-anim"
                  style="width:${20 + Math.random() * 60}%">
                </div>
              </div>

              <span class="abv mono">
                ${Math.floor(Math.random() * 50)}
              </span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    });

  }
}


function sBadge(s) { const m = { live: `<span class="badge live-badge"><span class="bdot pulse"></span>Live</span>`, active: `<span class="badge green-badge"><span class="bdot"></span>Active</span>`, published: `<span class="badge pub-badge"><span class="bdot"></span>Published</span>`, expired: `<span class="badge amber-badge"><span class="bdot"></span>Expired</span>` }; return m[s] || `<span class="badge muted-badge">Draft</span>` }

function sActions(p) {
  if (p.status === 'published') return `<button class="ib" onclick="event.stopPropagation();navigate('results')" title="Results"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>`;
  return `<button class="ib" onclick="event.stopPropagation();navigate('analytics')" title="Analytics"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg></button><button class="ib" onclick="event.stopPropagation();openShare()" title="Share"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></button>`;
}

function filterPolls(v) { renderPolls(v) }

function pick(el, qid) {
  el.closest('.qc').querySelectorAll('.ro').forEach(r => r.classList.remove('selected'));
  el.classList.add('selected');
  el.animate([{ transform: 'scale(.97)' }, { transform: 'scale(1)' }], { duration: 130 });
  S.answers[qid] = { optionId: el.dataset.oid || '', text: el.querySelector('span').textContent };
  el.closest('.qc').classList.add('answered');
  updateProgress();
  document.getElementById('val-alert').style.display = 'none';
}

function updateProgress() {
  const total = document.querySelectorAll('#poll-qs .qc').length, answered = Object.keys(S.answers).length, pct = Math.round(answered / total * 100);
  document.getElementById('prog-fill').style.width = pct + '%';
  document.getElementById('prog-txt').textContent = `${answered} of ${total} answered`;
  document.getElementById('prog-pct').textContent = pct + '%';
}

async function submitPoll() {
  const poll = S.currentPublicPoll;
  if (!poll || !poll.id) { showToast('Poll not loaded'); return; }

  // Validate mandatory questions (client-side mirror of server check)
  const cards = document.querySelectorAll('#poll-qs .qc');
  const missing = [];
  cards.forEach(c => {
    if (c.dataset.m === 'true' && !S.answers[c.dataset.q]) missing.push(c.dataset.q);
  });
  if (missing.length) {
    const v = document.getElementById('val-alert'); v.style.display = '';
    v.scrollIntoView({ behavior: 'smooth', block: 'center' });
    v.animate([{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], { duration: 180, iterations: 2 });
    return;
  }

  // Build answers in the shape the server expects: [{ questionId, optionId }]
  const answers = [];
  cards.forEach(c => {
    const qid = c.dataset.q;
    const a = S.answers[qid];
    if (!a) return; // optional and skipped
    answers.push({ questionId: c.dataset.qid, optionId: a.optionId });
  });

  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  try {
    const r = await fetch('/api/polls/' + poll.id + '/responses', {
      method: 'POST',
      headers,
      body: JSON.stringify({ answers })
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      showToast(err.error || 'Could not submit response');
      return;
    }
  } catch (e) { showToast('Network error — try again'); return; }

  navigate('success');
}

function triggerBars() { document.querySelectorAll('.ab-anim').forEach(b => b.style.width = b.dataset.w + '%') }

function animateCounters() {
  document.querySelectorAll('.counter[data-target]').forEach(el => {
    const target = parseInt(el.dataset.target); let curr = 0;
    const step = target / 60;
    const t = setInterval(() => { curr = Math.min(curr + step, target); el.textContent = Math.floor(curr).toLocaleString(); if (curr >= target) clearInterval(t) }, 16);
  });
}

function animateHeroStats() {
  document.querySelectorAll('.hs-num[data-count]').forEach(el => {
    const target = parseInt(el.dataset.count); let curr = 0;
    const step = target / 70;
    const t = setInterval(() => { curr = Math.min(curr + step, target); el.textContent = Math.floor(curr).toLocaleString(); if (curr >= target) { el.textContent = target.toLocaleString() + '+'; clearInterval(t) } }, 14);
  });
}

function startLiveCounter() {
  setInterval(() => {
    if (Math.random() > .55) {
      const inc = Math.floor(Math.random() * 3) + 1; S.liveCount += inc;
      // Only animate the hero counter on the landing page. Never touch real analytics widgets.
      const el = document.getElementById('hero-count');
      if (el) { el.textContent = S.liveCount.toLocaleString(); el.animate([{ color: 'var(--success)' }, { color: '' }], { duration: 700 }) }
      flickerHeroBars();
    }
  }, 3000);
}

function flickerHeroBars() {
  const pairs = [['hb1', 'hb1p'], ['hb2', 'hb2p']];
  pairs.forEach(([fid, pid]) => {
    const fill = document.getElementById(fid), pct = document.getElementById(pid);
    if (!fill || !pct) return;
    const cur = parseFloat(fill.style.width); const j = (Math.random() - .5) * 4;
    const nw = Math.max(5, Math.min(90, cur + j));
    fill.style.width = nw + '%'; pct.textContent = Math.round(nw) + '%';
  });
}

function initScrollReveal() {
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const delay = e.target.dataset.delay ? parseInt(e.target.dataset.delay) : 0;
        setTimeout(() => e.target.classList.add('visible'), delay);
        io.unobserve(e.target);
      }
    });
  }, { threshold: .12 });
  document.querySelectorAll('.feat-card').forEach(el => { io.observe(el) });
  document.querySelectorAll('.feat-card').forEach(card => {
    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
      card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
    });
  });
}

function openShare() {
  const poll = S.selectedPoll;
  const link = poll && poll.id
    ? window.location.origin + '/?poll=' + poll.id
    : window.location.origin;
  document.getElementById('share-link-display').textContent = link;
  S.currentShareLink = link;
  // Update mode + expiry info to reflect the real poll
  const info = document.querySelector('#share-modal .modal-info');
  if (info && poll) {
    const modeLabels = { anonymous: '🎭 Anonymous', authenticated: '🔐 Authenticated', both: '👥 Anonymous or signed in' };
    const modeTxt = modeLabels[poll.mode] || modeLabels.anonymous;
    const expTxt = poll.expiry ? humanExpiry(poll.expiry) : '';
    info.innerHTML = '<span>' + modeTxt + '</span>' + (expTxt ? '<span>·</span><span>' + expTxt + '</span>' : '');
  }
  document.getElementById('share-modal').classList.add('open');
}
function closeShare() { document.getElementById('share-modal').classList.remove('open') }
function previewPoll() {
  const poll = S.selectedPoll;
  closeShare();
  if (poll && poll.id) loadPublicPoll(poll.id);
  else showToast('No poll selected');
}
function copyLink() { navigator.clipboard.writeText(S.currentShareLink || window.location.origin).catch(() => {}); showToast('Link copied! 📋') }
async function publishResults() {
  const poll = S.selectedPoll;
  if (!poll || !poll.id) { showToast('No poll selected'); return; }
  const token = localStorage.getItem('token');
  try {
    const r = await fetch('/api/polls/' + poll.id + '/publish', {
      method: 'PATCH',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!r.ok) throw new Error('Failed to publish');
    showToast('Results published publicly 🎉');
    setTimeout(() => navigate('results'), 500);
  } catch(e) { showToast('Error: ' + e.message); }
}

function showToast(msg) {
  const t = document.getElementById('toast'); document.getElementById('toast-msg').textContent = msg;
  t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2500);
}

function togglePw(id, btn) {
  const input = document.getElementById(id); if (!input) return;
  input.type = input.type === 'text' ? 'password' : 'text';
  btn.style.opacity = input.type === 'text' ? '.5' : '1';
}

function scrollToFeatures() { const el = document.querySelector('.features-wrap'); if (el) el.scrollIntoView({ behavior: 'smooth' }); else { navigate('landing', false); setTimeout(() => { const e = document.querySelector('.features-wrap'); if (e) e.scrollIntoView({ behavior: 'smooth' }) }, 350) } }

/* ===== Profile page ===== */
function loadProfilePage() {
  if (!S.user) { navigate('login'); return; }
  const nameEl = document.getElementById('profile-name');
  const emailEl = document.getElementById('profile-email');
  if (nameEl) nameEl.value = S.user.name || '';
  if (emailEl) emailEl.value = S.user.email || '';
  const err = document.getElementById('profile-err'); if (err) err.style.display = 'none';
  renderUserAvatar();
}

async function saveProfile() {
  const name = document.getElementById('profile-name').value.trim();
  const email = document.getElementById('profile-email').value.trim();
  const err = document.getElementById('profile-err');
  const btn = document.getElementById('profile-save-btn');
  err.style.display = 'none';
  if (!name || !email) { err.textContent = 'Name and email are required.'; err.style.display = ''; return; }
  setLoading(btn, true);
  try {
    const r = await fetch('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') },
      body: JSON.stringify({ name, email })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Could not save profile');
    S.user = d.user;
    renderUserAvatar();
    showToast('Profile updated ✓');
  } catch (e) { err.textContent = e.message; err.style.display = ''; }
  finally { setLoading(btn, false); }
}

/* ===== Avatar upload ===== */
function onAvatarPicked(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = ''; // allow re-selecting same file
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('Please choose an image file'); return; }
  if (file.size > 5 * 1024 * 1024) { showToast('Image is too large (max 5MB before resize)'); return; }
  const reader = new FileReader();
  reader.onload = () => resizeAndUploadAvatar(reader.result);
  reader.onerror = () => showToast('Could not read image');
  reader.readAsDataURL(file);
}

function resizeAndUploadAvatar(dataUrl) {
  const img = new Image();
  img.onload = async () => {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    // cover-crop
    const ratio = img.width / img.height;
    let sx, sy, sw, sh;
    if (ratio > 1) { sh = img.height; sw = img.height; sx = (img.width - sw) / 2; sy = 0; }
    else { sw = img.width; sh = img.width; sy = (img.height - sh) / 2; sx = 0; }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
    const out = canvas.toDataURL('image/jpeg', 0.85);
    await uploadAvatar(out);
  };
  img.onerror = () => showToast('Invalid image');
  img.src = dataUrl;
}

async function uploadAvatar(dataUrl) {
  try {
    const r = await fetch('/api/auth/me/avatar', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') },
      body: JSON.stringify({ avatar: dataUrl })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Upload failed');
    S.user.avatar = d.avatar;
    renderUserAvatar();
    showToast('Profile picture updated ✓');
  } catch (e) { showToast(e.message); }
}

async function removeAvatar() {
  try {
    const r = await fetch('/api/auth/me/avatar', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') },
      body: JSON.stringify({ avatar: null })
    });
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Could not remove'); }
    S.user.avatar = null;
    renderUserAvatar();
    showToast('Profile picture removed');
  } catch (e) { showToast(e.message); }
}

/* ===== Settings page ===== */
function loadSettingsPage() {
  if (!S.user) { navigate('login'); return; }
  ['pw-current','pw-new','pw-confirm','delete-confirm-pw'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['pw-err','delete-err'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
}

async function changePassword() {
  const current = document.getElementById('pw-current').value;
  const next = document.getElementById('pw-new').value;
  const confirm = document.getElementById('pw-confirm').value;
  const err = document.getElementById('pw-err');
  const btn = document.getElementById('pw-save-btn');
  err.style.display = 'none';
  if (!current || !next || !confirm) { err.textContent = 'All fields required.'; err.style.display = ''; return; }
  if (next.length < 8) { err.textContent = 'New password must be at least 8 characters.'; err.style.display = ''; return; }
  if (next !== confirm) { err.textContent = 'New passwords do not match.'; err.style.display = ''; return; }
  setLoading(btn, true);
  try {
    const r = await fetch('/api/auth/me/password', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') },
      body: JSON.stringify({ currentPassword: current, newPassword: next })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Could not change password');
    ['pw-current','pw-new','pw-confirm'].forEach(id => document.getElementById(id).value = '');
    showToast('Password updated ✓');
  } catch (e) { err.textContent = e.message; err.style.display = ''; }
  finally { setLoading(btn, false); }
}

/* ===== Delete account ===== */
function openDeleteAccount() {
  const m = document.getElementById('delete-account-modal'); if (!m) return;
  const pw = document.getElementById('delete-confirm-pw'); if (pw) pw.value = '';
  const err = document.getElementById('delete-err'); if (err) err.style.display = 'none';
  m.classList.add('open');
  setTimeout(() => { const pw = document.getElementById('delete-confirm-pw'); if (pw) pw.focus(); }, 50);
}

function closeDeleteAccount() {
  const m = document.getElementById('delete-account-modal'); if (m) m.classList.remove('open');
}

async function confirmDeleteAccount() {
  const password = document.getElementById('delete-confirm-pw').value;
  const err = document.getElementById('delete-err');
  const btn = document.getElementById('delete-confirm-btn');
  err.style.display = 'none';
  if (!password) { err.textContent = 'Enter your password to confirm.'; err.style.display = ''; return; }
  setLoading(btn, true);
  try {
    const r = await fetch('/api/auth/me', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') },
      body: JSON.stringify({ password })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Could not delete account');
    closeDeleteAccount();
    S.user = null; localStorage.removeItem('token');
    showToast('Account deleted');
    navigate('landing');
  } catch (e) { err.textContent = e.message; err.style.display = ''; }
  finally { setLoading(btn, false); }
}
