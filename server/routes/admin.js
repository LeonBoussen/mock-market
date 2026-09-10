import { Router } from 'express';
import { requireAuth, requireAdmin } from '../lib/security.js';
import { ah, ok } from '../lib/util.js';
import { resetAllData, adminStats } from '../lib/reset.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/stats', ah(async (req, res) => {
  ok(res, { stats: adminStats() });
}));

router.post('/reset', ah(async (req, res) => {
  resetAllData();
  ok(res, { reset: true, stats: adminStats() });
}));

export default router;
