
async function loadPublicPoll(pollId) {
  try {
    const r = await fetch('/api/polls/' + pollId);
    const d = await r.json();
    if (!r.ok) { showToast('Poll not found or expired'); return; }
    if (d.published) {
      S.selectedPoll = { id: d.id, desc: d.desc, mode: d.mode };
      navigate('results', false);
      return;
    }
    document.querySelector('.poll-title').textContent = d.title;
    document.querySelector('.poll-desc').textContent = d.desc || '';
    S.currentPublicPoll = d;
    navigate('poll-public', false);
    window.history.replaceState({}, '', '/?poll=' + pollId);
  } catch (e) { showToast('Failed to load poll'); }
}

async function loadResults() {
  const poll = S.selectedPoll;
  if (!poll || !poll.id) { triggerBars(); return; }
  try {
    const r = await fetch('/api/polls/' + poll.id + '/results');
    const d = await r.json();
    if (!r.ok) { triggerBars(); return; }
    const head = document.querySelector('.res-head');
    if (head) {
      head.innerHTML = '<span class="badge pub-badge">Results published</span><h2>' + d.title + '</h2><p class="tm">' + d.totalResponses + ' total responses · ' + (d.desc || '') + ' · Closed</p>';
    }
    const wrap = document.querySelector('.results-wrap');
    wrap.querySelectorAll('.aq').forEach(e => e.remove());
    const btn = wrap.querySelector('div[style]') || null;
    const colors = ['hi', 'md', 'lo', 'dim', 'hi', 'md'];
    d.questions.forEach((q, i) => {
      const barsHtml = q.options.map((o, j) => {
        const pct = o.percentage || 0;
        return '<div class="ab"><span class="abl">' + o.text + '</span><div class="abt"><div class="abf ' + colors[j % colors.length] + '" style="width:' + pct + '%"></div></div><span class="abv mono">' + pct + '%</span></div>';
      }).join('');
      const div = document.createElement('div');
      div.className = 'aq';
      div.innerHTML = '<div class="aq-h"><div><div class="aq-m">Question ' + (i + 1) + '</div><div class="aq-t">' + q.text + '</div></div></div><div class="aq-bars">' + barsHtml + '</div>';
      if (btn) wrap.insertBefore(div, btn);
      else wrap.appendChild(div);
    });
  } catch (e) { console.error('Results error:', e); triggerBars(); }
}

async function loadAnalytics() {
  const poll = S.selectedPoll;
  if (!poll || !poll.id) { triggerBars(); return; }
  const token = localStorage.getItem('token');
  try {
    const r = await fetch('/api/polls/' + poll.id + '/analytics', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const d = await r.json();
    if (!r.ok) { triggerBars(); return; }

    const titleEl = document.querySelector('.analytics-title');
    const subtitleEl = document.querySelector('.analytics-subtitle');
    if (titleEl) titleEl.textContent = d.title;
    if (subtitleEl) subtitleEl.textContent = (poll.desc || '') + ' · ' + poll.mode + ' · ' + d.questions.length + ' questions';

    const totalEl = document.getElementById('a-total');
    const wsEl = document.getElementById('ws-cnt');
    const expiryEl = document.getElementById('a-expiry');
    if (totalEl) totalEl.textContent = d.totalResponses;
    if (wsEl) wsEl.textContent = d.totalResponses;
    if (expiryEl) expiryEl.textContent = d.expiry ? new Date(d.expiry).toLocaleDateString() : '—';

    const wrap = document.getElementById('analytics-questions');
    if (!wrap) return;
    wrap.innerHTML = '';
    d.questions.forEach((q, i) => {
      const total = q.totalAnswers || 0;
      const colors = ['hi', 'md', 'lo', 'dim', 'hi', 'md'];
      const barsHtml = q.options.map((o, j) => {
        const pct = o.percentage || 0;
        return `<div class="ab"><span class="abl">${o.text}</span><div class="abt"><div class="abf ${colors[j % colors.length]}" style="width:${pct}%"></div></div><span class="abv mono">${o.count} · ${pct}%</span></div>`;
      }).join('');
      wrap.innerHTML += `<div class="aq"><div class="aq-h"><div><div class="aq-m">Question ${i + 1} · ${q.mandatory ? 'mandatory' : 'optional'}</div><div class="aq-t">${q.text}</div></div><span class="aq-c mono">${total} resp.</span></div><div class="aq-bars">${barsHtml}</div></div>`;
    });
  } catch (e) { console.error('Analytics error:', e); triggerBars(); }
}

function dtAutoTab(el, nextId, maxLen) {
  if (el.value.length >= maxLen) {
    const next = document.getElementById(nextId);
    if (next) next.focus();
  }
}

function getDateFromInputs(prefix) {
  const dd = document.getElementById(prefix + '-dd')?.value.padStart(2, '0');
  const mm = document.getElementById(prefix + '-mm')?.value.padStart(2, '0');
  const yyyy = document.getElementById(prefix + '-yyyy')?.value;
  let hh = parseInt(document.getElementById(prefix + '-hh')?.value) || 12;
  const min = document.getElementById(prefix + '-min')?.value.padStart(2, '0') || '00';
  const ampm = document.getElementById(prefix + '-ampm')?.value;
  if (ampm === 'PM' && hh !== 12) hh += 12;
  if (ampm === 'AM' && hh === 12) hh = 0;
  if (!dd || !mm || !yyyy || yyyy.length < 4) return null;
  return new Date(`${yyyy}-${mm}-${dd}T${String(hh).padStart(2, '0')}:${min}:00`);
}
const S = {
  user: null, theme: localStorage.getItem('theme') || 'dark', answers: {}, polls: [{ id: 'p1', title: 'Team Retrospective Q2', desc: 'Sprint feedback', mode: 'anonymous', status: 'live', responses: 127, questions: 4, expiry: '2h 14m' }, { id: 'p2', title: 'Product Feature Priorities', desc: 'User research', mode: 'authenticated', status: 'active', responses: 89, questions: 6, expiry: '3d 7h' }, { id: 'p3', title: 'Onboarding UX Survey', desc: 'New user feedback', mode: 'anonymous', status: 'active', responses: 341, questions: 5, expiry: '1d 20h' }, { id: 'p4', title: 'Q1 Engineering Pulse', desc: 'Internal', mode: 'anonymous', status: 'published', responses: 512, questions: 7, expiry: 'Ended' }, { id: 'p5', title: 'Design System Feedback', desc: 'Design team', mode: 'authenticated', status: 'expired', responses: 178, questions: 4, expiry: 'Ended' }],
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
  document.getElementById('login-pw').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin() });
  document.getElementById('signup-pw').addEventListener('keydown', e => { if (e.key === 'Enter') doSignup() });
  initScrollReveal();
  animateHeroStats();
  startLiveCounter();
  addQ();
  selMode('anonymous');
  navigate('landing', false);
  const params = new URLSearchParams(window.location.search);
  if (params.get('code'))
    handleOIDCCallback(params.get('code'));
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

  updateNav();

  if (page === 'analytics') {
    setTimeout(() => loadAnalytics(), 100);
  }
  if (page === 'results') {
    setTimeout(loadResults, 100);
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
  if (a) document.getElementById('nav-avatar').textContent = S.user.name?.[0]?.toUpperCase() || 'V';
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
    showToast('Welcome back, ' + d.user.name + '! 👋'); navigate('dashboard');
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
    showToast('Welcome to Voxly, ' + d.user.name + '! 🎉'); navigate('dashboard');
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

function setLoading(btn, on) { btn.querySelector('.bt').style.display = on ? 'none' : ''; btn.querySelector('.bl').style.display = on ? '' : 'none'; btn.disabled = on }

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
  ['exp-dd', 'exp-mm', 'exp-yyyy', 'exp-hh', 'exp-min', 'start-dd', 'start-mm', 'start-yyyy', 'start-hh', 'start-min'].forEach(id => { const el = document.getElementById(id); if (el) el.value = '' });


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
    setTimeout(async () => { await fetchAndRenderPolls(); openShare(); navigate('analytics'); }, 600);
  } catch (e) {
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
        responses: p.responseCount || 0,
        questions: p.questionCount || 0,
        expiry: p.expiry ? new Date(p.expiry).toLocaleDateString() : '—'
      }));
    }
  } catch (e) { }
  renderPolls();
}

