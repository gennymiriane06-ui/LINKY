
import { createLinkSchema } from '../schemas/link.schema.js';
import {
  createLink,
  getLinkDetails,
  getClickHistory,
  streamClickCsv,
  deleteOwnedLink,
} from '../services/link.service.js';
import { env } from '../config/env.js';

export async function create(req, res) {
  const parsed = createLinkSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid link data',
      details: parsed.error.issues,
    });
  }

  if (
    parsed.data.expires_at &&
    new Date(parsed.data.expires_at) <= new Date()
  ) {
    return res.status(400).json({
      error: 'Expiration must be in the future',
    });
  }

  try {
    const result = await createLink(req.user.id, parsed.data);

    return res.status(result.created ? 201 : 200).json({
      code: result.link.code,
      short_url: `${env.BASE_URL}/${result.link.code}`,
      target_url: result.link.target_url,
      created_at: result.link.created_at,
      expires_at: result.link.expires_at,
      click_count: result.link.click_count,
      reused: !result.created,
    });
  } catch (error) {
    if (error.code === 'CODE_TAKEN') {
      return res.status(409).json({ error: error.message });
    }

    console.error('Link creation failed:', error.message);
    return res.status(500).json({ error: 'Unable to create link' });
  }
}

export async function getDetails(req, res) {
  try {
    const link = await getLinkDetails(req.user.id, req.params.code);

    if (!link) {
      return res.status(404).json({ error: 'Link not found' });
    }

    return res.status(200).json(link);
  } catch (error) {
    console.error('Get link failed:', error.message);
    return res.status(500).json({ error: 'Unable to retrieve link' });
  }
}

export async function getClicks(req, res) {
  const requestedLimit = req.query.limit;

  if (
    requestedLimit !== undefined &&
    (!/^\d+$/.test(requestedLimit) ||
      Number(requestedLimit) < 1 ||
      Number(requestedLimit) > 100)
  ) {
    return res.status(400).json({
      error: 'limit must be a number between 1 and 100',
    });
  }

  try {
    const result = await getClickHistory(
      req.user.id,
      req.params.code,
      {
        after: req.query.after,
        limit: requestedLimit ?? 20,
      }
    );

    if (!result) {
      return res.status(404).json({ error: 'Link not found' });
    }

    return res.status(200).json(result);
  } catch (error) {
    if (error.code === 'INVALID_CURSOR') {
      return res.status(400).json({ error: error.message });
    }

    console.error('Click history failed:', error.message);
    return res.status(500).json({ error: 'Unable to retrieve clicks' });
  }
}

export async function exportClicksCsv(req, res) {
  try {
    const found = await streamClickCsv(
      req.user.id,
      req.params.code,
      res
    );

    if (!found && !res.headersSent) {
      return res.status(404).json({ error: 'Link not found' });
    }
  } catch (error) {
    console.error('CSV export failed:', error.message);

    if (!res.headersSent) {
      return res.status(500).json({ error: 'Unable to export clicks' });
    }

    res.destroy(error);
  }
}

export async function remove(req, res) {
  try {
    const deleted = await deleteOwnedLink(
      req.user.id,
      req.params.code
    );

    if (!deleted) {
      return res.status(404).json({ error: 'Link not found' });
    }

    return res.status(204).send();
  } catch (error) {
    console.error('Delete link failed:', error.message);
    return res.status(500).json({ error: 'Unable to delete link' });
  }
}

