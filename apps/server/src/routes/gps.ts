import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth, resolveFarmId } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { employeeId, startDate, endDate } = req.query;
  let sql = `SELECT g.*, u.name as employee_name, e.job_title FROM gps_locations g JOIN employees e ON e.id = g.employee_id LEFT JOIN users u ON u.id = e.user_id WHERE g.farm_id=$1`;
  const params: any[] = [farmId];
  if (employeeId) { sql += ` AND g.employee_id=$${params.length + 1}`; params.push(employeeId); }
  if (startDate) { sql += ` AND g.created_at>=$${params.length + 1}`; params.push(startDate); }
  if (endDate) { sql += ` AND g.created_at<=$${params.length + 1}::date + interval '1 day'`; params.push(endDate); }
  sql += ' ORDER BY g.created_at DESC LIMIT 500';
  const { rows } = await query(sql, params);
  res.json({ data: rows, count: rows.length });
}));

const schema = z.object({
  employeeId: z.string().min(1),
  latitude: z.number(),
  longitude: z.number(),
  accuracy: z.number().optional(),
  checkedIn: z.boolean().default(true),
});

router.post('/', asyncHandler(async (req, res) => {
  const b = schema.parse(req.body);
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `INSERT INTO gps_locations (farm_id, employee_id, latitude, longitude, accuracy, checked_in) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [farmId, b.employeeId, b.latitude, b.longitude, b.accuracy ?? null, b.checkedIn]
  );
  res.status(201).json(rows[0]);
}));

export default router;
