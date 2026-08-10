import { Router } from 'express';
import { z } from 'zod';
import { query, getClient } from '../db/index.js';
import { requireAuth, requirePermission, audit } from '../middleware/auth.js';
import { signToken } from '../lib/jwt.js';
import { generateToken, hashToken } from '../lib/tokens.js';
import { HttpError, asyncHandler } from '../lib/errors.js';
import { config } from '../env.js';

const router = Router();
router.use(requireAuth);

// GET /farms — farms this account can access: every farm on the platform for a true
// Super Admin, or every farm this user actually belongs to (user_farms) for everyone else
// — including a farm's own 'administrator' (Farm Owner), who is scoped to their own farm(s)
// like any other role, not to every tenant on the platform.
router.get('/', asyncHandler(async (req, res) => {
  const sql = req.user!.isSuperAdmin
    ? `SELECT f.id, f.name, f.country, f.district, (SELECT count(*) FROM cows c WHERE c.farm_id=f.id)::int AS cows FROM farms f ORDER BY f.name`
    : `SELECT f.id, f.name, f.country, f.district, (SELECT count(*) FROM cows c WHERE c.farm_id=f.id)::int AS cows
       FROM farms f JOIN user_farms uf ON uf.farm_id = f.id WHERE uf.user_id = $1 ORDER BY f.name`;
  const params = req.user!.isSuperAdmin ? [] : [req.user!.id];
  const { rows } = await query(sql, params);
  res.json({ data: rows, count: rows.length });
}));

// POST /farms — create a new farm and make the caller its administrator. Open to any
// authenticated account (including a brand-new, farmless one finishing the "owner"
// onboarding path) — account_type only steers which onboarding screen shows up first,
// it isn't a hard restriction, so an existing team member can start their own farm too.
const createFarmSchema = z.object({
  name: z.string().min(1),
  country: z.string().min(1),
  district: z.string().min(1),
  farmSizeValue: z.coerce.number().positive(),
  farmSizeUnit: z.enum(['acres', 'hectares']),
  expectedHerdSize: z.coerce.number().int().nonnegative(),
  primaryProduction: z.enum(['milk', 'beef', 'mixed']),
  refreshToken: z.string().min(1),
});

