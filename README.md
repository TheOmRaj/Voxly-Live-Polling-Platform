# Voxly — Live Polling Platform

A full-stack polling and feedback platform built for the **PulseBoard: Live Polls For Feedback** hackathon (2026 Web Dev Cohort). Logged-in users create polls with multiple single-option questions, share them via a public link, collect anonymous or authenticated responses, and view live analytics. Once a poll is done, the creator can publish results so anyone with the link can see the final outcome.

- **Live deployment:** https://voxly-live-polling-platform-production.up.railway.app
- **GitHub:** https://github.com/TheOmRaj/Voxly-Live-Polling-Platform
- **Submission track:** Full Stack Engineering (solo)

---

## Table of contents

1. [Feature checklist](#feature-checklist)
2. [Tech stack and stack-choice notes](#tech-stack-and-stack-choice-notes)
3. [Architecture overview](#architecture-overview)
4. [How to run locally](#how-to-run-locally)
5. [Environment variables](#environment-variables)
6. [Rubric mapping — where each criterion lives in the code](#rubric-mapping)
7. [API reference](#api-reference)
8. [Real-time updates](#real-time-updates)
9. [Database schema](#database-schema)
10. [Security notes](#security-notes)
11. [Known limitations / future work](#known-limitations--future-work)

---

## Feature checklist

| Requirement | Status | Where |
|---|---|---|
| Logged-in user can create polls | ✅ | `POST /api/polls` in `server.js` |
| Multiple questions per poll | ✅ | `questions` JSONB column, `db.js` `Polls.create` |
| Mark questions mandatory or optional | ✅ | `mandatory` flag on each question; validated both frontend and backend |
| Anonymous and authenticated response modes | ✅ | `mode` column on `polls`; `anonymous` / `authenticated` / `both` |
| Poll expiry — auto-inactive after deadline | ✅ | `Polls.checkExpiry()` runs on every read |
| Public shareable link | ✅ | `/?poll=<id>` route handled in `app.js` |
| Single-option questions only | ✅ | Frontend allows one selection per question; backend checks `optionId` |
| Validation backend + frontend | ✅ | Frontend: `submitPoll()` checks mandatory before send. Backend: `POST /api/polls/:id/responses` re-checks and returns 400 if missing. |
| Analytics dashboard for creators | ✅ | `/api/polls/:id/analytics`, owner-only |
| Publish final results publicly | ✅ | `PATCH /api/polls/:id/publish` flips `published=true`. Same link then shows results page. |
| Real-time updates via WebSockets | ✅ | Socket.io, `response:new` and `poll:published` events |
| Frontend + Backend in single repo | ✅ | This repo |
| Public GitHub + deployed link + README | ✅ | All three present |

---

## Tech stack and stack-choice notes

- **Frontend:** Vanilla HTML / CSS / JavaScript (no framework, custom SPA router)
- **Backend:** Node.js + Express
- **Database:** PostgreSQL (raw SQL via the `pg` library)
- **Real-time:** Socket.io
- **Auth:** JWT (signed access tokens) + bcrypt for password hashing, plus a small custom OIDC client for sign-in via an external provider
- **Hosting:** Railway (Node service + Postgres add-on)

**A note on the stack:** the track description references the MERN stack. I went with PostgreSQL instead of MongoDB and vanilla JS instead of React. The reasoning:

- **Postgres over Mongo** — the data is highly relational (users own polls, polls own questions which own options, responses link back to polls and sometimes users). With Mongo I'd be implementing referential integrity in application code; with Postgres I get ACID transactions for free, which I use for the cascade-delete in `Users.delete` (a single transaction wipes the user, their polls, and all responses to those polls).
- **Vanilla JS over React** — no build step, no bundler config, smaller bundle, faster initial paint. For a feedback tool where the public poll page needs to load fast on shared mobile links, that matters. The trade-off is more imperative DOM code in `app.js`, which I keep manageable by having a single `S` state object and `navigate()` / `switchPage()` as the only routing primitives.

These were deliberate choices, not avoidance. Either stack can hit every rubric criterion; I chose the one where I could spend more time on features and less on plumbing.

---

## Architecture overview

```
voxly/
├── public/
│   ├── index.html      SPA shell — every page is a <section class="page">
│   ├── styles.css      Design system, dark/light mode
│   └── app.js          Routing, state, API calls, Socket.io client
├── server.js           Express + Socket.io, all REST routes
├── auth.js             JWT signing + minimal OIDC server endpoints
├── db.js               PostgreSQL data layer — Users, Polls, Responses
├── middleware.js       authenticate (required) and optionalAuth
└── package.json
```

**Frontend flow:** `index.html` contains every page as a hidden `<section>`. `app.js` toggles `.active` on one section at a time via `navigate(page)`. State lives in a single `S` object. There's no virtual DOM — handlers update the DOM directly. The URL stays in sync via `history.replaceState` so deep links like `/?poll=<id>` work.

**Backend flow:** REST endpoints in `server.js` thin-wrap data-layer methods in `db.js`. JWT middleware (`middleware.js`) handles auth: `authenticate` is required, `optionalAuth` attaches `req.user` if a valid token is present but doesn't reject anonymous requests (used on the public poll endpoint so the same route works for both anon and authed responses).

**Real-time flow:** when a response is recorded, the server emits `response:new` to a room scoped to that poll (`poll:<id>`). Clients viewing the poll's analytics page subscribe to that room via `join:poll`.

---

## How to run locally

Requirements: Node 18+, PostgreSQL 14+ running locally (or a Postgres URL you can connect to).

```bash
# 1. clone
git clone https://github.com/TheOmRaj/Voxly-Live-Polling-Platform.git
cd Voxly-Live-Polling-Platform

# 2. install
npm install

# 3. create a Postgres database
createdb voxly

# 4. create .env (see Environment variables below)
cp .env.example .env
# then edit .env with your values

# 5. start
node server.js
```

The server creates all tables on first run (`init()` in `db.js`), and runs idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` migrations for newer columns. Open http://localhost:3000.

---

## Environment variables

```
DATABASE_URL=postgresql://localhost:5432/voxly
JWT_SECRET=<a long random string>
NODE_ENV=development
PORT=3000
OIDC_SERVER=http://localhost:8000   # optional, only for OIDC sign-in
```

Generate a strong JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

On Railway, `DATABASE_URL` is wired automatically from the Postgres add-on (`${{Postgres.DATABASE_URL}}`).

---

## Rubric mapping

This section maps each scoring criterion to the specific code that implements it.

### Authentication & Access Control (10 pts)

- **Registration**: `POST /api/auth/register` — validates email format, requires 8+ char passwords, hashes with bcrypt (cost factor 12), returns a JWT.
- **Login**: `POST /api/auth/login` — bcrypt compare, returns JWT.
- **Auth middleware**: `middleware.js` exports `authenticate` (rejects with 401 if token missing/invalid) and `optionalAuth` (attaches `req.user` if valid, continues otherwise).
- **Protected routes**: `/api/polls` (GET, POST), `/api/auth/me` (all methods), `/api/polls/:id/analytics`, `/api/polls/:id/publish` all require `authenticate`.
- **Owner-only checks**: analytics and publish endpoints additionally verify `poll.userId === req.user.id` and return 403 if not.

### Poll Creation & Question Management (15 pts)

- **Create**: `POST /api/polls` — accepts title, description, mode, expiry, optional starts_at, and an array of questions. Each question has `text`, `mandatory`, and `options`. UUIDs are assigned server-side for both questions and options so client IDs can't be spoofed.
- **Schema**: questions live as a JSONB array on the `polls` row. This makes per-poll reads atomic and option-count updates a single UPDATE.
- **Frontend create flow**: three-step wizard in `app.js` (`fwd()` / `back()`) — Setup → Questions → Publish. Custom datetime picker with auto-tabbing for DD/MM/YYYY HH:MM AM/PM.
- **Question types**: single-option only, per the hackathon brief.

### Response Collection Flow (15 pts)

- **Endpoint**: `POST /api/polls/:id/responses` (uses `optionalAuth`).
- **Mode enforcement**: 
  - `authenticated` mode → rejects unauth requests with 401
  - `anonymous` mode → ignores any auth header, saves as anonymous
  - `both` mode → uses the auth header if present, treats as anonymous otherwise
- **Mandatory validation** (server-side): builds the list of mandatory question IDs from the poll, checks that every one is present in the response, returns 400 with the missing IDs if any are absent.
- **Mandatory validation** (client-side): `submitPoll()` in `app.js` walks the rendered question cards, checks `dataset.m === 'true'` and `S.answers[qid]` for each, shows an inline error before sending.
- **Duplicate prevention**:
  - Authenticated: checks `user_id` already exists for this poll (`Responses.hasResponded`)
  - Anonymous: SHA-256 fingerprint of `IP | User-Agent | poll_id` (`makeFingerprint` in `server.js`, `Responses.hasRespondedAnon` in `db.js`). Both paths return 409.
- **Expiry check**: `Polls.checkExpiry()` runs before every response submission and marks expired polls as `status='expired'`. The endpoint then rejects with 400 if `status !== 'active'`.

### Analytics & Feedback Dashboard (15 pts)

- **Endpoint**: `GET /api/polls/:id/analytics` (owner-only).
- **What's returned**:
  - `totalResponses` — count
  - `engagementRate` — average % of questions answered per respondent (since optional questions can be skipped, this is a meaningful, non-trivial number)
  - `anonCount` / `authCount` — breakdown of responses by mode
  - `questions[]` — per question, total answers and per-option counts + percentages
  - `expiry` — for the countdown display
- **Frontend**: `loadAnalytics()` in `app.js` renders four KPI tiles (Total / Engagement / By mode / Expires) and a per-question bar chart with live percentage labels.
- **Honesty note**: tiles show `—` until data exists rather than fake placeholders.

### Frontend Experience (10 pts)

- Custom SPA router with smooth page transitions (the orange `#page-transition` overlay)
- Dark/light themes with CSS custom properties, theme stored in localStorage
- Custom cursor with hover scaling
- Animated hero with live counter and bar chart
- Scroll-reveal animations on landing sections
- Toast notification system
- Profile page with image upload (client-side canvas resize to 256×256 before sending)
- Settings page with password change and account deletion
- Custom datetime picker with auto-tabbing between DD/MM/YYYY/HH/MM/AMPM
- Mandatory question highlighting + inline validation alert on the public poll
- Mobile responsive (tested down to 380px width)

### Backend Architecture & API Design (15 pts)

- **Separation**: routes (`server.js`) → data layer (`db.js`) → schema. Routes do not write SQL directly.
- **Consistent JSON shape**: success returns the entity, errors return `{ error: "human-readable string" }`.
- **HTTP status codes used semantically**: 200/201 for success, 400 for validation, 401 for missing/invalid auth, 403 for forbidden (owner-only), 404 for not found, 409 for conflict (duplicate response, email taken), 500 for unexpected.
- **Cascading delete**: `Users.delete` runs `BEGIN; DELETE responses WHERE poll_id IN (SELECT polls); DELETE polls; DELETE user; COMMIT;` so a failed delete doesn't leave orphans.
- **Trust proxy**: `app.set('trust proxy', 1)` so `req.ip` returns the real client IP behind Railway's load balancer.
- **Body limit**: `express.json({ limit: '2mb' })` to support base64 avatar uploads without unnecessarily inflating the global limit.

### Real-Time Updates Using WebSockets (10 pts)

- Socket.io server initialized alongside Express on the same HTTP server (`server.js`).
- **Rooms**: each poll has a room named `poll:<id>`. Clients join via `socket.emit('join:poll', pollId)`.
- **Server-emitted events**:
  - `response:new` — fired when a response is recorded. Payload includes total response count and updated option counts for all questions. Lets analytics viewers update bars without re-fetching.
  - `poll:published` — fired when a poll is published. Connected clients on the public link can flip to the results view.
- **Initial state**: on join, the server emits `poll:state` with current totals + status + expiry, so a late joiner doesn't have to wait for the next response.

### Code Quality & Project Structure (10 pts)

- Clear file separation: `server.js` (routes only) / `db.js` (queries only) / `middleware.js` (auth only) / `auth.js` (token + OIDC helpers).
- All SQL is parameterized — no string interpolation, no SQL injection surface.
- Frontend HTML escaping via a small `escapeHtml()` helper used everywhere user-provided strings hit `innerHTML`.
- Consistent error handling: every route has `try/catch`, every fetch on the client has `.catch`.
- Idempotent migrations: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` lets the schema evolve without breaking existing deployments.
- No `.env` or `node_modules` in source control (see `.gitignore`).

---

## API reference

All endpoints prefixed with `/api`. JSON in, JSON out.

### Auth

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| POST | `/auth/register` | none | `{ name, email, password }` | `{ token, user }` |
| POST | `/auth/login` | none | `{ email, password }` | `{ token, user }` |
| GET | `/auth/me` | required | — | `{ user }` |
| PATCH | `/auth/me` | required | `{ name?, email? }` | `{ user }` |
| PATCH | `/auth/me/password` | required | `{ currentPassword, newPassword }` | `{ message }` |
| PUT | `/auth/me/avatar` | required | `{ avatar: <dataURI or null> }` | `{ avatar }` |
| DELETE | `/auth/me` | required | `{ password }` | `{ message }` |
| POST | `/auth/oidc/verify` | none | `{ token }` | `{ token, user }` |

### Polls

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/polls` | required | Lists the caller's polls |
| POST | `/polls` | required | Creates a poll |
| GET | `/polls/:id` | optional | Public poll view (respects `mode === 'authenticated'`) |
| POST | `/polls/:id/responses` | optional | Submit a response |
| GET | `/polls/:id/analytics` | required, owner | Full analytics |
| PATCH | `/polls/:id/publish` | required, owner | Publish results |
| GET | `/polls/:id/results` | optional | Public results (only after publish) |

---

## Real-time updates

Client side, after navigating to analytics for a poll:

```js
const socket = io();
socket.emit('join:poll', pollId);
socket.on('response:new', ({ totalResponses, questions }) => {
  // updates the bars and totals in place
});
socket.on('poll:published', () => { /* navigate to results */ });
socket.on('poll:state', ({ totalResponses, status, expiry }) => { /* initial snapshot */ });
```

Server side, on response insert:

```js
io.to('poll:' + poll.id).emit('response:new', {
  pollId: poll.id, totalResponses,
  questions: updatedPoll.questions.map(...),
});
```

---

## Database schema

```sql
users (
  id          UUID PRIMARY KEY,
  name        VARCHAR(100),
  email       VARCHAR(322) UNIQUE,
  password    TEXT,              -- bcrypt hash, or 'oidc-no-password'
  avatar      TEXT,              -- base64 data URI or NULL
  created_at  TIMESTAMPTZ
)

polls (
  id           UUID PRIMARY KEY,
  user_id      UUID,
  title        VARCHAR(200),
  description  TEXT,
  mode         VARCHAR(20),      -- 'anonymous' | 'authenticated' | 'both'
  status       VARCHAR(20),      -- 'active' | 'expired' | 'published'
  published    BOOLEAN,
  expiry       TIMESTAMPTZ,
  starts_at    TIMESTAMPTZ,
  questions    JSONB,            -- [{ id, order, text, mandatory, options: [{id, order, text, count}] }]
  created_at   TIMESTAMPTZ
)

responses (
  id            UUID PRIMARY KEY,
  poll_id       UUID,
  user_id       UUID,             -- NULL for anonymous responses
  fingerprint   TEXT,             -- SHA-256(IP | UA | poll_id) for anon dupe prevention
  answers       JSONB,            -- [{ questionId, optionId }]
  submitted_at  TIMESTAMPTZ
)
```

Questions/options are denormalized into the polls row deliberately — they're always read with the parent poll, never independently, and the per-option counts are updated in the same UPDATE that processes a response. This keeps response submission to two queries (insert + update).

---

## Security notes

- Passwords hashed with bcrypt cost 12.
- JWTs signed with HS256; secret set via `JWT_SECRET` env var.
- All SQL parameterized — never string-interpolated.
- HTML escaping on every spot where user-controlled strings are inserted into the DOM.
- Auth checks on every protected route — not relying on the SPA hiding pages.
- Owner-only checks on analytics and publish endpoints — a logged-in attacker can't read someone else's analytics by guessing poll IDs (and IDs are UUIDs anyway).
- CORS: socket.io accepts any origin (`*`) intentionally so public poll pages on the same domain work; this can be tightened to a specific origin list in production.
- Avatar uploads validated for `data:image/` prefix and size cap to prevent arbitrary base64 payloads.

---

## Known limitations / future work

These are honest gaps. Listing them so reviewers know what's deliberate scope.

- **No email verification on signup.** The hackathon brief didn't specify it and the time budget went to features that did. A `verified_at` column + email-send + token flow is the natural addition.
- **Anonymous duplicate prevention is best-effort.** IP + UA hash catches casual repeat submissions but doesn't survive a determined attacker (private window from a different network = different fingerprint). Real protection would need an invite-link / one-time-token system, which doesn't fit "public shareable link."
- **No rate limiting on response submission.** A script could spam responses from rotating IPs. `express-rate-limit` with a per-IP and per-poll bucket is the standard fix.
- **Avg. response time isn't computed.** Would need to track response start time on the client (e.g., when the poll first renders) and compare to submission time. Not implemented because it requires a small protocol change and didn't earn enough back-of-envelope to fit in scope.
- **Multi-question types.** The brief specified single-option only, but checkbox / short-text / scale questions would be natural extensions — the JSONB schema already supports it shape-wise.
- **Export to CSV.** Useful for poll creators but not in the rubric.

---

## Acknowledgements

Built solo for the **PulseBoard: Live Polls For Feedback** hackathon, 2026 Web Dev Cohort. Thanks to the organizers.
