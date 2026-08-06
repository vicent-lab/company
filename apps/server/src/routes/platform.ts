import { Router } from 'express';
import { query } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

// Every route here is platform-wide by design (spans every tenant), so it's gated to a
// true Super Admin only — never to a farm's own 'administrator' role, which is scoped to
// its own farm(s) like any other role (see middleware/auth.ts's isSuperAdmin).
router.use((req, _res, next) => {
  if (!req.user!.isSuperAdmin) return next(new HttpError(403, 'Super admin access required'));
  next();
});

router.get('/overview', asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `SELECT
       (SELECT count(*) FROM farms)::int AS total_farms,
       (SELECT count(*) FROM users WHERE is_active)::int AS total_users,
       (SELECT count(*) FROM cows WHERE status = 'active')::int AS total_cows,
       (SELECT count(*) FROM users WHERE is_active AND created_at > now() - interval '7 days')::int AS new_users_7d,
       (SELECT count(*) FROM farms WHERE created_at > now() - interval '7 days')::int AS new_farms_7d,
       (SELECT count(*) FROM users WHERE is_active AND email_verified_at IS NULL)::int AS unverified_users,
       (SELECT count(*) FROM users WHERE is_super_admin)::int AS super_admin_count
    `
  );
  res.json(rows[0]);
}));

router.get('/farms', asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `SELECT
       f.id, f.name, f.country, f.district, f.primary_production, f.created_at,
       (SELECT count(*) FROM cows c WHERE c.farm_id = f.id AND c.status = 'active')::int AS cows,
       (SELECT count(*) FROM user_farms uf WHERE uf.farm_id = f.id)::int AS members,
       (SELECT u.name FROM user_farms uf JOIN users u ON u.id = uf.user_id
        JOIN roles r ON r.id = uf.role_id WHERE uf.farm_id = f.id AND r.name = 'administrator'
        ORDER BY uf.is_default DESC LIMIT 1) AS owner_name,
       (SELECT u.email FROM user_farms uf JOIN users u ON u.id = uf.user_id
        JOIN roles r ON r.id = uf.role_id WHERE uf.farm_id = f.id AND r.name = 'administrator'
        ORDER BY uf.is_default DESC LIMIT 1) AS owner_email
     FROM farms f ORDER BY f.created_at DESC`
  );
  res.json({ data: rows });
}));

router.get('/users', asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `SELECT
       u.id, u.name, u.email, u.account_type, u.is_active, u.is_super_admin,
       u.email_verified_at IS NOT NULL AS email_verified, u.created_at,
       (SELECT count(*) FROM user_farms uf WHERE uf.user_id = u.id)::int AS farm_count
     FROM users u ORDER BY u.created_at DESC LIMIT 500`
  );
  res.json({ data: rows });
}));

export default router;
