
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

// Load Linkly API documentation.
const openapiDocument = YAML.parse(
  readFileSync(
    path.join(__dirname, '../docs/openapi.yaml'),
    'utf8'
  )
);

// Ensure the documentation displays Linkly branding.
openapiDocument.info = {
  ...openapiDocument.info,
  title: 'Linkly API',
  description: `
# Welcome to Linkly

A URL Shortening and Analytics API built with Node.js and PostgreSQL.

Linkly helps you create short links, manage custom URLs,
redirect visitors and monitor link performance through click analytics.

## Main Features

- User registration and authentication
- URL shortening and custom short codes
- Fast URL redirection
- Link expiration management
- Click tracking and analytics
- Paginated click history
- CSV analytics export

Use the Authorize button to provide your JWT access token
when accessing protected endpoints.
  `,
  version: '1.0.0',
};

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

// Custom Linkly Swagger appearance.
const swaggerOptions = {
  customSiteTitle: 'Linkly | API Documentation',
  customfavIcon: 'https://cdn.jsdelivr.net/npm/lucide-static@latest/icons/link-2.svg',
  customCss: `
    body {
      background: #f8fafc;
    }

    .swagger-ui .topbar {
      background: #111827;
      padding: 14px 0;
    }

    .swagger-ui .topbar-wrapper {
      display: flex;
      align-items: center;
    }

    .swagger-ui .topbar-wrapper img {
      display: none;
    }

    .swagger-ui .topbar-wrapper::after {
      content: "LINKLY";
      color: #ffffff;
      font-size: 25px;
      font-weight: 800;
      letter-spacing: 3px;
      margin-left: 10px;
    }

    .swagger-ui .topbar-wrapper::before {
      content: "↗";
      color: #60a5fa;
      font-size: 30px;
      font-weight: bold;
    }

    .swagger-ui .info {
      margin: 35px 0;
    }

    .swagger-ui .info .title {
      color: #111827;
      font-size: 34px;
      font-weight: 800;
    }

    .swagger-ui .info p,
    .swagger-ui .info li {
      color: #475569;
      line-height: 1.7;
    }

    .swagger-ui .scheme-container {
      background: #ffffff;
      box-shadow: none;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 15px;
    }

    .swagger-ui .opblock {
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 12px;
    }

    .swagger-ui .opblock .opblock-summary {
      padding: 12px;
    }

    .swagger-ui .btn.authorize {
      color: #15803d;
      border-color: #15803d;
      border-radius: 6px;
    }

    .swagger-ui .btn.authorize svg {
      fill: #15803d;
    }

    .swagger-ui section.models {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
    }

    .swagger-ui .model-box {
      background: #f8fafc;
    }

    .swagger-ui .info a {
      color: #2563eb;
    }
  `,
  customSiteTitle: 'Linkly | API Documentation',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    docExpansion: 'list',
    defaultModelsExpandDepth: 1,
  },
};

// Swagger documentation.
app.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(openapiDocument, swaggerOptions)
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

    // Increment click counter atomically.
    await client.query(
      `UPDATE links
       SET click_count = click_count + 1
       WHERE id = $1`,
      [link.id]
    );

    // Record visitor information.
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

// Start server.
const server = app.listen(env.PORT, () => {
  console.log(`Linkly API running at ${env.BASE_URL}`);
  console.log(`API Documentation: ${env.BASE_URL}/docs`);
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