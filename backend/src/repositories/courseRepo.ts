import { all, get, insert, run } from '../utils/db.ts';

export const courseRepo = {
  list() {
    return all(`
      SELECT c.*, d.name AS department_name, f.name AS faculty_name,
        l.name AS lecturer_name, d.faculty_id
      FROM courses c
      LEFT JOIN departments d ON d.id = c.department_id
      LEFT JOIN faculties f ON f.id = d.faculty_id
      LEFT JOIN lecturers l ON l.id = c.lecturer_id
      ORDER BY c.course_code
    `);
  },
  findById(id: number) {
    return get(`
      SELECT c.*, d.name AS department_name, l.name AS lecturer_name
      FROM courses c
      LEFT JOIN departments d ON d.id = c.department_id
      LEFT JOIN lecturers l ON l.id = c.lecturer_id
      WHERE c.id = ?
    `, [id]);
  },
  create(input: { courseCode: string; name: string; departmentId?: number | null; lecturerId?: number | null; studentCount?: number; creditHours?: number; requiredRoomType?: string | null; semesterId?: number | null; description?: string }) {
    return insert(
      `INSERT INTO courses (course_code, name, department_id, lecturer_id, student_count, credit_hours, required_room_type, semester_id, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [input.courseCode, input.name, input.departmentId ?? null, input.lecturerId ?? null, input.studentCount ?? 0, input.creditHours ?? 3, input.requiredRoomType ?? null, input.semesterId ?? null, input.description ?? null],
    );
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
    run(`UPDATE courses SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`, params);
  },
  setRequirements(id: number, facilityIds: number[]) {
    run(`DELETE FROM course_requirements WHERE course_id = ?`, [id]);
    for (const fid of facilityIds) {
      run(`INSERT OR IGNORE INTO course_requirements (course_id, facility_id) VALUES (?, ?)`, [id, fid]);
    }
  },
  requirements(id: number) {
    return all<{ facility_id: number; name: string }>(
      `SELECT f.id AS facility_id, f.name FROM course_requirements cr JOIN facilities f ON f.id = cr.facility_id WHERE cr.course_id = ?`, [id],
    );
  },
  delete(id: number) {
    run(`DELETE FROM courses WHERE id = ?`, [id]);
  },
  count() {
    return get<{ c: number }>(`SELECT COUNT(*) AS c FROM courses`)?.c ?? 0;
  },
};

export const lecturerRepo = {
  list() {
    return all(`
      SELECT l.*, d.name AS department_name, d.faculty_id, f.name AS faculty_name
      FROM lecturers l
      LEFT JOIN departments d ON d.id = l.department_id
      LEFT JOIN faculties f ON f.id = d.faculty_id
      ORDER BY l.name
    `);
  },
  findById(id: number) {
    return get(`SELECT * FROM lecturers WHERE id = ?`, [id]);
  },
  create(input: { staffNo: string; name: string; email?: string; phone?: string; departmentId?: number | null; title?: string }) {
    return insert(
      `INSERT INTO lecturers (staff_no, name, email, phone, department_id, title) VALUES (?, ?, ?, ?, ?, ?)`,
      [input.staffNo, input.name, input.email ?? null, input.phone ?? null, input.departmentId ?? null, input.title ?? null],
    );
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
    run(`UPDATE lecturers SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`, params);
  },
  delete(id: number) {
    run(`DELETE FROM lecturers WHERE id = ?`, [id]);
  },
  count() {
    return get<{ c: number }>(`SELECT COUNT(*) AS c FROM lecturers`)?.c ?? 0;
  },
  courseCountByLecturer() {
    return all(`SELECT lecturer_id, COUNT(*) AS c FROM courses WHERE lecturer_id IS NOT NULL GROUP BY lecturer_id`);
  },
};
