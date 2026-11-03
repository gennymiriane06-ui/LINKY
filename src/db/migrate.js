import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from '../config/database.js';

const migrationName = '001_initial_schema.sql';

const migrationPath = fileURLToPath(
  new URL('./migrations/001_initial_schema.sql', import.meta.url)
);

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const existing = await pool.query(
    'SELECT filename FROM schema_migrations WHERE filename = $1',
    [migrationName]
  );

  if (existing.rowCount > 0) {
    console.log(`Migration already applied: ${migrationName}`);
    return;
  }

  const sql = await readFile(migrationPath, 'utf8');

  await pool.query('BEGIN');

  try {
    await pool.query(sql);

    await pool.query(
      'INSERT INTO schema_migrations (filename) VALUES ($1)',
      [migrationName]
    );

    await pool.query('COMMIT');

    console.log(`Migration applied successfully: ${migrationName}`);
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

try {
  await migrate();
} catch (error) {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
