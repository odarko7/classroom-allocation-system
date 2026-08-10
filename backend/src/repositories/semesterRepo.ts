import { all, get, insert, run } from '../utils/db.ts';

export const semesterRepo = {
  list() {
    return all(`SELECT * FROM semesters ORDER BY start_date DESC`);
  },
  findById(id: number) {
    return get(`SELECT * FROM semesters WHERE id = ?`, [id]);
  },
  active() {
    return get(`SELECT * FROM semesters WHERE status = 'ACTIVE' ORDER BY start_date DESC LIMIT 1`);
  },
  create(input: { name: string; startDate: string; endDate: string; status?: string }) {
    return insert(`INSERT INTO semesters (name, start_date, end_date, status) VALUES (?, ?, ?, ?)`, [input.name, input.startDate, input.endDate, input.status ?? 'PLANNING']);
  },
  update(id: number, fields: Record<string, unknown>) {
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue;
      sets.push(`${k} = ?`);
      params.push(v);
    }
    if (sets.length === 0) return;
    params.push(id);
    run(`UPDATE semesters SET ${sets.join(', ')} WHERE id = ?`, params);
  },
  delete(id: number) {
    run(`DELETE FROM semesters WHERE id = ?`, [id]);
  },
  count() {
    return get<{ c: number }>(`SELECT COUNT(*) AS c FROM semesters`)?.c ?? 0;
  },
};

export const timeSlotRepo = {
  list() {
    return all(`SELECT * FROM time_slots ORDER BY day, start_time`);
  },
  findById(id: number) {
    return get(`SELECT * FROM time_slots WHERE id = ?`, [id]);
  },
  create(input: { day: number; startTime: string; endTime: string; periodName?: string }) {
    return insert(`INSERT INTO time_slots (day, start_time, end_time, period_name) VALUES (?, ?, ?, ?)`, [input.day, input.startTime, input.endTime, input.periodName ?? null]);
  },
  update(id: number, fields: Record<string, unknown>) {
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue;
      sets.push(`${k} = ?`);
      params.push(v);
    }
    if (sets.length === 0) return;
    params.push(id);
    run(`UPDATE time_slots SET ${sets.join(', ')} WHERE id = ?`, params);
  },
  delete(id: number) {
    run(`DELETE FROM time_slots WHERE id = ?`, [id]);
  },
  count() {
    return get<{ c: number }>(`SELECT COUNT(*) AS c FROM time_slots`)?.c ?? 0;
  },
};

export const studentRepo = {
  list(limit = 500) {
    return all(`SELECT s.*, d.name AS department_name FROM students s LEFT JOIN departments d ON d.id = s.department_id ORDER BY s.reg_no LIMIT ?`, [limit]);
  },
  create(input: { regNo: string; name: string; email?: string; departmentId?: number | null; yearOfStudy?: number }) {
    return insert(`INSERT INTO students (reg_no, name, email, department_id, year_of_study) VALUES (?, ?, ?, ?, ?)`, [input.regNo, input.name, input.email ?? null, input.departmentId ?? null, input.yearOfStudy ?? 1]);
  },
  count() {
    return get<{ c: number }>(`SELECT COUNT(*) AS c FROM students`)?.c ?? 0;
  },
};

export const groupRepo = {
  list() {
    return all(`
      SELECT g.*, c.course_code, c.name AS course_name, l.name AS lecturer_name, d.name AS department_name
      FROM student_groups g
      JOIN courses c ON c.id = g.course_id
      LEFT JOIN lecturers l ON l.id = g.lecturer_id
      LEFT JOIN departments d ON d.id = c.department_id
      ORDER BY c.course_code, g.name
    `);
  },
  findById(id: number) {
    return get(`SELECT g.*, c.course_code, c.name AS course_name FROM student_groups g JOIN courses c ON c.id = g.course_id WHERE g.id = ?`, [id]);
  },
  findByCourse(courseId: number) {
    return all(`SELECT * FROM student_groups WHERE course_id = ? ORDER BY name`, [courseId]);
  },
  create(input: { name: string; courseId: number; lecturerId?: number | null; semesterId?: number | null; studentCount?: number }) {
    return insert(`INSERT INTO student_groups (name, course_id, lecturer_id, semester_id, student_count) VALUES (?, ?, ?, ?, ?)`, [input.name, input.courseId, input.lecturerId ?? null, input.semesterId ?? null, input.studentCount ?? 0]);
  },
  update(id: number, fields: Record<string, unknown>) {
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue;
      sets.push(`${k} = ?`);
      params.push(v);
    }
    if (sets.length === 0) return;
    params.push(id);
    run(`UPDATE student_groups SET ${sets.join(', ')} WHERE id = ?`, params);
  },
  delete(id: number) {
    run(`DELETE FROM student_groups WHERE id = ?`, [id]);
  },
  count() {
    return get<{ c: number }>(`SELECT COUNT(*) AS c FROM student_groups`)?.c ?? 0;
  },
};
