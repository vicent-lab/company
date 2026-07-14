import { Router } from 'express';
import { query } from '../db/index.js';
import { requireAuth, resolveFarmId } from '../middleware/auth.js';
import { asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `SELECT c.id, c.name, c.email, c.phone,
            (SELECT count(*)::int FROM sales s WHERE s.customer_id=c.id) AS orders,
            (SELECT COALESCE(SUM(s.total_amount),0)::int FROM sales s WHERE s.customer_id=c.id) AS spent,
            (SELECT payment_status FROM sales s WHERE s.customer_id=c.id ORDER BY sale_date DESC LIMIT 1) AS status
     FROM customers c WHERE c.farm_id=$1 ORDER BY c.name`, [farmId]);
  res.json({
    data: rows.map((r) => ({ id: r.id, name: r.name, email: r.email, phone: r.phone, orders: r.orders, spent: r.spent, status: r.status || 'Active' })),
    count: rows.length,
  });
}));

router.get('/:id/invoices', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT id, sale_date, total_amount, payment_status FROM sales WHERE customer_id=$1 ORDER BY sale_date DESC`, [req.params.id]);
  res.json({ data: rows.map((r) => ({ id: r.id, date: r.sale_date, amount: Number(r.total_amount), status: r.payment_status })) });
}));

export default router;
