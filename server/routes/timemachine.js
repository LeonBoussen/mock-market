import { Router } from 'express';
import { z } from 'zod';
import { sql } from '../db.js';
import { requireAuth } from '../lib/security.js';
import { ah, ok, ApiError } from '../lib/util.js';
import { runSimulation, saveSim, simSummary } from '../lib/tm.js';

const router = Router();
router.use(requireAuth);

const simSchema = z.object({
  symbol: z.string().min(1).max(40),
  amount: z.number().finite().positive().max(1e12),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  exitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

router.post('/simulate', ah(async (req, res) => {
  const parsed = simSchema.safeParse(req.body || {});
  if (!parsed.success) throw new ApiError(400, 'validation', parsed.error.issues[0].message);
  const { symbol, amount, startDate, exitDate } = parsed.data;
  const out = await runSimulation({ symbol: symbol.toUpperCase(), startDate, exitDate: exitDate || null, amount });
  ok(res, out);
}));

router.post('/sims', ah(async (req, res) => {
  const parsed = simSchema.safeParse(req.body || {});
  if (!parsed.success) throw new ApiError(400, 'validation', parsed.error.issues[0].message);
  const { symbol, amount, startDate, exitDate } = parsed.data;
  const { result, series } = await runSimulation({ symbol: symbol.toUpperCase(), startDate, exitDate: exitDate || null, amount });
  const row = saveSim(req.auth.user.id, result, series);
  ok(res, { sim: simSummary(row) }, 201);
}));

router.get('/sims', ah(async (req, res) => {
  const rows = sql.simsForUser.all(req.auth.user.id);
  ok(res, { sims: rows.map(simSummary) });
}));

router.get('/sims/:id', ah(async (req, res) => {
  const row = sql.simById.get(Number(req.params.id));
  if (!row || row.user_id !== req.auth.user.id) throw new ApiError(404, 'not_found', 'Simulation not found.');
  let payload = null;
  try {
    payload = JSON.parse(row.payload);
  } catch {
    throw new ApiError(500, 'corrupt', 'Saved simulation payload is unreadable.');
  }
  ok(res, { sim: { ...simSummary(row), result: payload.result, series: payload.series } });
}));

router.delete('/sims/:id', ah(async (req, res) => {
  const row = sql.simById.get(Number(req.params.id));
  if (!row || row.user_id !== req.auth.user.id) throw new ApiError(404, 'not_found', 'Simulation not found.');
  sql.deleteSim.run(row.id);
  ok(res, { deleted: row.id });
}));

export default router;
