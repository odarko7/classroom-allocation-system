import { userRepo } from '../repositories/userRepo.ts';
import { resetTokenRepo } from '../repositories/resetTokenRepo.ts';
import { verifyPassword, hashPassword } from '../security/password.ts';
import { createResetToken, hashResetToken } from '../security/resetToken.ts';
import { signToken } from '../security/jwt.ts';
import { ApiError } from '../middleware/auth.ts';
import { writeAuditLog } from './notificationService.ts';
import { env } from '../config/env.ts';
import { isEmailConfigured, sendPasswordResetEmail } from './emailService.ts';

export const RESET_TOKEN_TTL_MINUTES = 60;

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

function buildResetUrl(email: string, token: string): string {
  return `${env.frontendUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
}

export function requestPasswordReset(emailRaw: string) {
  const email = emailRaw.toLowerCase().trim();
  const user = userRepo.findByEmail(email);
  writeAuditLog({ userId: user?.id ?? null, username: email, action: 'PASSWORD_RESET_REQUESTED', entityType: 'user', entityId: user?.id ?? null });

  if (!user || !user.is_active) {
    if (isEmailConfigured()) {
      return { message: 'If an account exists for that email, a password reset link has been sent.', expiresInMinutes: RESET_TOKEN_TTL_MINUTES };
    }
    return { message: 'If an account exists for that email, ask an administrator to generate a reset token.', expiresInMinutes: RESET_TOKEN_TTL_MINUTES };
  }

  const { token, hash } = createResetToken();
  resetTokenRepo.create(user.id, hash, RESET_TOKEN_TTL_MINUTES);

  if (isEmailConfigured()) {
    sendPasswordResetEmail(user.email, user.name, buildResetUrl(user.email, token));
    return { message: 'If an account exists for that email, a password reset link has been sent.', expiresInMinutes: RESET_TOKEN_TTL_MINUTES };
  }

  console.log(`[reset] token for ${user.email}: ${token}`);
  return {
    message: 'Password reset token generated (email is not configured). Use it below to set a new password.',
    token,
    email,
    expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
  };
}

export function resetPassword(emailRaw: string, token: string, newPassword: string) {
  const email = emailRaw.toLowerCase().trim();
  const user = userRepo.findByEmail(email);
  const row = user ? resetTokenRepo.findValid(user.id, hashResetToken(token)) : undefined;
  if (!user || !row) {
    writeAuditLog({ userId: null, username: email, action: 'PASSWORD_RESET_FAILED', entityType: 'user' });
    throw new ApiError(400, 'Invalid or expired reset token.');
  }
  userRepo.updatePassword(user.id, hashPassword(newPassword));
  resetTokenRepo.markUsed(row.id);
  resetTokenRepo.deleteForUser(user.id);
  writeAuditLog({ userId: user.id, username: user.email, action: 'PASSWORD_RESET', entityType: 'user', entityId: user.id });
  return { message: 'Password updated successfully. You can now sign in with your new password.' };
}

export function generateAdminResetToken(userId: number) {
  const user = userRepo.findById(userId);
  if (!user) throw new ApiError(404, 'User not found.');

  const { token, hash } = createResetToken();
  resetTokenRepo.create(user.id, hash, RESET_TOKEN_TTL_MINUTES);

  if (isEmailConfigured()) {
    sendPasswordResetEmail(user.email, user.name, buildResetUrl(user.email, token));
  }
  writeAuditLog({ userId: null, username: 'ADMIN', action: 'ADMIN_RESET_TOKEN_GENERATED', entityType: 'user', entityId: user.id });
  return { token, email: user.email, name: user.name, expiresInMinutes: RESET_TOKEN_TTL_MINUTES, emailed: isEmailConfigured() };
}
