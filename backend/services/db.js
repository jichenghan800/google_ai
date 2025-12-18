const { Pool } = require('pg');

class Database {
  constructor() {
    this.enabled = !!process.env.DATABASE_URL;
    this.pool = null;
    if (!this.enabled) {
      console.warn('[db] DATABASE_URL not set, database features are disabled');
      return;
    }

    const sslEnabled = process.env.DATABASE_SSL === 'true' || process.env.DATABASE_SSL === '1';
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
      max: parseInt(process.env.DATABASE_POOL_SIZE || '10', 10),
    });

    this.init().catch((err) => {
      console.error('[db] initialization failed:', err);
    });
  }

  async init() {
    if (!this.enabled || !this.pool) return;
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          display_name TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'user';`);

      await client.query(`
        CREATE TABLE IF NOT EXISTS login_tokens (
          token TEXT PRIMARY KEY,
          user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          expires_at TIMESTAMPTZ NOT NULL,
          used BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS images (
          id TEXT PRIMARY KEY,
          user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          prompt TEXT NOT NULL,
          model TEXT,
          params JSONB,
          s3_url TEXT,
          is_public BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          session_id TEXT
        );
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_images_user_id ON images(user_id);`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_images_is_public ON images(is_public);`);
      await client.query(`ALTER TABLE images ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'generate';`);
      await client.query(`ALTER TABLE images ADD COLUMN IF NOT EXISTS width INTEGER;`);
      await client.query(`ALTER TABLE images ADD COLUMN IF NOT EXISTS height INTEGER;`);
      await client.query(`ALTER TABLE images ADD COLUMN IF NOT EXISTS aspect_ratio TEXT;`);
      await client.query(`ALTER TABLE images ADD COLUMN IF NOT EXISTS resolution TEXT;`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at);`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_images_kind ON images(kind);`);

      await client.query(`
        CREATE TABLE IF NOT EXISTS photo_wall (
          id TEXT PRIMARY KEY,
          image_id TEXT REFERENCES images(id) ON DELETE CASCADE,
          user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          prompt_snapshot TEXT,
          published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_photo_wall_image ON photo_wall(image_id);`);

      console.log('[db] database tables ensured');
    } finally {
      client.release();
    }
  }

  async query(text, params) {
    if (!this.enabled || !this.pool) {
      throw new Error('Database is not enabled');
    }
    return this.pool.query(text, params);
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
    }
  }
}

const database = new Database();
module.exports = database;
