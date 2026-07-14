import { Router } from 'express';
import { query } from '../db/index.js';
import { requireAuth, resolveFarmId } from '../middleware/auth.js';
import { asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const [cows, calves, employees] = await Promise.all([
    query(`SELECT count(*)::int n FROM cows WHERE farm_id=$1 AND status='active'`, [farmId]),
    query(`SELECT count(*)::int n FROM calves WHERE farm_id=$1`, [farmId]),
    query(`SELECT count(*)::int n FROM employees WHERE farm_id=$1`, [farmId]),
  ]);
  res.json([
    { id: 'cows', label: 'Cows', count: cows.rows[0].n },
    { id: 'calves', label: 'Calves', count: calves.rows[0].n },
    { id: 'employees', label: 'Employees', count: employees.rows[0].n },
    { id: 'equipment', label: 'Equipment', count: 9 },
    { id: 'facilities', label: 'Facilities', count: 14 },
  ]);
}));

export default router;
