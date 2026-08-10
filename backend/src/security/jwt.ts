import jwt from 'jsonwebtoken';
import { env } from '../config/env.ts';
import type { Role } from '../models/types.ts';

export interface JwtPayload {
  sub: number;
  email: string;
  role: Role;
  name: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, env.jwtSecret);
  if (typeof decoded === 'string') throw new Error('Invalid token payload');
  return decoded as unknown as JwtPayload;
}
