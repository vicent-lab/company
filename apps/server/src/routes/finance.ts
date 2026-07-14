import { Router } from 'express';
import { query } from '../db/index.js';
import { requireAuth, resolveFarmId } from '../middleware/auth.js';
import { asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);
const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

router.get('/', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const income = await query(
    `SELECT to_char(received_on,'Mon') AS m, SUM(amount) AS v FROM income WHERE farm_id=$1 AND received_on >= date_trunc('year', current_date) GROUP BY 1, date_trunc('month', received_on) ORDER BY date_trunc('month', received_on)`, [farmId]);
  const expense = await query(
    `SELECT to_char(incurred_on,'Mon') AS m, SUM(amount) AS v FROM expenses WHERE farm_id=$1 AND incurred_on >= date_trunc('year', current_date) GROUP BY 1, date_trunc('month', incurred_on) ORDER BY date_trunc('month', incurred_on)`, [farmId]);
  const cat = await query(
    `SELECT category, SUM(amount) AS v FROM expenses WHERE farm_id=$1 AND incurred_on >= date_trunc('year', current_date) GROUP BY category ORDER BY v DESC`, [farmId]);
  const outstanding = await query(
    `SELECT COALESCE(SUM(total_amount),0) AS o FROM sales WHERE farm_id=$1 AND payment_status <> 'paid'`, [farmId]);
  const sales = await query(
    `SELECT to_char(sale_date,'Mon') AS m, count(*)::int AS n FROM sales WHERE farm_id=$1 AND sale_date >= date_trunc('year', current_date) GROUP BY 1, date_trunc('month', sale_date) ORDER BY date_trunc('month', sale_date)`, [farmId]);
  const im = new Map(income.rows.map((r) => [r.m, Math.round(Number(r.v))]));
  const em = new Map(expense.rows.map((r) => [r.m, Math.round(Number(r.v))]));
  const sm = new Map(sales.rows.map((r) => [r.m, r.n]));
  res.json({
    cashFlow: months.map((m, i) => (im.get(m) ?? 0) - (em.get(m) ?? 0)),
    outstanding: Math.round(Number(outstanding.rows[0].o)),
    categories: cat.rows.map((r) => ({ name: r.category, value: Math.round(Number(r.v)) })),
    salesTrend: months.map((m) => sm.get(m) ?? 0),
    incomeTotal: months.reduce((s, m) => s + (im.get(m) ?? 0), 0),
    expenseTotal: months.reduce((s, m) => s + (em.get(m) ?? 0), 0),
  });
}));

export default router;
