require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const crypto = require('crypto');
const { Users, Polls, Responses, init } = require('./db');
const { signAccessToken } = require('./auth');
const { authenticate, optionalAuth } = require('./middleware');

const app = express();
app.set('trust proxy', 1); // Railway / Heroku-style proxy — needed for req.ip to be the real client
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;
const OIDC_SERVER = process.env.OIDC_SERVER || 'http://localhost:8000';

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, './public')));

// Fingerprint used to detect duplicate anonymous submissions. Salted with poll id
// so the same person can submit to different polls — only same poll is blocked.
function makeFingerprint(req, pollId) {
  const ip = req.ip || req.connection?.remoteAddress || '';
  const ua = req.get('user-agent') || '';
  return crypto.createHash('sha256').update(ip + '|' + ua + '|' + pollId).digest('hex');
}

app.get('/callback', (req, res) => res.sendFile(path.join(__dirname, './public/index.html')));

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password min 8 characters' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email' });
    const existing = await Users.findByEmail(email);
    if (existing) return res.status(409).json({ error: 'Email already registered' });
    const hashed = await bcrypt.hash(password, 12);
    const user = await Users.create(name, email, hashed);
    const token = signAccessToken(user);
    res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch(e) { console.error('API Error:', e.message); res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = await Users.findByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.password === 'oidc-no-password') return res.status(401).json({ error: 'This account uses OIDC login' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = signAccessToken(user);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch(e) { console.error('API Error:', e.message); res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    const user = await Users.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar || null } });
  } catch(e) { console.error('API Error:', e.message); res.status(500).json({ error: e.message }); }
});

app.patch('/api/auth/me', authenticate, async (req, res) => {
  try {
    const { name, email } = req.body || {};
    if (name !== undefined && (!name || !String(name).trim())) return res.status(400).json({ error: 'Name cannot be empty' });
    if (email !== undefined) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email' });
      const existing = await Users.findByEmail(email);
      if (existing && existing.id !== req.user.id) return res.status(409).json({ error: 'Email already in use' });
    }
    const updated = await Users.update(req.user.id, {
      name: name !== undefined ? String(name).trim() : undefined,
      email: email !== undefined ? String(email).trim().toLowerCase() : undefined,
    });
    res.json({ user: { id: updated.id, name: updated.name, email: updated.email, avatar: updated.avatar || null } });
  } catch(e) { console.error('API Error:', e.message); res.status(500).json({ error: e.message }); }
});

app.patch('/api/auth/me/password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
    const user = await Users.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.password === 'oidc-no-password') return res.status(400).json({ error: 'OIDC accounts cannot change password here' });
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
    const hashed = await bcrypt.hash(newPassword, 12);
    await Users.updatePassword(req.user.id, hashed);
    res.json({ message: 'Password updated' });
  } catch(e) { console.error('API Error:', e.message); res.status(500).json({ error: e.message }); }
});

app.put('/api/auth/me/avatar', authenticate, async (req, res) => {
  try {
    const { avatar } = req.body || {};
    if (avatar !== null && typeof avatar !== 'string') return res.status(400).json({ error: 'Invalid avatar' });
    if (typeof avatar === 'string') {
      if (!avatar.startsWith('data:image/')) return res.status(400).json({ error: 'Avatar must be a data URI' });
      if (avatar.length > 1500000) return res.status(400).json({ error: 'Avatar too large (max ~1MB after encoding)' });
    }
    await Users.updateAvatar(req.user.id, avatar);
    res.json({ avatar: avatar || null });
  } catch(e) { console.error('API Error:', e.message); res.status(500).json({ error: e.message }); }
});

app.delete('/api/auth/me', authenticate, async (req, res) => {
  try {
    const { password } = req.body || {};
    const user = await Users.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.password === 'oidc-no-password') {
      // OIDC: skip password gate. Could require a different confirmation flow in the future.
    } else {
      if (!password) return res.status(400).json({ error: 'Password required to delete account' });
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return res.status(401).json({ error: 'Incorrect password' });
    }
    await Users.delete(req.user.id);
    res.json({ message: 'Account deleted' });
  } catch(e) { console.error('API Error:', e.message); res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/oidc/verify', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });
  try {
    const userRes = await fetch(OIDC_SERVER + '/o/userinfo', { headers: { 'Authorization': 'Bearer ' + token } });
    if (!userRes.ok) return res.status(401).json({ error: 'Invalid or expired token' });
    const profile = await userRes.json();
    const name = profile.name || profile.given_name || profile.email.split('@')[0];
    let user = await Users.findByEmail(profile.email);
    if (!user) user = await Users.create(name, profile.email, 'oidc-no-password');
    const voxlyToken = signAccessToken(user);
    res.json({ token: voxlyToken, user: { id: user.id, name: user.name, email: user.email } });
  } catch(e) { res.status(400).json({ error: 'OIDC verification failed' }); }
});

