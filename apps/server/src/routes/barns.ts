import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth, requirePermission, resolveFarmId, audit } from '../middleware/auth.js';
import { asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `SELECT b.id, b.name, b.capacity, (SELECT count(*) FROM cows c WHERE c.barn_id = b.id AND c.status = 'active')::int AS cows
     FROM barns b WHERE b.farm_id = $1 ORDER BY b.name`,
    [farmId]
  );
  res.json({ data: rows });
}));

// Bulk create — the farm setup wizard lets an owner tick several preset barns (or add
// custom ones) and create them all in one step, rather than one at a time.
const createSchema = z.object({
  barns: z.array(z.object({ name: z.string().min(1), capacity: z.number().int().positive().optional() })).min(1).max(50),
});

router.post('/', requirePermission('farm:manage'), asyncHandler(async (req, res) => {
  const { barns } = createSchema.parse(req.body);
  const farmId = resolveFarmId(req);
  const created: { id: string; name: string; capacity: number | null }[] = [];
  for (const b of barns) {
    const { rows } = await query<{ id: string; name: string; capacity: number | null }>(
      `INSERT INTO barns (farm_id, name, capacity) VALUES ($1,$2,$3)
       ON CONFLICT (farm_id, name) DO UPDATE SET capacity = EXCLUDED.capacity
       RETURNING id, name, capacity`,
      [farmId, b.name, b.capacity ?? null]
    );
    created.push(rows[0]);
  }
  await audit(req.user, 'create', 'barn', null, { count: created.length });
  res.status(201).json({ data: created });
}));

export default router;
