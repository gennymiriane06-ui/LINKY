
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

import linkRoutes from './routes/link.routes.js';
import authRoutes from './routes/auth.routes.js';
import { env } from './config/env.js';
import { pool } from './config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load OpenAPI documentation.
const openapiDocument = YAML.parse(
  readFileSync(
    path.join(__dirname, '../docs/openapi.yaml'),
    'utf8'
  )
);

const app = express();

console.log(
  'Swagger paths loaded:',
  Object.keys(openapiDocument.paths || {})
);

// Security and application middleware.
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10kb' }));

// Authentication and link routes.
app.use('/auth', authRoutes);
app.use('/links', linkRoutes);

// Swagger documentation.
app.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(openapiDocument)
);

// Welcome route.
app.get('/', (req, res) => {
  return res.status(200).json({
    message: 'Welcome to Linkly API',
    docs: '/docs',
    health: '/health',
  });
});

// Health check.
// IMPORTANT: This must come before the redirect route.
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');

    return res.status(200).json({
      status: 'ok',
      service: 'Linkly API',
      database: 'connected',
    });
  } catch (error) {
    console.error('Health check failed:', error.message);

    return res.status(503).json({
      status: 'error',
      database: 'unavailable',
    });
  }
});

// Redirect visitors and record each click.
app.get('/:code', async (req, res) => {
  let client;

  try {
    client = await pool.connect();

    await client.query('BEGIN');

    const result = await client.query(
      `SELECT id, target_url, expires_at
       FROM links
       WHERE code = $1
       FOR UPDATE`,
      [req.params.code]
    );

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        error: 'Short link not found',
      });
    }

    const link = result.rows[0];

    if (
      link.expires_at &&
      new Date(link.expires_at) <= new Date()
    ) {
      await client.query('ROLLBACK');

      return res.status(410).json({
        error: 'This short link has expired',
      });
    }

    // Increment the click counter atomically.
    await client.query(
      `UPDATE links
       SET click_count = click_count + 1
       WHERE id = $1`,
      [link.id]
    );

    // Save information about the visit.
    await client.query(
      `INSERT INTO clicks (link_id, referrer, user_agent)
       VALUES ($1, $2, $3)`,
      [
        link.id,
        req.get('referer') || null,
        req.get('user-agent') || null,
      ]
    );

    await client.query('COMMIT');

    return res.redirect(302, link.target_url);
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
    }

    console.error('Redirect error:', error.message);

    return res.status(500).json({
      error: 'Unable to redirect right now',
    });
  } finally {
    client?.release();
  }
});

// Handle unknown routes.
app.use((req, res) => {
  return res.status(404).json({
    error: 'Route not found',
    path: req.path,
  });
});

// Start the server.
const server = app.listen(env.PORT, () => {
  console.log(`Linkly API running at ${env.BASE_URL}`);
});

// Graceful shutdown.
function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export { app, server };
