import { all, get, insert, run } from '../utils/db.ts';
import type { UserRow } from '../models/types.ts';

export const userRepo = {
  findByEmail(email: string): UserRow | undefined {
    return get<UserRow>(`SELECT * FROM users WHERE email = ?`, [email]);
  },
  findById(id: number): UserRow | undefined {
    return get<UserRow>(`SELECT * FROM users WHERE id = ?`, [id]);
  },
  list() {
    return all(`SELECT u.*, d.name AS department_name FROM users u LEFT JOIN departments d ON d.id = u.department_id ORDER BY u.id`);
  },
  create(input: { name: string; email: string; passwordHash: string; role: string; departmentId?: number | null; lecturerId?: number | null }): number {
    return insert(
      `INSERT INTO users (name, email, password_hash, role, department_id, lecturer_id) VALUES (?, ?, ?, ?, ?, ?)`,
      [input.name, input.email, input.passwordHash, input.role, input.departmentId ?? null, input.lecturerId ?? null],
    );
  },
  update(id: number, fields: Partial<Pick<UserRow, 'name' | 'role' | 'is_active' | 'department_id'>>) {
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [k, v] of Object.entries(fields)) {
      sets.push(`${k} = ?`);
      params.push(v);
    }
    if (sets.length === 0) return;
    params.push(id);
    run(`UPDATE users SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`, params);
  },
  updatePassword(id: number, hash: string) {
    run(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`, [hash, id]);
  },
  delete(id: number) {
    run(`UPDATE users SET is_active = 0, updated_at = datetime('now') WHERE id = ?`, [id]);
  },
  count() {
    return get<{ c: number }>(`SELECT COUNT(*) AS c FROM users`)?.c ?? 0;
  },
};
