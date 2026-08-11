import { userRepo } from '../repositories/userRepo.ts';
import { verifyPassword, hashPassword } from '../security/password.ts';
import { signToken } from '../security/jwt.ts';
import { ApiError } from '../middleware/auth.ts';
import { writeAuditLog } from './notificationService.ts';

export function login(email: string, password: string) {
  const user = userRepo.findByEmail(email.toLowerCase().trim());
  if (!user || !user.is_active) {
    writeAuditLog({ userId: null, username: email, action: 'LOGIN_FAILED', entityType: 'user' });
    throw new ApiError(401, 'Invalid email or password.');
  }
  if (!verifyPassword(password, user.password_hash)) {
    writeAuditLog({ userId: user.id, username: user.email, action: 'LOGIN_FAILED', entityType: 'user', entityId: user.id });
    throw new ApiError(401, 'Invalid email or password.');
  }
  const token = signToken({ sub: user.id, email: user.email, role: user.role, name: user.name });
  writeAuditLog({ userId: user.id, username: user.email, action: 'LOGIN_SUCCESS', entityType: 'user', entityId: user.id });
  return {
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, departmentId: user.department_id },
  };
}

export function register(name: string, email: string, password: string) {
  const normalized = email.toLowerCase().trim();
  if (userRepo.findByEmail(normalized)) {
    throw new ApiError(409, 'An account with this email already exists.');
  }
  const id = userRepo.create({ name, email: normalized, passwordHash: hashPassword(password), role: 'VIEWER' });
  const user = userRepo.findById(id)!;
  const token = signToken({ sub: user.id, email: user.email, role: user.role, name: user.name });
  writeAuditLog({ userId: user.id, username: user.email, action: 'USER_REGISTERED', entityType: 'user', entityId: user.id });
  return {
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, departmentId: user.department_id },
  };
}

export function me(userId: number) {
  const user = userRepo.findById(userId);
  if (!user) throw new ApiError(404, 'User not found.');
  return { id: user.id, name: user.name, email: user.email, role: user.role, departmentId: user.department_id };
}

export function logout(userId: number, username: string | undefined) {
  writeAuditLog({ userId, username: username ?? null, action: 'LOGOUT', entityType: 'session' });
}
