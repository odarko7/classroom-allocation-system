import type { Request, Response } from 'express';
import { login, me, logout, register, requestPasswordReset, resetPassword, generateAdminResetToken } from '../services/authService.ts';
import { userRepo } from '../repositories/userRepo.ts';
import { hashPassword } from '../security/password.ts';
import { writeAuditLog } from '../services/notificationService.ts';
import type { AuthenticatedRequest } from '../middleware/auth.ts';

export function loginHandler(req: Request, res: Response): void {
  const { email, password } = req.body;
  const result = login(email, password);
  res.json(result);
}

export function registerHandler(req: Request, res: Response): void {
  const { name, email, password } = req.body;
  const result = register(name, email, password);
  res.status(201).json(result);
}

export function forgotPasswordHandler(req: Request, res: Response): void {
  const { email } = req.body;
  res.json(requestPasswordReset(email));
}

export function resetPasswordHandler(req: Request, res: Response): void {
  const { email, token, password } = req.body;
  res.json(resetPassword(email, token, password));
}

export function adminResetTokenHandler(req: AuthenticatedRequest, res: Response): void {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId)) {
    res.status(422).json({ error: 'Invalid user id.' });
    return;
  }
  const result = generateAdminResetToken(userId);
  res.status(201).json(result);
}

export function meHandler(req: AuthenticatedRequest, res: Response): void {
  res.json(me(req.user!.id));
}

export function logoutHandler(req: AuthenticatedRequest, res: Response): void {
  logout(req.user!.id, req.user!.email);
  res.json({ message: 'Logged out successfully.' });
}

export function listUsersHandler(req: AuthenticatedRequest, res: Response): void {
  const users = userRepo.list().map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, departmentName: u.department_name ?? null, isActive: u.is_active }));
  res.json(users);
}

export function createUserHandler(req: AuthenticatedRequest, res: Response): void {
  const { name, email, password, role, departmentId } = req.body;
  const id = userRepo.create({ name, email, passwordHash: hashPassword(password), role, departmentId });
  writeAuditLog({ userId: req.user!.id, username: req.user!.email, action: 'USER_CREATED', entityType: 'user', entityId: id, oldValue: null, newValue: { name, email, role } });
  res.status(201).json({ id, message: 'User created.' });
}
