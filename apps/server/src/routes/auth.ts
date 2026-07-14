import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { signToken } from '../lib/jwt.js';
import { HttpError, asyncHandler } from '../lib/errors.js';
import { requireAuth, audit } from '../middleware/auth.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  farmName: z.string().min(1).optional(),
  role: z.enum(['administrator', 'farm_manager', 'veterinarian', 'worker', 'accountant']).optional(),
});

// POST /auth/register  (creates a farm + admin on first registration, else joins existing farm)
router.post('/register', asyncHandler(async (req, res) => {
  const body = registerSchema.parse(req.body);
  const { rows: existing } = await query('SELECT id FROM users WHERE email = $1', [body.email]);
  if (existing.length) throw new HttpError(409, 'Email already registered');

  const client = await (await import('../db/index.js')).getClient();
  try {
    await client.query('BEGIN');
    let farmId: string;
    if (body.farmName) {
      const f = await client.query('INSERT INTO farms (name) VALUES ($1) RETURNING id', [body.farmName]);
      farmId = f.rows[0].id;
    } else {
      const f = await client.query('SELECT id FROM farms ORDER BY created_at LIMIT 1');
      farmId = f.rows[0].id;
    }
    const role = body.role ?? 'administrator';
    const r = await client.query('SELECT id FROM roles WHERE name = $1', [role]);
    const u = await client.query(
      `INSERT INTO users (farm_id, role_id, name, email, password_hash, email_verified_at)
       VALUES ($1,(SELECT id FROM roles WHERE name=$2),$3,$4,crypt($5,gen_salt('bf')),now())
       RETURNING id, farm_id, email, name`,
      [farmId, role, body.name, body.email, body.password]
    );
    await client.query('COMMIT');
    const user = u.rows[0];
    const token = signToken({ sub: user.id, email: user.email, farmId: user.farm_id, role, permissions: [] });
    res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, farmId: user.farm_id, role } });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

// POST /auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const body = loginSchema.parse(req.body);
  const { rows } = await query(
    `SELECT u.id, u.email, u.name, u.farm_id, u.password_hash, r.name AS role
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.email = $1 AND u.is_active = true`,
    [body.email]
  );
  const user = rows[0];
  if (!user) throw new HttpError(401, 'Invalid credentials');
  const ok = await query('SELECT crypt($1, $2) = $2 AS valid', [body.password, user.password_hash]);
  if (!ok.rows[0].valid) throw new HttpError(401, 'Invalid credentials');
  const perms = await query<{ code: string }>(
    `SELECT p.code FROM permissions p JOIN role_permissions rp ON rp.permission_id=p.id
     JOIN roles r ON r.id=rp.role_id WHERE r.name=$1`, [user.role]
  );
  const token = signToken({
    sub: user.id, email: user.email, farmId: user.farm_id, role: user.role,
    permissions: perms.rows.map((p) => p.code),
  });
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, farmId: user.farm_id, role: user.role },
  });
}));

// GET /auth/me
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  await audit(req.user, 'read', 'user', req.user!.id);
  res.json({ user: req.user });
}));

export default router;