router.post('/', asyncHandler(async (req, res) => {
  const body = createFarmSchema.parse(req.body);

  const { rows: sessionRows } = await query(
    `SELECT id FROM sessions WHERE token_hash=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at > now()`,
    [hashToken(body.refreshToken), req.user!.id]
  );
  if (!sessionRows[0]) throw new HttpError(401, 'Session expired — please sign in again');

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const farm = await client.query(
      `INSERT INTO farms (name, country, district, farm_size_value, farm_size_unit, expected_herd_size, primary_production)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, name, country, district, farm_size_value, farm_size_unit, expected_herd_size, primary_production`,
      [body.name, body.country, body.district, body.farmSizeValue, body.farmSizeUnit, body.expectedHerdSize, body.primaryProduction]
    );
    const roleRow = await client.query(`SELECT id FROM roles WHERE name = 'administrator'`);
    const { rows: existingFarms } = await client.query('SELECT 1 FROM user_farms WHERE user_id=$1 LIMIT 1', [req.user!.id]);
    await client.query(
      `INSERT INTO user_farms (user_id, farm_id, role_id, is_default) VALUES ($1,$2,$3,$4)`,
      [req.user!.id, farm.rows[0].id, roleRow.rows[0].id, existingFarms.length === 0]
    );
    await client.query('COMMIT');

    // Immediately switch the session into the farm that was just created, same rotation
    // pattern as /auth/switch-farm, so the very next request already sees it.
    const perms = await query<{ code: string }>(
      `SELECT p.code FROM permissions p JOIN role_permissions rp ON rp.permission_id=p.id
       JOIN roles r ON r.id=rp.role_id WHERE r.name='administrator'`
    );
    const token = signToken({ sub: req.user!.id, email: req.user!.email, farmId: farm.rows[0].id, role: 'administrator', permissions: perms.rows.map((p) => p.code) });
    const refreshToken = generateToken();
    const expiresAt = new Date(Date.now() + config.refreshTokenExpiresInDays * 86400000);
    const newSession = await query('INSERT INTO sessions (user_id, farm_id, token_hash, expires_at) VALUES ($1,$2,$3,$4) RETURNING id', [req.user!.id, farm.rows[0].id, hashToken(refreshToken), expiresAt]);
    await query('UPDATE sessions SET revoked_at=now(), replaced_by=$1 WHERE id=$2', [newSession.rows[0].id, sessionRows[0].id]);

    await audit(req.user, 'create', 'farm', farm.rows[0].id, { name: body.name });
    res.status(201).json({
      token, refreshToken,
      farm: farm.rows[0],
      user: { id: req.user!.id, name: req.user!.name, email: req.user!.email, farmId: farm.rows[0].id, role: 'administrator' },
    });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

// PATCH /farms/:id — farm setup wizard step 1 (logo/photo). Images arrive as data URLs
// (no object storage wired up yet — same "store it directly, no fake infra" approach as
// the rest of onboarding); the 6mb express.json limit and this per-field cap keep a pair
// of reasonably-compressed images well under that ceiling.
const MAX_IMAGE_CHARS = 2_500_000;
const farmMediaSchema = z.object({
  logoUrl: z.string().max(MAX_IMAGE_CHARS).optional(),
  photoUrl: z.string().max(MAX_IMAGE_CHARS).optional(),
});

router.patch('/:id', asyncHandler(async (req, res) => {
  const farmId = req.params.id;
  const isMember = req.user!.isSuperAdmin || farmId === req.user!.farmId;
  if (!isMember) throw new HttpError(403, 'Access denied');
  const body = farmMediaSchema.parse(req.body);
  const { rows } = await query(
    `UPDATE farms SET logo_url = COALESCE($1, logo_url), photo_url = COALESCE($2, photo_url) WHERE id = $3
     RETURNING id, name, logo_url, photo_url`,
    [body.logoUrl ?? null, body.photoUrl ?? null, farmId]
  );
  if (!rows[0]) throw new HttpError(404, 'Farm not found');
  await audit(req.user, 'update', 'farm', farmId, { updatedMedia: true });
  res.json({ farm: rows[0] });
}));

// GET /farms/:id/summary — quick KPIs for a farm you belong to (Super Admin can view any farm)
router.get('/:id/summary', asyncHandler(async (req, res) => {
  const farmId = req.params.id;
  if (!req.user!.isSuperAdmin) {
    const member = await query('SELECT 1 FROM user_farms WHERE user_id=$1 AND farm_id=$2', [req.user!.id, farmId]);
    if (!member.rows[0]) throw new HttpError(403, 'Access denied');
  }
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

// GET /farms/:id/setup-status — powers the "Farm Setup" checklist on the dashboard for a
// freshly onboarded farm. Every step is a real check against the data (not a stored flag),
// so it can't drift out of sync with what the farm has actually done.
router.get('/:id/setup-status', asyncHandler(async (req, res) => {
  const farmId = req.params.id;
  if (!req.user!.isSuperAdmin) {
    const member = await query('SELECT 1 FROM user_farms WHERE user_id=$1 AND farm_id=$2', [req.user!.id, farmId]);
    if (!member.rows[0]) throw new HttpError(403, 'Access denied');
  }
  const { rows } = await query<{
    email_verified: boolean; has_barns: boolean; has_employees: boolean;
    has_cows: boolean; has_feeding: boolean; has_ai_advisor: boolean;
  }>(
    `SELECT
       (SELECT email_verified_at IS NOT NULL FROM users WHERE id = $2) AS email_verified,
       EXISTS(SELECT 1 FROM barns WHERE farm_id = $1) AS has_barns,
       EXISTS(
         SELECT 1 FROM user_farms WHERE farm_id = $1 AND user_id <> $2
         UNION SELECT 1 FROM farm_invitations WHERE farm_id = $1
       ) AS has_employees,
       EXISTS(SELECT 1 FROM cows WHERE farm_id = $1 AND status = 'active') AS has_cows,
       EXISTS(SELECT 1 FROM feed_types WHERE farm_id = $1) AS has_feeding,
       EXISTS(SELECT 1 FROM ai_chat_messages WHERE farm_id = $1) AS has_ai_advisor
    `,
    [farmId, req.user!.id]
  );
  const r = rows[0];
  const steps = [
    { key: 'account', label: 'Account', done: true },
    { key: 'email', label: 'Email', done: !!r.email_verified },
    { key: 'farm', label: 'Farm', done: true },
    { key: 'barns', label: 'Barns', done: !!r.has_barns },
    { key: 'employees', label: 'Employees', done: !!r.has_employees },
    { key: 'cows', label: 'Add Cows', done: !!r.has_cows },
    { key: 'feeding', label: 'Configure Feeding', done: !!r.has_feeding },
    { key: 'ai_advisor', label: 'Connect AI Advisor', done: !!r.has_ai_advisor },
  ];
  const completionPct = Math.round((steps.filter((s) => s.done).length / steps.length) * 100);
  res.json({ steps, completionPct });
}));

// GET /farms/:id/members — who belongs to this farm and with what role (invite screen list)
router.get('/:id/members', asyncHandler(async (req, res) => {
  const farmId = req.params.id;
  if (farmId !== req.user!.farmId && !req.user!.isSuperAdmin) throw new HttpError(403, 'Access denied');
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, r.name as role, u.email_verified_at IS NOT NULL as email_verified
     FROM user_farms uf JOIN users u ON u.id = uf.user_id JOIN roles r ON r.id = uf.role_id
     WHERE uf.farm_id = $1 ORDER BY u.name`,
    [farmId]
  );
  const { rows: pending } = await query(
    `SELECT email, r.name as role, fi.expires_at FROM farm_invitations fi JOIN roles r ON r.id = fi.role_id
     WHERE fi.farm_id = $1 AND fi.accepted_at IS NULL AND fi.expires_at > now() ORDER BY fi.created_at DESC`,
    [farmId]
  );
  res.json({ members: rows, pending });
}));

// POST /farms/:id/invitations — add a member to this farm. If they already have a
// DairyOS account, they're added immediately; otherwise a pending invitation is created
// and redeemed when they register with the invite link (see /auth/register's inviteToken).
const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['administrator', 'farm_manager', 'veterinarian', 'worker', 'accountant', 'milk_collector', 'viewer']),
});

function deliverInviteLink(email: string, farmName: string, token: string) {
  const link = `/#/signup?invite=${token}`;
  console.log(`[farms] invitation for ${email} to join ${farmName}: ${link}`);
  return config.env !== 'production' ? link : undefined;
}

router.post('/:id/invitations', asyncHandler(async (req, res) => {
  const farmId = req.params.id;
  if (farmId !== req.user!.farmId) throw new HttpError(403, 'Switch to this farm before inviting members to it');
  if (!['administrator', 'farm_manager'].includes(req.user!.role!)) throw new HttpError(403, 'Only administrators and farm managers can invite members');

  const body = inviteSchema.parse(req.body);
  const { rows: roleRows } = await query('SELECT id FROM roles WHERE name = $1', [body.role]);

  const { rows: userRows } = await query('SELECT id, name FROM users WHERE email = $1 AND is_active = true', [body.email]);
  if (userRows[0]) {
    const { rows } = await query(
      `INSERT INTO user_farms (user_id, farm_id, role_id, is_default) VALUES ($1,$2,$3,false)
       ON CONFLICT (user_id, farm_id) DO NOTHING RETURNING id`,
      [userRows[0].id, farmId, roleRows[0].id]
    );
    if (!rows[0]) throw new HttpError(409, `${userRows[0].name} is already a member of this farm`);
    await audit(req.user, 'invite', 'user_farms', rows[0].id, { email: body.email, role: body.role });
    return res.status(201).json({ message: `${userRows[0].name} added to this farm as ${body.role.replace('_', ' ')}.`, pending: false });
  }

  const { rows: farmRows } = await query('SELECT name FROM farms WHERE id=$1', [farmId]);
  await query(`DELETE FROM farm_invitations WHERE farm_id=$1 AND email=$2 AND accepted_at IS NULL`, [farmId, body.email]);
  const token = generateToken();
  const { rows: inviteRows } = await query(
    `INSERT INTO farm_invitations (farm_id, email, role_id, invited_by, token_hash, expires_at)
     VALUES ($1,$2,$3,$4,$5, now() + interval '7 days') RETURNING id`,
    [farmId, body.email, roleRows[0].id, req.user!.id, hashToken(token)]
  );
  const devLink = deliverInviteLink(body.email, farmRows[0].name, token);
  await audit(req.user, 'invite', 'farm_invitations', inviteRows[0].id, { email: body.email, role: body.role });
  res.status(201).json({
    message: `Invitation sent to ${body.email} — they'll join as ${body.role.replace('_', ' ')} once they sign up.`,
    pending: true,
    ...(devLink ? { devInviteLink: devLink } : {}),
  });
}));

// GET /farms/:id/location
router.get('/:id/location', asyncHandler(async (req, res) => {
  const farmId = req.params.id;
  if (!req.user!.isSuperAdmin) {
    const member = await query('SELECT 1 FROM user_farms WHERE user_id=$1 AND farm_id=$2', [req.user!.id, farmId]);
    if (!member.rows[0]) throw new HttpError(403, 'Access denied');
  }
  const { rows } = await query(
    `SELECT latitude, longitude, location_accuracy, default_map_center_lat, default_map_center_lng, default_map_zoom, address, city, district, country, plus_code FROM farms WHERE id=$1`,
    [farmId]
  );
  const r = rows[0] || {};
  res.json({
    farmId,
    latitude: r.latitude ?? null,
    longitude: r.longitude ?? null,
    locationAccuracy: r.location_accuracy ?? null,
    defaultCenterLat: r.default_map_center_lat ?? null,
    defaultCenterLng: r.default_map_center_lng ?? null,
    defaultZoom: r.default_map_zoom ?? null,
    address: r.address ?? null,
    city: r.city ?? null,
    district: r.district ?? null,
    country: r.country ?? null,
    plusCode: r.plus_code ?? null,
  });
}));

// PATCH /farms/:id/location
router.patch('/:id/location', requirePermission('farm:manage'), asyncHandler(async (req, res) => {
  const farmId = req.params.id;
  const body = z.object({
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    locationAccuracy: z.coerce.number().positive().optional(),
    defaultCenterLat: z.coerce.number().min(-90).max(90).optional(),
    defaultCenterLng: z.coerce.number().min(-180).max(180).optional(),
    defaultZoom: z.coerce.number().min(1).max(20).optional(),
    address: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    district: z.string().optional().nullable(),
    country: z.string().optional().nullable(),
    plusCode: z.string().optional().nullable(),
  }).parse(req.body);
  const { rows } = await query(
    `UPDATE farms SET
       latitude = COALESCE($1, latitude),
       longitude = COALESCE($2, longitude),
       location_accuracy = COALESCE($3, location_accuracy),
       default_map_center_lat = COALESCE($4, default_map_center_lat),
       default_map_center_lng = COALESCE($5, default_map_center_lng),
       default_map_zoom = COALESCE($6, default_map_zoom),
       address = COALESCE($7, address),
       city = COALESCE($8, city),
       district = COALESCE($9, district),
       country = COALESCE($10, country),
       plus_code = COALESCE($11, plus_code),
       updated_at = now()
     WHERE id = $12 RETURNING latitude, longitude, location_accuracy, default_map_center_lat, default_map_center_lng, default_map_zoom, address, city, district, country, plus_code`,
    [body.latitude ?? null, body.longitude ?? null, body.locationAccuracy ?? null, body.defaultCenterLat ?? null, body.defaultCenterLng ?? null, body.defaultZoom ?? null, body.address ?? null, body.city ?? null, body.district ?? null, body.country ?? null, body.plusCode ?? null, farmId]
  );
  if (!rows[0]) throw new HttpError(404, 'Farm not found');
  const r = rows[0];
  await audit(req.user, 'update', 'farm_location', farmId, body);
  res.json({
    farmId,
    latitude: r.latitude,
    longitude: r.longitude,
    locationAccuracy: r.location_accuracy,
    defaultCenterLat: r.default_map_center_lat,
    defaultCenterLng: r.default_map_center_lng,
    defaultZoom: r.default_map_zoom,
    address: r.address,
    city: r.city,
    district: r.district,
    country: r.country,
    plusCode: r.plus_code,
  });
}));

export default router;
