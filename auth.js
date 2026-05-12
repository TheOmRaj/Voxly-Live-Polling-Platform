const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { Users, AuthCodes, RefreshTokens } = require('./db');

const router = express.Router();

const OIDC_CONFIG = {
  issuer: process.env.ISSUER || 'http://localhost:3000',
  jwks_uri: '/oidc/.well-known/jwks.json',
  authorization_endpoint: '/oidc/authorize',
  token_endpoint: '/oidc/token',
  userinfo_endpoint: '/oidc/userinfo',
  end_session_endpoint: '/oidc/logout',
  response_types_supported: ['code'],
  subject_types_supported: ['public'],
  id_token_signing_alg_values_supported: ['HS256'],
  scopes_supported: ['openid', 'profile', 'email'],
  token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic', 'none'],
  claims_supported: ['sub', 'name', 'email', 'iat', 'exp', 'iss', 'aud'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
};

const CLIENTS = {
  'voxly-web': {
    client_id: 'voxly-web',
    client_secret: process.env.OIDC_CLIENT_SECRET || 'voxly-secret-dev-only',
    redirect_uris: [
      'http://localhost:3000/auth/oidc/callback',
      'http://localhost:3000/',
      'http://localhost:5173/auth/oidc/callback',
    ],
    allowed_scopes: ['openid', 'profile', 'email'],
  },
};

const SECRET = process.env.JWT_SECRET || 'voxly-jwt-secret-dev';

function signAccessToken(user, scope = 'openid profile email') {
  return jwt.sign(
    { sub: user.id, name: user.name, email: user.email, scope },
    SECRET,
    { expiresIn: '1h', issuer: OIDC_CONFIG.issuer, audience: 'voxly-web' }
  );
}

function signIdToken(user, clientId, nonce) {
  const payload = { sub: user.id, name: user.name, email: user.email, iss: OIDC_CONFIG.issuer, aud: clientId, iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000) + 3600 };
  if (nonce) payload.nonce = nonce;
  return jwt.sign(payload, SECRET, { algorithm: 'HS256' });
}

function signRefreshToken(userId) {
  const token = uuid();
  RefreshTokens.create(userId, token);
  return token;
}

router.get('/.well-known/openid-configuration', (req, res) => {
  const base = OIDC_CONFIG.issuer + '/oidc';
  res.json({
    ...OIDC_CONFIG,
    issuer: OIDC_CONFIG.issuer,
    authorization_endpoint: base + '/authorize',
    token_endpoint: base + '/token',
    userinfo_endpoint: base + '/userinfo',
    end_session_endpoint: base + '/logout',
    jwks_uri: base + '/.well-known/jwks.json',
  });
});

router.get('/.well-known/jwks.json', (req, res) => {
  res.json({ keys: [{ kty: 'oct', use: 'sig', alg: 'HS256', kid: 'pollify-key-1', k: Buffer.from(SECRET).toString('base64url') }] });
});

router.get('/authorize', (req, res) => {
  const { client_id, redirect_uri, response_type, scope, state, nonce } = req.query;

  const client = CLIENTS[client_id];
  if (!client) return res.status(400).json({ error: 'invalid_client' });
  if (!client.redirect_uris.includes(redirect_uri)) return res.status(400).json({ error: 'invalid_redirect_uri' });
  if (response_type !== 'code') return res.status(400).json({ error: 'unsupported_response_type' });

  const scopes = (scope || '').split(' ');
  if (!scopes.includes('openid')) return res.status(400).json({ error: 'openid_scope_required' });

  res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Pollify — Sign in</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#0c0c0f;color:#f0f0f5;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem}.card{background:#16161c;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:2.5rem;width:100%;max-width:380px}.logo{display:flex;align-items:center;gap:8px;font-weight:800;font-size:1.1rem;margin-bottom:1.5rem}.logo-mark{width:28px;height:28px;background:#f05a28;border-radius:7px;display:grid;place-items:center;color:white}.logo-mark svg{width:16px;height:16px}h2{font-size:1.4rem;font-weight:700;margin-bottom:.25rem}p{font-size:.85rem;color:#9090a0;margin-bottom:1.5rem}.client-info{background:#1e1e26;border-radius:10px;padding:12px 14px;margin-bottom:1.5rem;font-size:.82rem;color:#9090a0}.client-info strong{color:#f0f0f5;display:block;margin-bottom:3px}.scopes{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.scope-tag{background:rgba(240,90,40,0.12);color:#f05a28;border:1px solid rgba(240,90,40,0.25);padding:2px 10px;border-radius:100px;font-size:.7rem;font-weight:600}.group{margin-bottom:1rem}.label{display:block;font-size:.75rem;font-weight:600;color:#9090a0;margin-bottom:5px}.input{width:100%;padding:9px 12px;border:1.5px solid rgba(255,255,255,0.1);border-radius:9px;background:#0c0c0f;color:#f0f0f5;font-size:.9rem;outline:none;font-family:inherit}.input:focus{border-color:#f05a28}.btn{width:100%;padding:10px;border:none;border-radius:9px;background:#f05a28;color:white;font-weight:700;font-size:.9rem;cursor:pointer;margin-top:.5rem;font-family:inherit}.btn:hover{background:#c93f0f}.err{color:#ef4444;font-size:.8rem;margin-bottom:1rem;display:none}</style></head><body><div class="card"><div class="logo"><div class="logo-mark"><svg viewBox="0 0 20 20" fill="none"><rect x="3" y="10" width="3" height="7" rx="1.5" fill="currentColor"/><rect x="8.5" y="6" width="3" height="11" rx="1.5" fill="currentColor"/><rect x="14" y="3" width="3" height="14" rx="1.5" fill="currentColor"/></svg></div>Pollify</div><h2>Authorize access</h2><p>Sign in to grant ${client_id} access to your account.</p><div class="client-info"><strong>${client_id}</strong>Requesting access to:<div class="scopes">${scopes.map(s=>`<span class="scope-tag">${s}</span>`).join('')}</div></div><div id="err" class="err">Invalid credentials</div><div class="group"><label class="label">Email</label><input class="input" type="email" id="email" placeholder="you@example.com" autocomplete="email"/></div><div class="group"><label class="label">Password</label><input class="input" type="password" id="pw" placeholder="••••••••" autocomplete="current-password"/></div><button class="btn" onclick="authorize()">Sign in &amp; Authorize</button></div><script>async function authorize(){const email=document.getElementById('email').value,pw=document.getElementById('pw').value,err=document.getElementById('err');err.style.display='none';const res=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:pw})});if(!res.ok){err.style.display='block';return;}const data=await res.json();const res2=await fetch('/oidc/authorize/code',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+data.token},body:JSON.stringify({client_id:'${client_id}',redirect_uri:'${redirect_uri}',scope:'${scope}',state:'${state||''}',nonce:'${nonce||''}'})});const d2=await res2.json();if(d2.redirect)window.location.href=d2.redirect;}</script></body></html>`);
});

