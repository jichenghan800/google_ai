const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const DEFAULT_ALLOWED_SUFFIXES = ['cotticoffee.com', 'abite.com'];
const TOKEN_TTL_MINUTES = parseInt(process.env.AUTH_LOGIN_TOKEN_TTL_MIN || '15', 10);
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const JWT_SECRET = process.env.JWT_SECRET || '';
const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'auth_token';
const ADMIN_EMAILS = process.env.ADMIN_EMAILS || '';
const ADMIN_DEFAULT_TIER = process.env.ADMIN_DEFAULT_TIER || 'svip';
const VALID_ROLES = ['user', 'admin'];

const isEmailAuthEnabled = () => {
  const flag = process.env.AUTH_EMAIL_ENABLED === 'true' || process.env.AUTH_EMAIL_ENABLED === '1';
  if (!flag) return false;
  if (!db.enabled) {
    console.warn('[auth] Email auth enabled but DATABASE_URL is missing - disabling auth');
    return false;
  }
  if (!JWT_SECRET) {
    console.warn('[auth] JWT_SECRET missing - disabling auth');
    return false;
  }
  return true;
};

const parseAllowedSuffixes = () => {
  const raw = process.env.AUTH_ALLOWED_EMAIL_SUFFIXES;
  const base = raw ? raw.split(',') : DEFAULT_ALLOWED_SUFFIXES;
  return base
    .map((s) => String(s || '').trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
};

const parseAdminEmails = () => {
  if (!ADMIN_EMAILS) return [];
  return ADMIN_EMAILS.split(',')
    .map((s) => String(s || '').trim().toLowerCase())
    .filter(Boolean);
};

const normalizeTier = (tier) => {
  const val = String(tier || '').toLowerCase();
  if (['vip', 'svip', 'user'].includes(val)) return val;
  return 'user';
};

const toUserDto = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name || row.email?.split('@')[0],
    role: row.role || 'user',
    tier: normalizeTier(row.tier)
  };
};

const ensureAdminFlags = async (userRow) => {
  if (!db.enabled || !userRow) return toUserDto(userRow);
  const adminList = parseAdminEmails();
  const shouldBeAdmin = adminList.includes((userRow.email || '').toLowerCase());
  const nextRole = shouldBeAdmin ? 'admin' : 'user';
  const nextTier = shouldBeAdmin ? normalizeTier(ADMIN_DEFAULT_TIER) : normalizeTier(userRow.tier);

  if (userRow.role !== nextRole || normalizeTier(userRow.tier) !== nextTier) {
    await db.query('UPDATE users SET role = $1, tier = $2 WHERE id = $3', [nextRole, nextTier, userRow.id]);
    return toUserDto({ ...userRow, role: nextRole, tier: nextTier });
  }
  return toUserDto({ ...userRow, role: nextRole, tier: nextTier });
};

const isEmailAllowed = (email) => {
  if (!email) return false;
  const parts = String(email).toLowerCase().split('@');
  if (parts.length !== 2) return false;
  const domain = parts[1];
  const allowed = parseAllowedSuffixes();
  return allowed.includes(domain);
};

const getOrCreateUserByEmail = async (email) => {
  if (!db.enabled) throw new Error('Database not configured');
  const normalized = String(email).toLowerCase();
  const existing = await db.query('SELECT * FROM users WHERE email = $1 LIMIT 1', [normalized]);
  if (existing.rows.length) return ensureAdminFlags(existing.rows[0]);
  const id = uuidv4();
  const insert = await db.query(
    'INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3) RETURNING *',
    [id, normalized, normalized.split('@')[0]]
  );
  return ensureAdminFlags(insert.rows[0]);
};

const createLoginToken = async (userId) => {
  const token = uuidv4();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);
  await db.query(
    'INSERT INTO login_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)',
    [token, userId, expiresAt.toISOString()]
  );
  return { token, expiresAt };
};

const consumeLoginToken = async (token) => {
  const res = await db.query('SELECT * FROM login_tokens WHERE token = $1 LIMIT 1', [token]);
  if (!res.rows.length) return { ok: false, error: 'Token not found' };
  const row = res.rows[0];
  if (row.used) return { ok: false, error: 'Token already used' };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, error: 'Token expired' };
  await db.query('UPDATE login_tokens SET used = TRUE WHERE token = $1', [token]);
  const userRes = await db.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [row.user_id]);
  if (!userRes.rows.length) return { ok: false, error: 'User not found' };
  return { ok: true, user: await ensureAdminFlags(userRes.rows[0]) };
};

const signJwt = (user) => {
  if (!JWT_SECRET) throw new Error('JWT_SECRET not configured');
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role || 'user', tier: normalizeTier(user.tier) },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

const verifyJwt = (token) => {
  if (!token || !JWT_SECRET) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
};

const setAuthCookie = (res, token) => {
  const secure =
    process.env.AUTH_COOKIE_SECURE === 'true' ||
    process.env.AUTH_COOKIE_SECURE === '1' ||
    process.env.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: secure ? 'none' : 'lax',
    secure,
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
};

const clearAuthCookie = (res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax'
  });
};

const extractToken = (req) => {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7);
  }
  if (req.cookies && req.cookies[COOKIE_NAME]) {
    return req.cookies[COOKIE_NAME];
  }
  return null;
};