app.get('/api/polls', authenticate, async (req, res) => {
  try {
    await Polls.checkExpiry();
    const polls = await Polls.findByUserId(req.user.id);
    const result = await Promise.all(polls.map(async p => ({
      id: p.id, title: p.title, desc: p.desc, mode: p.mode,
      status: p.status, published: p.published,
      questionCount: p.questions.length,
      responseCount: await Responses.countByPoll(p.id),
      expiry: p.expiry,
    })));
    res.json({ polls: result });
  } catch(e) { console.error('API Error:', e.message); res.status(500).json({ error: e.message }); }
});

app.post('/api/polls', authenticate, async (req, res) => {
  try {
    const { title, desc, mode, expiry, questions, startsAt } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    if (!expiry) return res.status(400).json({ error: 'Expiry required' });
    if (!questions || questions.length === 0) return res.status(400).json({ error: 'At least one question required' });
    const poll = await Polls.create(req.user.id, { title, desc, mode, expiry, questions, startsAt });
    res.status(201).json({ id: poll.id, message: 'Poll created' });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/polls/:id', optionalAuth, async (req, res) => {
  try {
    await Polls.checkExpiry();
    const poll = await Polls.findById(req.params.id);
    if (!poll) return res.status(404).json({ error: 'Poll not found' });
    if (poll.mode === 'authenticated' && !req.user) return res.status(401).json({ error: 'Login required to view this poll' });
    res.json({
      id: poll.id, title: poll.title, desc: poll.desc, mode: poll.mode,
      status: poll.status, published: poll.published, expiry: poll.expiry,
      questions: poll.questions.map(q => ({ id: q.id, text: q.text, mandatory: q.mandatory, options: q.options.map(o => ({ id: o.id, text: o.text })) })),
      responseCount: await Responses.countByPoll(poll.id),
    });
  } catch(e) { console.error('API Error:', e.message); res.status(500).json({ error: e.message }); }
});

app.post('/api/polls/:id/responses', optionalAuth, async (req, res) => {
  try {
    await Polls.checkExpiry();
    const poll = await Polls.findById(req.params.id);
    if (!poll) return res.status(404).json({ error: 'Poll not found' });
    if (poll.status !== 'active') return res.status(400).json({ error: 'Poll is not accepting responses' });
    if (poll.mode === 'authenticated' && !req.user) return res.status(401).json({ error: 'Login required to respond' });

    const { answers } = req.body;
    if (!answers || !Array.isArray(answers)) return res.status(400).json({ error: 'Answers required' });
    const mandatoryQIds = poll.questions.filter(q => q.mandatory).map(q => q.id);
    const answeredQIds = answers.map(a => a.questionId);
    const missing = mandatoryQIds.filter(id => !answeredQIds.includes(id));
    if (missing.length > 0) return res.status(400).json({ error: 'Mandatory questions unanswered', missing });

    // A response is "anonymous" only when no user is signed in.
    // In "both" mode, signed-in users get authenticated responses; signed-out users get anonymous ones.
    const isAnon = !req.user;
    const fingerprint = makeFingerprint(req, poll.id);

    // Duplicate check — by user id when signed in, by fingerprint when not.
    if (req.user && await Responses.hasResponded(poll.id, req.user.id)) {
      return res.status(409).json({ error: 'You have already responded to this poll' });
    }
    if (isAnon && await Responses.hasRespondedAnon(poll.id, fingerprint)) {
      return res.status(409).json({ error: 'You have already responded to this poll' });
    }

    const response = await Responses.create(poll.id, req.user?.id, answers, isAnon, fingerprint);
    const totalResponses = await Responses.countByPoll(poll.id);
    const updatedPoll = await Polls.findById(poll.id);
    io.to('poll:'+poll.id).emit('response:new', {
      pollId: poll.id, totalResponses,
      questions: updatedPoll.questions.map(q => ({ id: q.id, options: q.options.map(o => ({ id: o.id, text: o.text, count: o.count })) })),
    });
    res.status(201).json({ id: response.id, message: 'Response recorded' });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/polls/:id/analytics', authenticate, async (req, res) => {
  try {
    const poll = await Polls.findById(req.params.id);
    if (!poll) return res.status(404).json({ error: 'Poll not found' });
    if (poll.userId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    const totalResponses = await Responses.countByPoll(poll.id);
    const questions = poll.questions.map(q => {
      const totalForQ = q.options.reduce((s,o) => s + o.count, 0);
      return { id: q.id, text: q.text, mandatory: q.mandatory, totalAnswers: totalForQ,
        options: q.options.map(o => ({ id: o.id, text: o.text, count: o.count, percentage: totalForQ > 0 ? Math.round((o.count/totalForQ)*100) : 0 })) };
    });

    // Participation insights: engagement rate (avg % of questions each respondent answered)
    // and breakdown of anonymous vs authenticated responses.
    let engagementRate = null;
    let anonCount = 0;
    let authCount = 0;
    if (totalResponses > 0) {
      const allResponses = await Responses.findByPoll(poll.id);
      const totalQs = poll.questions.length;
      if (totalQs > 0) {
        const sum = allResponses.reduce((s, r) => {
          const answers = typeof r.answers === 'string' ? JSON.parse(r.answers) : r.answers;
          const answered = Array.isArray(answers) ? answers.length : 0;
          return s + Math.min(answered / totalQs, 1);
        }, 0);
        engagementRate = Math.round((sum / allResponses.length) * 100);
      }
      anonCount = allResponses.filter(r => !r.user_id).length;
      authCount = allResponses.length - anonCount;
    }

    res.json({
      pollId: poll.id, title: poll.title, totalResponses,
      status: poll.status, expiry: poll.expiry,
      engagementRate, anonCount, authCount,
      questions,
    });
  } catch(e) { console.error('API Error:', e.message); res.status(500).json({ error: e.message }); }
});

app.patch('/api/polls/:id/publish', authenticate, async (req, res) => {
  try {
    const poll = await Polls.findById(req.params.id);
    if (!poll) return res.status(404).json({ error: 'Poll not found' });
    if (poll.userId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    await Polls.publish(poll.id);
    io.to('poll:'+poll.id).emit('poll:published', { pollId: poll.id });
    res.json({ message: 'Results published' });
  } catch(e) { console.error('API Error:', e.message); res.status(500).json({ error: e.message }); }
});

app.get('/api/polls/:id/results', optionalAuth, async (req, res) => {
  try {
    const poll = await Polls.findById(req.params.id);
    if (!poll) return res.status(404).json({ error: 'Poll not found' });
    if (!poll.published) return res.status(403).json({ error: 'Results not published yet' });
    const totalResponses = await Responses.countByPoll(poll.id);
    const questions = poll.questions.map(q => {
      const totalForQ = q.options.reduce((s,o) => s + o.count, 0);
      return { id: q.id, text: q.text, options: q.options.map(o => ({ id: o.id, text: o.text, count: o.count, percentage: totalForQ > 0 ? Math.round((o.count/totalForQ)*100) : 0 })) };
    });
    res.json({ pollId: poll.id, title: poll.title, desc: poll.desc, totalResponses, questions });
  } catch(e) { console.error('API Error:', e.message); res.status(500).json({ error: e.message }); }
});

io.on('connection', (socket) => {
  socket.on('join:poll', async (pollId) => {
    socket.join('poll:'+pollId);
    const poll = await Polls.findById(pollId).catch(()=>null);
    if (poll) socket.emit('poll:state', { pollId, totalResponses: await Responses.countByPoll(pollId), status: poll.status, expiry: poll.expiry });
  });
  socket.on('leave:poll', (pollId) => socket.leave('poll:'+pollId));
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, './public/index.html')));

init().then(() => {
  server.listen(PORT, () => {
    console.log('Voxly running on http://localhost:' + PORT);
  });
}).catch(e => {
  console.error('Failed to initialize database:', e.message);
  process.exit(1);
});

module.exports = { app, server, io };
