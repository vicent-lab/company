import { Router } from 'express';
import { query } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

// GET /farms  — list farms the user can access (all for admin)
router.get('/', asyncHandler(async (req, res) => {
  const isAdmin = req.user!.role === 'administrator';
  const sql = isAdmin
    ? `SELECT f.id, f.name, f.address, f.phone, (SELECT count(*) FROM cows c WHERE c.farm_id=f.id)::int AS cows FROM farms f ORDER BY f.name`
    : `SELECT f.id, f.name, f.address, f.phone, (SELECT count(*) FROM cows c WHERE c.farm_id=f.id)::int AS cows FROM farms f WHERE f.id = $1`;
  const params = isAdmin ? [] : [req.user!.farmId];
  const { rows } = await query(sql, params);
  res.json({ data: rows, count: rows.length });
}));

// GET /farms/:id/summary — quick KPIs for a farm (admins can pass any id via ?farmId not needed here)
router.get('/:id/summary', asyncHandler(async (req, res) => {
  const farmId = req.params.id;
  if (req.user!.role !== 'administrator' && farmId !== req.user!.farmId)
    throw new HttpError(403, 'Access denied');
  const { rows } = await query(
    `SELECT
       (SELECT count(*) FROM cows WHERE farm_id=$1 AND status='active')::int AS total_cows,
       (SELECT count(*) FROM cows WHERE farm_id=$1 AND is_milking)::int AS milking_cows,
       (SELECT count(*) FROM cows WHERE farm_id=$1 AND is_pregnant)::int AS pregnant_cows,
       (SELECT count(*) FROM cows WHERE farm_id=$1 AND health<>'healthy')::int AS sick_cows
     `, [farmId]
  );
  res.json(rows[0]);
}));

export default router;