const attachUserIfEnabled = async (req, res, next) => {
  if (!isEmailAuthEnabled()) return next();
  const token = extractToken(req);
  if (!token) return res.status(401).json({ success: false, error: 'Unauthenticated' });
  const payload = verifyJwt(token);
  if (!payload) return res.status(401).json({ success: false, error: 'Invalid token' });

  if (db.enabled) {
    try {
      const userRes = await db.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [payload.sub]);
      if (!userRes.rows.length) return res.status(401).json({ success: false, error: 'Invalid token' });
      req.user = await ensureAdminFlags(userRes.rows[0]);
    } catch (e) {
      console.error('attachUserIfEnabled db error:', e);
      return res.status(500).json({ success: false, error: 'Auth lookup failed' });
    }
  } else {
    req.user = { id: payload.sub, email: payload.email, role: payload.role || 'user', tier: normalizeTier(payload.tier) };
  }
  return next();
};

const attachUserSoft = async (req, res, next) => {
  if (!isEmailAuthEnabled()) return next();
  const token = extractToken(req);
  if (!token) return next();
  const payload = verifyJwt(token);
  if (payload) {
    if (db.enabled) {
      try {
        const userRes = await db.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [payload.sub]);
        if (userRes.rows.length) {
          req.user = await ensureAdminFlags(userRes.rows[0]);
        }
      } catch (e) {
        console.error('attachUserSoft db error:', e);
      }
    } else {
      req.user = { id: payload.sub, email: payload.email, role: payload.role || 'user', tier: normalizeTier(payload.tier) };
    }
  }
  return next();
};

const getUserById = async (id) => {
  if (!db.enabled) return null;
  const res = await db.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
  if (!res.rows.length) return null;
  return ensureAdminFlags(res.rows[0]);
};

const updateUserTier = async (userId, tier) => {
  if (!db.enabled) throw new Error('Database not configured');
  const nextTier = normalizeTier(tier);
  await db.query('UPDATE users SET tier = $1 WHERE id = $2', [nextTier, userId]);
  const res = await db.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [userId]);
  if (!res.rows.length) return null;
  return ensureAdminFlags(res.rows[0]);
};

const updateUserAccess = async (userId, { role, tier }) => {
  if (!db.enabled) throw new Error('Database not configured');
  const updates = [];
  const params = [];
  if (role) {
    const safeRole = String(role).toLowerCase();
    if (!VALID_ROLES.includes(safeRole)) throw new Error('Invalid role');
    updates.push(`role = $${updates.length + 1}`);
    params.push(safeRole);
  }
  if (tier) {
    updates.push(`tier = $${updates.length + 1}`);
    params.push(normalizeTier(tier));
  }
  if (!updates.length) return null;
  params.push(userId);
  const res = await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  if (!res.rows.length) return null;
  return ensureAdminFlags(res.rows[0]);
};

const listUsersWithStats = async ({ email, limit = 20, offset = 0 }) => {
  if (!db.enabled) throw new Error('Database not configured');
  const where = [];
  const params = [];
  if (email) {
    params.push(`%${email.toLowerCase()}%`);
    where.push(`LOWER(u.email) LIKE $${params.length}`);
  }
  params.push(parseInt(limit, 10) || 20);
  params.push(parseInt(offset, 10) || 0);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await db.query(
    `
    WITH img_stats AS (
      SELECT user_id,
             COUNT(*) AS total_images,
             SUM(CASE WHEN kind = 'generate' THEN 1 ELSE 0 END) AS generate_count,
             SUM(CASE WHEN kind = 'edit' THEN 1 ELSE 0 END) AS edit_count,
             MAX(created_at) AS last_created_at
      FROM images
      GROUP BY user_id
    )
    SELECT u.id,
           u.email,
           u.display_name,
           u.role,
           u.tier,
           COALESCE(s.total_images, 0) AS total_images,
           COALESCE(s.generate_count, 0) AS generate_count,
           COALESCE(s.edit_count, 0) AS edit_count,
           s.last_created_at
    FROM users u
    LEFT JOIN img_stats s ON s.user_id = u.id
    ${whereSql}
    ORDER BY COALESCE(s.total_images, 0) DESC, u.email ASC
    LIMIT $${params.length - 1} OFFSET $${params.length};
    `,
    params
  );
  const countRes = await db.query(`SELECT COUNT(*) FROM users u ${whereSql};`, params.slice(0, params.length - 2));
  return {
    items: rows.rows.map((r) => ({
      id: r.id,
      email: r.email,
      displayName: r.display_name || r.email?.split('@')[0],
      role: r.role || 'user',
      tier: normalizeTier(r.tier),
      totalImages: parseInt(r.total_images, 10) || 0,
      generateCount: parseInt(r.generate_count, 10) || 0,
      editCount: parseInt(r.edit_count, 10) || 0,
      lastCreatedAt: r.last_created_at
    })),
    total: parseInt(countRes.rows[0].count, 10),
    limit: parseInt(limit, 10) || 20,
    offset: parseInt(offset, 10) || 0
  };
};

module.exports = {
  isEmailAuthEnabled,
  parseAllowedSuffixes,
  parseAdminEmails,
  isEmailAllowed,
  getOrCreateUserByEmail,
  createLoginToken,
  consumeLoginToken,
  signJwt,
  setAuthCookie,
  clearAuthCookie,
  attachUserIfEnabled,
  attachUserSoft,
  getUserById,
  updateUserTier,
  updateUserAccess,
  listUsersWithStats,
  normalizeTier
};
