const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const ensureDb = () => {
  if (!db.enabled) {
    throw new Error('Database not configured');
  }
};

const saveImageRecord = async ({
  id,
  userId,
  prompt,
  model,
  params,
  s3Url,
  sessionId,
  kind = 'generate',
  width = null,
  height = null,
  aspectRatio = null,
  resolution = null
}) => {
  ensureDb();
  const sql = `
    INSERT INTO images (id, user_id, prompt, model, params, s3_url, is_public, session_id, kind, width, height, aspect_ratio, resolution)
    VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (id) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      prompt = EXCLUDED.prompt,
      model = EXCLUDED.model,
      params = EXCLUDED.params,
      s3_url = EXCLUDED.s3_url,
      session_id = EXCLUDED.session_id,
      kind = EXCLUDED.kind,
      width = EXCLUDED.width,
      height = EXCLUDED.height,
      aspect_ratio = EXCLUDED.aspect_ratio,
      resolution = EXCLUDED.resolution
    RETURNING *;
  `;
  const res = await db.query(sql, [
    id,
    userId || null,
    prompt,
    model || null,
    params ? JSON.stringify(params) : null,
    s3Url || null,
    sessionId || null,
    kind || 'generate',
    width,
    height,
    aspectRatio,
    resolution
  ]);
  return res.rows[0];
};

const saveGeneratedImage = async (payload) => {
  return saveImageRecord({ ...payload, kind: 'generate' });
};

const saveEditedImage = async (payload) => {
  return saveImageRecord({ ...payload, kind: 'edit' });
};

const listImagesByUser = async (userId, limit = 20, offset = 0) => {
  ensureDb();
  const res = await db.query(
    'SELECT * FROM images WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
    [userId, limit, offset]
  );
  const totalRes = await db.query('SELECT COUNT(*) FROM images WHERE user_id = $1', [userId]);
  return { items: res.rows, total: parseInt(totalRes.rows[0].count, 10) };
};

const getImageById = async (id) => {
  ensureDb();
  const res = await db.query('SELECT * FROM images WHERE id = $1 LIMIT 1', [id]);
  return res.rows[0] || null;
};

const publishToWall = async ({ imageId, userId, promptSnapshot }) => {
  ensureDb();
  const id = uuidv4();
  const res = await db.query(
    `
    INSERT INTO photo_wall (id, image_id, user_id, prompt_snapshot)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (image_id) DO UPDATE SET user_id = EXCLUDED.user_id, prompt_snapshot = EXCLUDED.prompt_snapshot
    RETURNING *;
  `,
    [id, imageId, userId || null, promptSnapshot || null]
  );
  await db.query('UPDATE images SET is_public = TRUE WHERE id = $1', [imageId]);
  return res.rows[0];
};

const unpublishFromWall = async (imageId) => {
  ensureDb();
  await db.query('DELETE FROM photo_wall WHERE image_id = $1', [imageId]);
  await db.query('UPDATE images SET is_public = FALSE WHERE id = $1', [imageId]);
  return true;
};

const listPhotoWall = async (limit = 50, offset = 0) => {
  ensureDb();
  const res = await db.query(
    `
    SELECT pw.*, img.prompt, img.s3_url, img.model, img.user_id
    FROM photo_wall pw
    LEFT JOIN images img ON img.id = pw.image_id
    ORDER BY pw.published_at DESC
    LIMIT $1 OFFSET $2;
  `,
    [limit, offset]
  );
  const totalRes = await db.query('SELECT COUNT(*) FROM photo_wall', []);
  return { items: res.rows, total: parseInt(totalRes.rows[0].count, 10) };
};

module.exports = {
  saveGeneratedImage,
  saveEditedImage,
  saveImageRecord,
  listImagesByUser,
  getImageById,
  publishToWall,
  unpublishFromWall,
  listPhotoWall
};
