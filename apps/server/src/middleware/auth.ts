import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/jwt.js';
import { HttpError } from '../lib/errors.js';
import { query } from '../db/index.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  farmId: string | null;
  role: string | null;
  permissions: string[];
  isSuperAdmin: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function extractToken(req: Request): string | null {
  const h = req.header('Authorization');
  if (h && h.startsWith('Bearer ')) return h.slice(7);
  return null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next(new HttpError(401, 'Authentication required'));
  try {
    const payload = verifyToken(token);
    const { rows } = await query<{ id: string; email: string; name: string; is_active: boolean; is_super_admin: boolean }>(
      `SELECT id, email, name, is_active, is_super_admin FROM users WHERE id = $1`,
      [payload.sub]
    );
    const user = rows[0];
    if (!user || !user.is_active) return next(new HttpError(401, 'Account inactive or not found'));
    // farmId/role come from the token, not users.farm_id/role_id — those columns are now
    // just the account's default membership; the *active* one is whatever login/refresh/
    // switch-farm most recently issued a token for. Permissions and is_super_admin are
    // looked up fresh per request so a role/permission change takes effect without forcing
    // a re-login (same reasoning applies doubly to super-admin — a revoked flag must stop
    // granting cross-farm access on the very next request, not after the token expires).
    const perms = await query<{ code: string }>(
      `SELECT p.code FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN roles r ON r.id = rp.role_id
       WHERE r.name = $1`,
      [payload.role]
    );
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      farmId: payload.farmId,
      role: payload.role,
      permissions: perms.rows.map((p) => p.code),
      isSuperAdmin: user.is_super_admin,
    };
    next();
  } catch (e) {
    next(new HttpError(401, 'Invalid or expired token'));
  }
}

export function requirePermission(...codes: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) return next(new HttpError(401, 'Authentication required'));
    if (user.isSuperAdmin) return next();
    const ok = codes.every((c) => user.permissions.includes(c));
    if (!ok) return next(new HttpError(403, `Missing permission: ${codes.join(', ')}`));
    next();
  };
}

// True ONLY for a platform-wide Super Admin — deliberately NOT true for a farm's own
// 'administrator' role. Every farm owner holds that role, scoped to exactly one farm at a
// time via their JWT's farmId, so treating "role === administrator" as a cross-farm bypass
// (the previous behavior of this function, and of several inline `role !== 'administrator'`
// checks across the route files) let any farm owner read or write any *other* tenant's
// data by guessing a record id or passing ?farmId=. Only a genuine platform Super Admin
// should ever bypass farm ownership checks.
export function isSuperAdmin(req: Request): boolean {
  return !!req.user?.isSuperAdmin;
}

// Resolve which farm a request targets. Only Super Admin may pass ?farmId= to view other
// farms; Super Admin has no farm of its own, so it must always pass one explicitly rather
// than falling back to req.user.farmId.
export function resolveFarmId(req: Request): string {
  if (isSuperAdmin(req) && typeof req.query.farmId === 'string' && req.query.farmId) {
    const q = req.query.farmId as string;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q)) return q;
  }
  if (!req.user!.farmId) throw new HttpError(400, 'This account has no active farm yet — create or join a farm first');
  return req.user!.farmId;
}

export async function audit(user: AuthUser | undefined, action: string, entityType: string, entityId: any, metadata: any = {}) {
  try {
    await query(
      `INSERT INTO audit_logs (farm_id, user_id, action, entity_type, entity_id, metadata)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [user?.farmId ?? null, user?.id ?? null, action, entityType, entityId ?? null, JSON.stringify(metadata)]
    );
  } catch (e) {
    // auditing must never break the request
  }
}
