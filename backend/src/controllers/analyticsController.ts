import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { analyticsSummary, buildingUtilization, capacityEfficiency, classroomUsage, conflictRate, departmentDemand, peakPeriods, timeDemand } from '../analytics/metrics.ts';
import { recognizePatterns } from '../analytics/patterns.ts';
import { allocationRepo } from '../repositories/allocationRepo.ts';
import { all, get } from '../utils/db.ts';
import { runEvaluation } from '../algorithm/evaluation.ts';

function semesterParam(req: AuthenticatedRequest): number | null {
  const s = req.query.semester as string | undefined;
  if (s) return Number(s);
  return null;
}

export async function summaryHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const summary = await analyticsSummary(semesterParam(req));
  res.json(summary);
}

export function utilizationHandler(req: AuthenticatedRequest, res: Response): void {
  const semester = semesterParam(req) ?? (get<{ id: number }>(`SELECT id FROM semesters WHERE status = 'ACTIVE'`)?.id ?? null);
  const usage = semester ? classroomUsage(semester) : [];
  res.json({ semester, usage });
}

export function buildingsHandler(req: AuthenticatedRequest, res: Response): void {
  const semester = semesterParam(req) ?? (get<{ id: number }>(`SELECT id FROM semesters WHERE status = 'ACTIVE'`)?.id ?? null);
  res.json({ semester, buildings: semester ? buildingUtilization(semester) : [] });
}

export function departmentsHandler(req: AuthenticatedRequest, res: Response): void {
  const semester = semesterParam(req) ?? (get<{ id: number }>(`SELECT id FROM semesters WHERE status = 'ACTIVE'`)?.id ?? null);
  res.json({ semester, departments: semester ? departmentDemand(semester) : [] });
}

export function timeDemandHandler(req: AuthenticatedRequest, res: Response): void {
  const semester = semesterParam(req) ?? (get<{ id: number }>(`SELECT id FROM semesters WHERE status = 'ACTIVE'`)?.id ?? null);
  const peaks = semester ? peakPeriods(semester) : { peakDay: 'N/A', lowestDay: 'N/A', peakPeriod: 'N/A', peakPeriodDay: 'N/A', hourly: [] };
  res.json({ semester, ...peaks, demand: semester ? timeDemand(semester) : [] });
}

export function capacityHandler(req: AuthenticatedRequest, res: Response): void {
  const semester = semesterParam(req) ?? (get<{ id: number }>(`SELECT id FROM semesters WHERE status = 'ACTIVE'`)?.id ?? null);
  res.json({ semester, capacityEfficiency: semester ? capacityEfficiency(semester) : 0 });
}

export function conflictRateHandler(req: AuthenticatedRequest, res: Response): void {
  const semester = semesterParam(req) ?? (get<{ id: number }>(`SELECT id FROM semesters WHERE status = 'ACTIVE'`)?.id ?? null);
  res.json({ semester, conflictRate: semester ? conflictRate(semester) : 0, conflicts: semester ? allocationRepo.conflicts().length : 0 });
}

export function patternsHandler(req: AuthenticatedRequest, res: Response): void {
  const result = recognizePatterns(semesterParam(req));
  res.json(result);
}

export function evaluationHandler(req: AuthenticatedRequest, res: Response): void {
  const semesterId = Number(req.query.semester) || (get<{ id: number }>(`SELECT id FROM semesters WHERE status = 'ACTIVE'`)?.id ?? 0);
  const result = runEvaluation(semesterId, { seeded: true });
  res.json(result);
}

export function roomAnalyticsHandler(req: AuthenticatedRequest, res: Response): void {
  const classroomId = Number(req.params.id);
  const semester = semesterParam(req) ?? (get<{ id: number }>(`SELECT id FROM semesters WHERE status = 'ACTIVE'`)?.id ?? null);
  const usage = semester ? classroomUsage(semester).find((u) => u.classroomId === classroomId) : undefined;
  const classroom = get(`SELECT * FROM classrooms WHERE id = ?`, [classroomId]);
  const courses = semester ? all(`
    SELECT co.course_code, co.name AS course_name, g.name AS group_name, l.name AS lecturer_name,
      ts.day AS day, ts.start_time, ts.end_time, a.status
    FROM allocations a
    JOIN courses co ON co.id = a.course_id
    JOIN student_groups g ON g.id = a.group_id
    LEFT JOIN lecturers l ON l.id = a.lecturer_id
    JOIN time_slots ts ON ts.id = a.time_slot_id
    WHERE a.classroom_id = ? AND a.semester_id = ? AND a.status != 'REJECTED'
    ORDER BY ts.day, ts.start_time`, [classroomId, semester]) : [];
  res.json({ classroom: { ...classroom, usage }, courses });
}
