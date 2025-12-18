const express = require('express');
const router = express.Router();
const db = require('../services/db');
const authService = require('../services/authService');
const { updateUserTier, updateUserAccess, listUsersWithStats } = require('../services/authService');

const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Unauthenticated' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Forbidden: admin only' });
  }
  return next();
};

router.use(authService.attachUserIfEnabled);

// Image level analytics with filters
router.get('/image-stats', requireAdmin, async (req, res) => {
  if (!db.enabled) return res.status(503).json({ success: false, error: 'Database not configured' });
  const { userEmail, kind, resolution, aspectRatio, start, end, limit = 50, offset = 0 } = req.query;
  const where = [];
  const params = [];

  if (userEmail) {
    params.push(userEmail.toLowerCase());
    where.push(`LOWER(u.email) = $${params.length}`);
  }
  if (kind) {
    params.push(kind);
    where.push(`img.kind = $${params.length}`);
  }
  if (resolution) {
    params.push(resolution);
    where.push(`img.resolution = $${params.length}`);
  }
  if (aspectRatio) {
    params.push(aspectRatio);
    where.push(`img.aspect_ratio = $${params.length}`);
  }
  if (start) {
    params.push(start);
    where.push(`img.created_at >= $${params.length}`);
  }
  if (end) {
    params.push(end);
    where.push(`img.created_at <= $${params.length}`);
  }

  params.push(parseInt(limit) || 50);
  params.push(parseInt(offset) || 0);

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const rows = await db.query(
      `
      SELECT img.*, u.email AS user_email, u.display_name, u.role AS user_role, u.tier AS user_tier, u.id AS user_id
      FROM images img
      LEFT JOIN users u ON u.id = img.user_id
      ${whereSql}
      ORDER BY img.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length};
    `,
      params
    );

    const countRes = await db.query(
      `
      SELECT COUNT(*) FROM images img
      LEFT JOIN users u ON u.id = img.user_id
      ${whereSql};
    `,
      params.slice(0, params.length - 2)
    );

    res.json({
      success: true,
      data: {
        items: rows.rows,
        total: parseInt(countRes.rows[0].count, 10),
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('admin image-stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stats', message: error.message });
  }
});

// Aggregated summary
router.get('/image-summary', requireAdmin, async (req, res) => {
  if (!db.enabled) return res.status(503).json({ success: false, error: 'Database not configured' });
  try {
    const byKind = await db.query(
      `SELECT kind, COUNT(*) AS count FROM images GROUP BY kind ORDER BY count DESC;`
    );
    const byResolution = await db.query(
      `SELECT resolution, COUNT(*) AS count FROM images GROUP BY resolution ORDER BY count DESC;`
    );
    const byAspect = await db.query(
      `SELECT aspect_ratio, COUNT(*) AS count FROM images GROUP BY aspect_ratio ORDER BY count DESC;`
    );
    const latest = await db.query(
      `SELECT img.id, img.kind, img.resolution, img.aspect_ratio, img.created_at, u.email, u.tier, u.id AS user_id
       FROM images img
       LEFT JOIN users u ON u.id = img.user_id
       ORDER BY img.created_at DESC
       LIMIT 10;`
    );

    res.json({
      success: true,
      data: {
        byKind: byKind.rows,
        byResolution: byResolution.rows,
        byAspectRatio: byAspect.rows,
        latest: latest.rows
      }
    });
  } catch (error) {
    console.error('admin image-summary error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch summary', message: error.message });
  }
});

// Update user tier (vip/svip/user)
router.post('/users/:userId/tier', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { tier } = req.body || {};
    if (!tier) return res.status(400).json({ success: false, error: 'tier is required' });
    const updated = await updateUserTier(userId, tier);
    if (!updated) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('admin update tier error:', error);
    res.status(500).json({ success: false, error: 'Failed to update tier', message: error.message });
  }
});

// List users with usage stats
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const { email, limit = 20, offset = 0 } = req.query;
    const data = await listUsersWithStats({ email, limit, offset });
    res.json({ success: true, data });
  } catch (error) {
    console.error('admin users list error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch users', message: error.message });
  }
});

// Update user role/tier
router.post('/users/:userId/access', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { role, tier } = req.body || {};
    if (!role && !tier) return res.status(400).json({ success: false, error: 'role or tier is required' });
    const updated = await updateUserAccess(userId, { role, tier });
    if (!updated) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('admin update access error:', error);
    res.status(500).json({ success: false, error: 'Failed to update access', message: error.message });
  }
});

module.exports = router;
