const { Pool } = require('pg');
const { v4: uuid } = require('uuid');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(322) UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS polls (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL,
      title VARCHAR(200) NOT NULL,
      description TEXT DEFAULT '',
      mode VARCHAR(20) DEFAULT 'anonymous',
      status VARCHAR(20) DEFAULT 'active',
      published BOOLEAN DEFAULT FALSE,
      expiry TIMESTAMPTZ NOT NULL,
      starts_at TIMESTAMPTZ,
      questions JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS responses (
      id UUID PRIMARY KEY,
      poll_id UUID NOT NULL,
      user_id UUID,
      answers JSONB NOT NULL,
      submitted_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('Database tables ready');
}

const Users = {
  async create(name, email, hashedPassword) {
    const id = uuid();
    const { rows } = await pool.query(
      'INSERT INTO users (id, name, email, password) VALUES ($1,$2,$3,$4) RETURNING *',
      [id, name, email, hashedPassword]
    );
    return rows[0];
  },
  async findByEmail(email) {
    const { rows } = await pool.query('SELECT * FROM users WHERE email=$1 LIMIT 1', [email]);
    return rows[0] || null;
  },
  async findById(id) {
    const { rows } = await pool.query('SELECT * FROM users WHERE id=$1 LIMIT 1', [id]);
    return rows[0] || null;
  },
};

const Polls = {
  async create(userId, data) {
    const id = uuid();
    const questions = (data.questions || []).map((q, i) => ({
      id: uuid(), order: i + 1, text: q.text, mandatory: !!q.mandatory,
      options: (q.options || []).map((o, j) => ({ id: uuid(), order: j + 1, text: o.text, count: 0 })),
    }));
    const { rows } = await pool.query(
      `INSERT INTO polls (id, user_id, title, description, mode, expiry, starts_at, questions)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [id, userId, data.title, data.desc || '', data.mode || 'anonymous',
       new Date(data.expiry), data.startsAt ? new Date(data.startsAt) : null, JSON.stringify(questions)]
    );
    const poll = rows[0];
    poll.userId = poll.user_id;
    poll.questions = questions;
    return poll;
  },
  async findById(id) {
    const { rows } = await pool.query('SELECT * FROM polls WHERE id=$1 LIMIT 1', [id]);
    if (!rows[0]) return null;
    const poll = rows[0];
    poll.userId = poll.user_id;
    if (typeof poll.questions === 'string') poll.questions = JSON.parse(poll.questions);
    return poll;
  },
  async findByUserId(userId) {
    const { rows } = await pool.query('SELECT * FROM polls WHERE user_id=$1 ORDER BY created_at DESC', [userId]);
    return rows.map(p => { p.userId = p.user_id;
    p.desc = p.description; if (typeof p.questions === 'string') p.questions = JSON.parse(p.questions); return p; });
  },
  async publish(id) {
    const { rows } = await pool.query("UPDATE polls SET published=TRUE, status='published' WHERE id=$1 RETURNING *", [id]);
    return rows[0];
  },
  async checkExpiry() {
    await pool.query("UPDATE polls SET status='expired' WHERE status='active' AND expiry < NOW()");
  },
  async updateQuestionCounts(pollId, questions) {
    await pool.query('UPDATE polls SET questions=$1 WHERE id=$2', [JSON.stringify(questions), pollId]);
  },
};

const Responses = {
  async create(pollId, userId, answers, isAnonymous) {
    const id = uuid();
    const { rows } = await pool.query(
      'INSERT INTO responses (id, poll_id, user_id, answers) VALUES ($1,$2,$3,$4) RETURNING *',
      [id, pollId, isAnonymous ? null : userId, JSON.stringify(answers)]
    );
    const poll = await Polls.findById(pollId);
    if (poll) {
      answers.forEach(ans => {
        const q = poll.questions.find(q => q.id === ans.questionId);
        if (q) { const opt = q.options.find(o => o.id === ans.optionId); if (opt) opt.count++; }
      });
      await Polls.updateQuestionCounts(pollId, poll.questions);
    }
    return rows[0];
  },
  async countByPoll(pollId) {
    const { rows } = await pool.query('SELECT COUNT(*) FROM responses WHERE poll_id=$1', [pollId]);
    return parseInt(rows[0].count);
  },
  async findByPoll(pollId) {
    const { rows } = await pool.query('SELECT * FROM responses WHERE poll_id=$1', [pollId]);
    return rows;
  },
  async hasResponded(pollId, userId) {
    if (!userId) return false;
    const { rows } = await pool.query('SELECT 1 FROM responses WHERE poll_id=$1 AND user_id=$2 LIMIT 1', [pollId, userId]);
    return rows.length > 0;
  },
};

module.exports = { Users, Polls, Responses, init, pool };
