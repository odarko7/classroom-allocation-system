import { all, get, insert, run } from '../utils/db.ts';

export const departmentRepo = {
  list() {
    return all(`
      SELECT d.*, f.name AS faculty_name, l.name AS hod_name
      FROM departments d
      LEFT JOIN faculties f ON f.id = d.faculty_id
      LEFT JOIN lecturers l ON l.id = d.hod_id
      ORDER BY d.name
    `);
  },
  findById(id: number) {
    return get(`SELECT * FROM departments WHERE id = ?`, [id]);
  },
  create(input: { name: string; code?: string; facultyId?: number | null; hodId?: number | null }) {
    return insert(
      `INSERT INTO departments (name, code, faculty_id, hod_id) VALUES (?, ?, ?, ?)`,
      [input.name, input.code ?? null, input.facultyId ?? null, input.hodId ?? null],
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
    run(`UPDATE departments SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`, params);
  },
  delete(id: number) {
    run(`DELETE FROM departments WHERE id = ?`, [id]);
  },
  count() {
    return get<{ c: number }>(`SELECT COUNT(*) AS c FROM departments`)?.c ?? 0;
  },
  studentCountByDepartment() {
    return all(`SELECT department_id, COUNT(*) AS c FROM students GROUP BY department_id`);
  },
};

export const facultyRepo = {
  list() {
    return all(`SELECT * FROM faculties ORDER BY name`);
  },
  findById(id: number) {
    return get(`SELECT * FROM faculties WHERE id = ?`, [id]);
  },
  create(input: { name: string; code?: string; description?: string }) {
    return insert(`INSERT INTO faculties (name, code, description) VALUES (?, ?, ?)`, [input.name, input.code ?? null, input.description ?? null]);
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
    run(`UPDATE faculties SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`, params);
  },
  delete(id: number) {
    run(`DELETE FROM faculties WHERE id = ?`, [id]);
  },
  count() {
    return get<{ c: number }>(`SELECT COUNT(*) AS c FROM faculties`)?.c ?? 0;
  },
};

export const facilityRepo = {
  list() {
    return all(`SELECT * FROM facilities ORDER BY name`);
  },
  findById(id: number) {
    return get(`SELECT * FROM facilities WHERE id = ?`, [id]);
  },
  findByName(name: string) {
    return get(`SELECT * FROM facilities WHERE name = ?`, [name]);
  },
  create(input: { name: string; description?: string }) {
    return insert(`INSERT INTO facilities (name, description) VALUES (?, ?)`, [input.name, input.description ?? null]);
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
    run(`UPDATE facilities SET ${sets.join(', ')} WHERE id = ?`, params);
  },
  delete(id: number) {
    run(`DELETE FROM facilities WHERE id = ?`, [id]);
  },
  count() {
    return get<{ c: number }>(`SELECT COUNT(*) AS c FROM facilities`)?.c ?? 0;
  },
};
