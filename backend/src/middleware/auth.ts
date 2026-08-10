import type { NextFunction, Request, Response } from 'express';
import { verifyToken, type JwtPayload } from '../security/jwt.ts';
import { get } from '../utils/db.ts';
import type { UserRow } from '../models/types.ts';
import { writeAuditLog } from '../services/notificationService.ts';

export interface AuthenticatedRequest extends Request {
  user?: UserRow;
  tokenPayload?: JwtPayload;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function authenticate(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(new ApiError(401, 'Authentication required. Please log in.'));
  }
  try {
    const payload = verifyToken(header.slice(7));
    const user = get<UserRow>(
      `SELECT * FROM users WHERE id = ? AND is_active = 1`,
      [payload.sub],
    );
    if (!user) {
      return next(new ApiError(401, 'Account no longer exists or is deactivated.'));
    }
    req.user = user;
    req.tokenPayload = payload;
    next();
  } catch {
    return next(new ApiError(401, 'Invalid or expired token. Please log in again.'));
  }
}

export function authorize(...roles: string[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new ApiError(401, 'Not authenticated.'));
    if (!roles.includes(req.user.role)) {
      writeAuditLog({ userId: req.user.id, username: req.user.email, action: 'AUTHORIZATION_DENIED', entityType: 'route', oldValue: req.originalUrl });
      return next(new ApiError(403, `Access denied. Requires one of roles: ${roles.join(', ')}.`));
    }
    next();
  };
}