function renderPolls(filter = '') {
  const tbody = document.getElementById('polls-body'); if (!tbody) return;
  const list = S.polls.filter(p => p.title.toLowerCase().includes(filter.toLowerCase()) || p.desc.toLowerCase().includes(filter.toLowerCase()));
  tbody.innerHTML = '';
  list.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><div class="pn">${p.title}</div><div class="pm">${p.desc} · ${p.mode}</div></td><td>${sBadge(p.status)}</td><td class="mono">${p.responses.toLocaleString()}</td><td class="mono">${Array.isArray(p.questions) ? p.questions.length : p.questions}</td><td class="mono" style="font-size:.76rem;color:var(--text3)">${p.expiry}</td><td><div class="abts">${sActions(p)}</div></td>`;
    tr.addEventListener('click', () => {
      S.selectedPoll = p;
      renderAnalytics();
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
  S.answers[qid] = el.querySelector('span').textContent;
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
  const missing = ['q1', 'q2'].filter(q => !S.answers[q]);
  if (missing.length) {
    const v = document.getElementById('val-alert'); v.style.display = '';
    v.scrollIntoView({ behavior: 'smooth', block: 'center' });
    v.animate([{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], { duration: 180, iterations: 2 });
    return;
  }
  try { await fetch('/api/polls/demo-id/responses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: S.answers }) }) } catch (e) { }
  const poll = S.selectedPoll;

  if (poll) {

    poll.responses += 1;

    Object.entries(S.answers)
      .forEach(([qKey, selected]) => {

        const qIndex =
          Number(qKey.replace('q', '')) - 1;

        if (
          poll.questions[qIndex] &&
          poll.questions[qIndex]
            .options[selected]
        ) {

          poll.questions[qIndex]
            .options[selected]
            .votes += 1;
        }
      });
  }
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
      ['ws-cnt', 'hero-count', 'a-total'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.textContent = S.liveCount.toLocaleString(); el.animate([{ color: 'var(--success)' }, { color: '' }], { duration: 700 }) }
      });
      const badge = document.getElementById('ws-new');
      if (badge) { document.getElementById('ws-n').textContent = inc; badge.style.display = ''; clearTimeout(badge._t); badge._t = setTimeout(() => badge.style.display = 'none', 1800) }
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
  document.getElementById('share-modal').classList.add('open');
}
function closeShare() { document.getElementById('share-modal').classList.remove('open') }
function copyLink() { navigator.clipboard.writeText(S.currentShareLink || window.location.origin).catch(() => { }); showToast('Link copied! 📋') }
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
  } catch (e) { showToast('Error: ' + e.message); }
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
