import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/jwt.js';
import { HttpError } from '../lib/errors.js';
import { query } from '../db/index.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  farmId: string;
  role: string;
  permissions: string[];
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
    const { rows } = await query<{ id: string; email: string; name: string; farm_id: string; role_name: string; is_active: boolean }>(
      `SELECT u.id, u.email, u.name, u.farm_id, r.name AS role_name, u.is_active
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
      [payload.sub]
    );
    const user = rows[0];
    if (!user || !user.is_active) return next(new HttpError(401, 'Account inactive or not found'));
    const perms = await query<{ code: string }>(
      `SELECT p.code FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN roles r ON r.id = rp.role_id
       WHERE r.name = $1`,
      [user.role_name]
    );
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      farmId: user.farm_id,
      role: user.role_name,
      permissions: perms.rows.map((p) => p.code),
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
    const ok = codes.every((c) => user.permissions.includes(c));
    if (!ok) return next(new HttpError(403, `Missing permission: ${codes.join(', ')}`));
    next();
  };
}

export function isAdmin(req: Request): boolean {
  return req.user?.role === 'administrator';
}

// Resolve which farm a request targets. Admins may pass ?farmId= to view other farms.
export function resolveFarmId(req: Request): string {
  if (isAdmin(req) && typeof req.query.farmId === 'string' && req.query.farmId) {
    return req.query.farmId as string;
  }
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