router.post('/authorize/code', requireAuth, (req, res) => {
  const { client_id, redirect_uri, scope, state, nonce } = req.body;
  const client = CLIENTS[client_id];
  if (!client || !client.redirect_uris.includes(redirect_uri)) return res.status(400).json({ error: 'invalid_client' });

  const code = AuthCodes.create(req.user.id, client_id, scope, redirect_uri);
  const url = new URL(redirect_uri);
  url.searchParams.set('code', code);
  if (state) url.searchParams.set('state', state);
  res.json({ redirect: url.toString() });
});

router.post('/token', (req, res) => {
  const { grant_type, code, redirect_uri, client_id, client_secret, refresh_token } = req.body;

  const client = CLIENTS[client_id];
  if (!client) return res.status(401).json({ error: 'invalid_client' });
  if (client.client_secret && client_secret && client.client_secret !== client_secret) return res.status(401).json({ error: 'invalid_client' });

  if (grant_type === 'authorization_code') {
    const entry = AuthCodes.consume(code);
    if (!entry) return res.status(400).json({ error: 'invalid_grant' });
    if (entry.clientId !== client_id) return res.status(400).json({ error: 'invalid_grant' });
    if (entry.redirectUri !== redirect_uri) return res.status(400).json({ error: 'invalid_grant' });
    if (Date.now() - entry.createdAt > 10 * 60 * 1000) return res.status(400).json({ error: 'code_expired' });

    const user = Users.findById(entry.userId);
    if (!user) return res.status(400).json({ error: 'invalid_grant' });

    const access_token = signAccessToken(user, entry.scope);
    const id_token = signIdToken(user, client_id);
    const rt = signRefreshToken(user.id);

    return res.json({ access_token, id_token, refresh_token: rt, token_type: 'Bearer', expires_in: 3600, scope: entry.scope });
  }

  if (grant_type === 'refresh_token') {
    const entry = RefreshTokens.find(refresh_token);
    if (!entry) return res.status(400).json({ error: 'invalid_grant' });
    const user = Users.findById(entry.userId);
    if (!user) return res.status(400).json({ error: 'invalid_grant' });
    RefreshTokens.revoke(refresh_token);
    const access_token = signAccessToken(user);
    const new_rt = signRefreshToken(user.id);
    const id_token = signIdToken(user, client_id);
    return res.json({ access_token, id_token, refresh_token: new_rt, token_type: 'Bearer', expires_in: 3600 });
  }

  res.status(400).json({ error: 'unsupported_grant_type' });
});

router.get('/userinfo', requireAuth, (req, res) => {
  const user = Users.findById(req.user.id);
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  res.json({ sub: user.id, name: user.name, email: user.email });
});

router.get('/logout', (req, res) => {
  const { id_token_hint, post_logout_redirect_uri } = req.query;
  if (post_logout_redirect_uri) return res.redirect(post_logout_redirect_uri);
  res.json({ message: 'logged_out' });
});

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthorized' });
  try {
    const payload = jwt.verify(auth.split(' ')[1], SECRET);
    req.user = { id: payload.sub, name: payload.name, email: payload.email };
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}

module.exports = { router, signAccessToken, signIdToken };
