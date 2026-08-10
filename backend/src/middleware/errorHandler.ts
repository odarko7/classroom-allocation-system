import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';
import { ApiError } from './auth.ts';

export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(new ApiError(422, `Validation failed: ${err.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`));
      } else {
        next(err);
      }
    }
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.query = schema.parse(req.query) as Request['query'];
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(new ApiError(422, `Invalid query parameters: ${err.issues.map((i) => i.message).join('; ')}`));
      } else {
        next(err);
      }
    }
  };
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Resource not found.' });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof Error && 'code' in err && (err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
    res.status(409).json({ error: 'A record with the same unique value already exists.' });
    return;
  }
  if (err instanceof Error && 'code' in err && (err as { code?: string }).code?.startsWith('SQLITE_CONSTRAINT')) {
    res.status(409).json({ error: 'This operation violates a database constraint (related records may exist).' });
    return;
  }
  console.error('[ERROR]', err);
  res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
}
