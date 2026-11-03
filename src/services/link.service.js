
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { pool } from '../config/database.js';

function generateCode() {
  return randomBytes(6).toString('base64url').slice(0, 8);
}

export async function createLink(userId, data) {
  const targetUrl = new URL(data.target_url).toString();
  const expiresAt = data.expires_at ?? null;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let link;
    let created = false;

    const existing = await client.query(
      `SELECT id, code, target_url, created_at, expires_at, click_count
       FROM links WHERE normalized_url = $1`,
      [targetUrl]
    );

    if (existing.rowCount > 0) {
      link = existing.rows[0];
    } else {
      const code = data.code ?? generateCode();

      const inserted = await client.query(
        `INSERT INTO links
          (code, target_url, normalized_url, expires_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (normalized_url) DO NOTHING
         RETURNING id, code, target_url, created_at, expires_at, click_count`,
        [code, targetUrl, targetUrl, expiresAt]
      );

      if (inserted.rowCount) {
        link = inserted.rows[0];
        created = true;
      } else {
        const reused = await client.query(
          `SELECT id, code, target_url, created_at, expires_at, click_count
           FROM links WHERE normalized_url = $1`,
          [targetUrl]
        );
        link = reused.rows[0];
      }
    }

    await client.query(
      `INSERT INTO user_links (user_id, link_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, link.id]
    );

    await client.query('COMMIT');
    return { link, created };
  } catch (error) {
    await client.query('ROLLBACK');

    if (error.code === '23505') {
      const conflict = new Error('That short code is already taken.');
      conflict.code = 'CODE_TAKEN';
      throw conflict;
    }

    throw error;
  } finally {
    client.release();
  }
}

async function findOwnedLink(userId, code) {
  const result = await pool.query(
    `SELECT l.id, l.code, l.target_url, l.created_at,
            l.expires_at, l.click_count
     FROM links l
     JOIN user_links ul ON ul.link_id = l.id
     WHERE l.code = $1 AND ul.user_id = $2`,
    [code, userId]
  );

  return result.rows[0] ?? null;
}

export async function getLinkDetails(userId, code) {
  return findOwnedLink(userId, code);
}

function encodeCursor(click) {
  return Buffer.from(
    JSON.stringify({
      clicked_at: click.clicked_at.toISOString(),
      id: click.id,
    })
  ).toString('base64url');
}

function decodeCursor(cursor) {
  if (!cursor) return null;

  try {
    const value = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8')
    );

    if (
      !value ||
      !Number.isInteger(value.id) ||
      value.id < 1 ||
      typeof value.clicked_at !== 'string' ||
      Number.isNaN(Date.parse(value.clicked_at))
    ) {
      throw new Error('Invalid cursor');
    }

    return value;
  } catch {
    const error = new Error('Invalid pagination cursor');
    error.code = 'INVALID_CURSOR';
    throw error;
  }
}

export async function getClickHistory(userId, code, options = {}) {
  const link = await findOwnedLink(userId, code);
  if (!link) return null;

  const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);
  const cursor = decodeCursor(options.after);

  const values = [link.id];
  let cursorCondition = '';

  if (cursor) {
    values.push(cursor.clicked_at, cursor.id);
    cursorCondition = `AND (clicked_at, id) < ($2::timestamptz, $3::bigint)`;
  }

  values.push(limit + 1);

  const result = await pool.query(
    `SELECT id, clicked_at, referrer, user_agent
     FROM clicks
     WHERE link_id = $1 ${cursorCondition}
     ORDER BY clicked_at DESC, id DESC
     LIMIT $${values.length}`,
    values
  );

  const hasMore = result.rows.length > limit;
  const clicks = result.rows.slice(0, limit);
  const lastClick = clicks.at(-1);

  return {
    clicks,
    limit,
    next_cursor: hasMore && lastClick ? encodeCursor(lastClick) : null,
  };
}

export async function streamClickCsv(userId, code, res) {
  const link = await findOwnedLink(userId, code);
  if (!link) return false;

  const escapeCsv = (value) => {
    if (value === null || value === undefined) return '';
    return `"${String(value).replaceAll('"', '""')}"`;
  };

  res.status(200);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${code}-clicks.csv"`
  );

  res.write('id,clicked_at,referrer,user_agent\n');

  let cursor = null;

  while (true) {
    const values = [link.id];
    let condition = '';

    if (cursor) {
      values.push(cursor.clicked_at, cursor.id);
      condition =
        `AND (clicked_at, id) < ($2::timestamptz, $3::bigint)`;
    }

    values.push(500);

    const result = await pool.query(
      `SELECT id, clicked_at, referrer, user_agent
       FROM clicks
       WHERE link_id = $1 ${condition}
       ORDER BY clicked_at DESC, id DESC
       LIMIT $${values.length}`,
      values
    );

    if (!result.rows.length) break;

    for (const click of result.rows) {
      const line = [
        click.id,
        click.clicked_at.toISOString(),
        escapeCsv(click.referrer),
        escapeCsv(click.user_agent),
      ].join(',') + '\n';

      if (!res.write(line)) {
        await once(res, 'drain');
      }
    }

    const last = result.rows.at(-1);
    cursor = {
      clicked_at: last.clicked_at.toISOString(),
      id: last.id,
    };

    if (result.rows.length < 500) break;
  }

  res.end();
  return true;
}

export async function deleteOwnedLink(userId, code) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const ownership = await client.query(
      `DELETE FROM user_links
       WHERE user_id = $1
       AND link_id = (
         SELECT id FROM links WHERE code = $2
       )
       RETURNING link_id`,
      [userId, code]
    );

    if (!ownership.rowCount) {
      await client.query('ROLLBACK');
      return false;
    }

    // Keep a shared link while another user still owns it.
    await client.query(
      `DELETE FROM links
       WHERE id = $1
       AND NOT EXISTS (
         SELECT 1 FROM user_links WHERE link_id = $1
       )`,
      [ownership.rows[0].link_id]
    );

    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

