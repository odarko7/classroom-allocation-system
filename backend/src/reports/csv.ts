import { all } from '../utils/db.ts';
import { classroomUsage } from '../analytics/metrics.ts';

export type ReportName =
  | 'classroom-utilization'
  | 'allocations'
  | 'conflicts'
  | 'departments'
  | 'underutilized-rooms'
  | 'overutilized-rooms'
  | 'optimization';

export interface CsvReport {
  name: ReportName;
  filename: string;
  headers: string[];
  rows: (string | number | null)[][];
}

function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const escape = (v: string | number | null) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\r\n');
}

export function generateReport(name: ReportName, semesterId: number | null): CsvReport {
  const semester = semesterId ?? all<{ id: number }>(`SELECT id FROM semesters ORDER BY id DESC LIMIT 1`)[0]?.id ?? null;

  if (name === 'classroom-utilization') {
    const usage = semester ? classroomUsage(semester) : [];
    return {
      name, filename: 'classroom-utilization.csv',
      headers: ['Room', 'Building', 'Capacity', 'Used Hours', 'Available Hours', 'Utilization %', 'Bookings', 'Students Served'],
      rows: usage.map((u) => [u.roomCode, u.building, u.capacity, u.usedHours, u.availableHours, u.utilization, u.bookings, u.studentsServed]),
    };
  }

  if (name === 'allocations') {
    const rows = semester ? all(`
      SELECT c.room_code, co.course_code, co.name AS course_name, g.name AS group_name, g.student_count,
        l.name AS lecturer_name, ts.day, ts.start_time, ts.end_time, a.status, a.score
      FROM allocations a
      JOIN classrooms c ON c.id = a.classroom_id
      JOIN courses co ON co.id = a.course_id
      JOIN student_groups g ON g.id = a.group_id
      LEFT JOIN lecturers l ON l.id = a.lecturer_id
      JOIN time_slots ts ON ts.id = a.time_slot_id
      WHERE a.semester_id = ? ORDER BY ts.day, ts.start_time, c.room_code
    `, [semester]) : [];
    return {
      name, filename: 'allocations.csv',
      headers: ['Room', 'Course Code', 'Course', 'Group', 'Students', 'Lecturer', 'Day', 'Start', 'End', 'Status', 'Score'],
      rows: rows.map((r: any) => [r.room_code, r.course_code, r.course_name, r.group_name, r.student_count, r.lecturer_name, r.day, r.start_time, r.end_time, r.status, r.score]),
    };
  }

  if (name === 'conflicts') {
    const rows = all(`
      SELECT cf.conflict_type, cf.description, cf.severity, cf.resolved, c.room_code, co.course_code, cf.created_at
      FROM allocation_conflicts cf
      JOIN allocations a ON a.id = cf.allocation_id
      JOIN classrooms c ON c.id = a.classroom_id
      JOIN courses co ON co.id = a.course_id
      ORDER BY cf.created_at DESC
    `);
    return {
      name, filename: 'conflicts.csv',
      headers: ['Type', 'Description', 'Severity', 'Resolved', 'Room', 'Course', 'Created'],
      rows: rows.map((r: any) => [r.conflict_type, r.description, r.severity, r.resolved, r.room_code, r.course_code, r.created_at]),
    };
  }

  if (name === 'departments') {
    const rows = all(`
      SELECT d.name AS department, f.name AS faculty, COUNT(c.id) AS courses, SUM(c.student_count) AS students
      FROM departments d
      LEFT JOIN faculties f ON f.id = d.faculty_id
      LEFT JOIN courses c ON c.department_id = d.id
      GROUP BY d.id ORDER BY d.name
    `);
    return {
      name, filename: 'departments.csv',
      headers: ['Department', 'Faculty', 'Courses', 'Students'],
      rows: rows.map((r: any) => [r.department, r.faculty, r.courses, r.students]),
    };
  }

  if (name === 'underutilized-rooms' || name === 'overutilized-rooms') {
    const usage = semester ? classroomUsage(semester) : [];
    const threshold = name === 'underutilized-rooms' ? 30 : 80;
    const filtered = usage.filter((u) => (name === 'underutilized-rooms' ? u.utilization < threshold : u.utilization > threshold));
    return {
      name, filename: `${name}.csv`,
      headers: ['Room', 'Building', 'Capacity', 'Utilization %', 'Used Hours', 'Bookings'],
      rows: filtered.map((u) => [u.roomCode, u.building, u.capacity, u.utilization, u.usedHours, u.bookings]),
    };
  }

  if (name === 'optimization') {
    const rows = all(`
      SELECT c.room_code, co.course_code, g.name AS group_name, a.score, ts.day, ts.start_time
      FROM allocations a
      JOIN classrooms c ON c.id = a.classroom_id
      JOIN courses co ON co.id = a.course_id
      JOIN student_groups g ON g.id = a.group_id
      JOIN time_slots ts ON ts.id = a.time_slot_id
      WHERE a.semester_id = ? AND a.status = 'PROPOSED'
      ORDER BY a.score DESC
    `, [semester]);
    return {
      name, filename: 'optimization.csv',
      headers: ['Room', 'Course', 'Group', 'Score', 'Day', 'Start'],
      rows: rows.map((r: any) => [r.room_code, r.course_code, r.group_name, r.score, r.day, r.start_time]),
    };
  }

  throw new Error(`Unknown report: ${name}`);
}

export function reportToCsv(report: CsvReport): string {
  return toCsv(report.headers, report.rows);
}
