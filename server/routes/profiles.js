import { Router } from 'express';
import { z } from 'zod';
import { db, sql, round2 } from '../db.js';
import { requireAuth } from '../lib/security.js';
import { ah, ok, ApiError } from '../lib/util.js';
import { profileOwnerCheck, resetProfile } from '../lib/engine.js';
import { profilePublic } from './auth.js';

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  name: z.string().trim().min(1, 'Give your profile a name.').max(32),
  emoji: z.string().min(1).max(8).default('🦊'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#7c8bff'),
  baseCurrency: z.enum(['USD', 'EUR', 'GBP']).default('USD'),
  startingAmount: z.number().finite().min(10, 'Starting paper money must be at least 10.').max(1e10),
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(32).optional(),
  emoji: z.string().min(1).max(8).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

router.get('/', ah(async (req, res) => {
  const rows = sql.profilesForUser.all(req.auth.user.id);
  ok(res, { profiles: rows.map(profilePublic) });
}));

router.post('/', ah(async (req, res) => {
  const parsed = createSchema.safeParse(req.body || {});
  if (!parsed.success) throw new ApiError(400, 'validation', parsed.error.issues[0].message);
  const { name, emoji, color, baseCurrency, startingAmount } = parsed.data;
  const cash = round2(startingAmount);
  const now = Date.now();
  const info = sql.insertProfile.run(req.auth.user.id, name, emoji, color, baseCurrency, cash, cash, now);
  const profile = sql.profileById.get(info.lastInsertRowid);
  sql.insertEquity.run(profile.id, now, cash, cash);
  ok(res, { profile: profilePublic(profile) }, 201);
}));

router.patch('/:id', ah(async (req, res) => {
  const parsed = patchSchema.safeParse(req.body || {});
  if (!parsed.success) throw new ApiError(400, 'validation', parsed.error.issues[0].message);
  const profile = profileOwnerCheck(sql.profileById.get(Number(req.params.id)), req.auth.user.id);
  sql.updateProfile.run(parsed.data.name ?? null, parsed.data.emoji ?? null, parsed.data.color ?? null, profile.id);
  ok(res, { profile: profilePublic(sql.profileById.get(profile.id)) });
}));

router.delete('/:id', ah(async (req, res) => {
  const profile = profileOwnerCheck(sql.profileById.get(Number(req.params.id)), req.auth.user.id);
  sql.deleteProfile.run(profile.id);
  ok(res, { deleted: profile.id });
}));

router.post('/:id/reset', ah(async (req, res) => {
  const profile = profileOwnerCheck(sql.profileById.get(Number(req.params.id)), req.auth.user.id);
  const fresh = await resetProfile(profile);
  ok(res, { profile: profilePublic(fresh) });
}));

export default router;
