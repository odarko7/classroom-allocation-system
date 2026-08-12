import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { generateReport, reportToCsv, type ReportName } from '../reports/csv.ts';
import { all, get, run } from '../utils/db.ts';
import { writeAuditLog } from '../services/notificationService.ts';

export function reportHandler(req: AuthenticatedRequest, res: Response): void {
  const name = req.params.name as ReportName;
  const semester = req.query.semester ? Number(req.query.semester) : null;
  const report = generateReport(name, semester);
  writeAuditLog({ userId: req.user!.id, username: req.user!.email, action: 'REPORT_GENERATED', entityType: 'report', newValue: { name } });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
  res.send(reportToCsv(report));
}

export function reportPreviewHandler(req: AuthenticatedRequest, res: Response): void {
  const name = req.params.name as ReportName;
  const semester = req.query.semester ? Number(req.query.semester) : null;
  const report = generateReport(name, semester);
  res.json({ name: report.name, filename: report.filename, headers: report.headers, rowCount: report.rows.length, preview: report.rows.slice(0, 10) });
}

export function listReportNames(_req: AuthenticatedRequest, res: Response): void {
  res.json(['classroom-utilization', 'allocations', 'conflicts', 'departments', 'underutilized-rooms', 'overutilized-rooms', 'optimization']);
}

export function miscSummary(req: AuthenticatedRequest, res: Response): void {
  const semester = get<{ id: number }>(`SELECT id FROM semesters WHERE status = 'ACTIVE'`)?.id ?? null;
  const counts = {
    classrooms: get<{ c: number }>(`SELECT COUNT(*) AS c FROM classrooms`)?.c ?? 0,
    availableClassrooms: get<{ c: number }>(`SELECT COUNT(*) AS c FROM classrooms WHERE status = 'ACTIVE'`)?.c ?? 0,
    courses: get<{ c: number }>(`SELECT COUNT(*) AS c FROM courses`)?.c ?? 0,
    lecturers: get<{ c: number }>(`SELECT COUNT(*) AS c FROM lecturers`)?.c ?? 0,
    departments: get<{ c: number }>(`SELECT COUNT(*) AS c FROM departments`)?.c ?? 0,
    faculties: get<{ c: number }>(`SELECT COUNT(*) AS c FROM faculties`)?.c ?? 0,
    students: get<{ c: number }>(`SELECT COUNT(*) AS c FROM students`)?.c ?? 0,
    allocations: semester ? get<{ c: number }>(`SELECT COUNT(*) AS c FROM allocations WHERE semester_id = ?`, [semester])?.c ?? 0 : 0,
    approved: semester ? get<{ c: number }>(`SELECT COUNT(*) AS c FROM allocations WHERE semester_id = ? AND status = 'APPROVED'`, [semester])?.c ?? 0 : 0,
    proposed: semester ? get<{ c: number }>(`SELECT COUNT(*) AS c FROM allocations WHERE semester_id = ? AND status = 'PROPOSED'`, [semester])?.c ?? 0 : 0,
    conflicts: get<{ c: number }>(`SELECT COUNT(*) AS c FROM allocation_conflicts WHERE resolved = 0`)?.c ?? 0,
    unallocated: semester ? Math.max(0, (get<{ c: number }>(`SELECT COUNT(*) AS c FROM student_groups WHERE semester_id = ?`, [semester])?.c ?? 0) - (get<{ c: number }>(`SELECT COUNT(*) AS c FROM allocations WHERE semester_id = ? AND status != 'REJECTED'`, [semester])?.c ?? 0)) : 0,
    timeSlots: get<{ c: number }>(`SELECT COUNT(*) AS c FROM time_slots`)?.c ?? 0,
    groups: get<{ c: number }>(`SELECT COUNT(*) AS c FROM student_groups`)?.c ?? 0,
    notifications: get<{ c: number }>(`SELECT COUNT(*) AS c FROM notifications`)?.c ?? 0,
    auditLogs: get<{ c: number }>(`SELECT COUNT(*) AS c FROM audit_logs`)?.c ?? 0,
  };
  res.json({ semester, counts });
}

export function notificationsHandler(req: AuthenticatedRequest, res: Response): void {
  const rows = all(`SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50`);
  const unread = get<{ c: number }>(`SELECT COUNT(*) AS c FROM notifications WHERE is_read = 0`)?.c ?? 0;
  res.json({ rows, unread });
}

export function markNotificationsRead(req: AuthenticatedRequest, res: Response): void {
  run(`UPDATE notifications SET is_read = 1`);
  res.json({ message: 'Notifications marked as read.' });
}

export function auditLogsHandler(req: AuthenticatedRequest, res: Response): void {
  const { page = 1, pageSize = 30 } = req.query as Record<string, string>;
  const total = get<{ c: number }>(`SELECT COUNT(*) AS c FROM audit_logs`)?.c ?? 0;
  const offset = (Number(page) - 1) * Number(pageSize);
  const rows = all(`SELECT * FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, [Number(pageSize), offset]);
  res.json({ rows, total, page: Number(page), pageSize: Number(pageSize), totalPages: Math.ceil(total / Number(pageSize)) || 1 });
}
