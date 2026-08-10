import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { all, get } from '../utils/db.ts';
import { DAY_NAMES } from '../algorithm/scoring.ts';

export interface TimetableCell {
  day: number;
  startTime: string;
  endTime: string;
  allocationId: number;
  courseCode: string;
  courseName: string;
  groupName: string;
  roomCode: string;
  lecturerName: string | null;
  status: string;
  score: number | null;
}

const BASE = `
  SELECT a.id AS allocation_id, ts.day, ts.start_time, ts.end_time, a.status, a.score,
    co.course_code, co.name AS course_name, g.name AS group_name, c.room_code, l.name AS lecturer_name
  FROM allocations a
  JOIN courses co ON co.id = a.course_id
  JOIN student_groups g ON g.id = a.group_id
  JOIN classrooms c ON c.id = a.classroom_id
  LEFT JOIN lecturers l ON l.id = a.lecturer_id
  JOIN time_slots ts ON ts.id = a.time_slot_id
  WHERE a.status != 'REJECTED'
`;

export function timetableHandler(req: AuthenticatedRequest, res: Response): void {
  const { semester, classroom, lecturer, department, course, day } = req.query as Record<string, string>;
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (semester) { conditions.push(`a.semester_id = ?`); params.push(Number(semester)); }
  if (classroom) { conditions.push(`a.classroom_id = ?`); params.push(Number(classroom)); }
  if (lecturer) { conditions.push(`a.lecturer_id = ?`); params.push(Number(lecturer)); }
  if (department) { conditions.push(`co.department_id = ?`); params.push(Number(department)); }
  if (course) { conditions.push(`a.course_id = ?`); params.push(Number(course)); }
  if (day !== undefined) { conditions.push(`ts.day = ?`); params.push(Number(day)); }
  const where = conditions.length ? ` AND ${conditions.join(' AND ')}` : '';
  const rows = all<TimetableCell>(BASE + where + ` ORDER BY ts.day, ts.start_time`, params);
  res.json({ days: DAY_NAMES, rows });
}

export function dailyTimetableHandler(req: AuthenticatedRequest, res: Response): void {
  const day = Number(req.query.day ?? 0);
  const rows = all<TimetableCell>(BASE + ` AND ts.day = ? ORDER BY ts.start_time`, [day]);
  res.json({ day: DAY_NAMES[day], dayIndex: day, rows });
}
