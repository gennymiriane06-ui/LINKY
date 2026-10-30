
import { Router } from 'express';
import {
  create,
  getDetails,
  getClicks,
  exportClicksCsv,
  remove,
} from '../controllers/link.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/', requireAuth, create);
router.get('/:code/clicks.csv', requireAuth, exportClicksCsv);
router.get('/:code/clicks', requireAuth, getClicks);
router.get('/:code', requireAuth, getDetails);
router.delete('/:code', requireAuth, remove);

export default router;

