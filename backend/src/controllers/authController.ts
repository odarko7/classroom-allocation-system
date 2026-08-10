import type { Request, Response } from 'express';
import { login, me, logout } from '../services/authService.ts';
import { userRepo } from '../repositories/userRepo.ts';
import { hashPassword } from '../security/password.ts';
import { writeAuditLog } from '../services/notificationService.ts';
import type { AuthenticatedRequest } from '../middleware/auth.ts';

export function loginHandler(req: Request, res: Response): void {
  const { email, password } = req.body;
  const result = login(email, password);
  res.json(result);
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
