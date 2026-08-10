import { all, get, insert, run } from '../utils/db.ts';
import type { ClassroomRow } from '../models/types.ts';

export interface ClassroomWithFacilities extends ClassroomRow {
  facilities: string[];
  facility_ids: number[];
}

const SELECT = `
  SELECT c.*,
    (SELECT GROUP_CONCAT(f.name, '|') FROM classroom_facilities cf JOIN facilities f ON f.id = cf.facility_id WHERE cf.classroom_id = c.id) AS facilities
  FROM classrooms c
`;

function mapRow(row: Record<string, unknown> & Partial<ClassroomRow>): ClassroomWithFacilities {
  return {
    ...row,
    facilities: row.facilities ? String(row.facilities).split('|') : [],
    facility_ids: [],
  } as unknown as ClassroomWithFacilities;
}

export const classroomRepo = {
  list() {
    return all(SELECT + ` ORDER BY c.building, c.room_code`).map((r) => mapRow(r));
  },
  findById(id: number) {
    const row = get(SELECT + ` WHERE c.id = ?`, [id]);
    return row ? mapRow(row) : undefined;
  },
  findByIdRaw(id: number): ClassroomRow | undefined {
    return get(`SELECT * FROM classrooms WHERE id = ?`, [id]);
  },
  findByCode(code: string) {
    return get(SELECT + ` WHERE c.room_code = ?`, [code]);
  },
  create(input: { roomCode: string; name?: string; building: string; floor: number; capacity: number; roomType: string; status?: string; accessibility?: string; description?: string }) {
    return insert(
      `INSERT INTO classrooms (room_code, name, building, floor, capacity, room_type, status, accessibility, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [input.roomCode, input.name ?? null, input.building, input.floor, input.capacity, input.roomType, input.status ?? 'ACTIVE', input.accessibility ?? null, input.description ?? null],
    );
  },
  update(id: number, fields: Partial<Omit<ClassroomRow, 'id' | 'created_at' | 'updated_at'>>) {
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue;
      sets.push(`${k} = ?`);
      params.push(v);
    }
    if (sets.length === 0) return;
    params.push(id);
    run(`UPDATE classrooms SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`, params);
  },
  setFacilities(id: number, facilityIds: number[]) {
    run(`DELETE FROM classroom_facilities WHERE classroom_id = ?`, [id]);
    for (const fid of facilityIds) {
      run(`INSERT OR IGNORE INTO classroom_facilities (classroom_id, facility_id) VALUES (?, ?)`, [id, fid]);
    }
  },
  delete(id: number) {
    run(`DELETE FROM classrooms WHERE id = ?`, [id]);
  },
  count() {
    return get<{ c: number }>(`SELECT COUNT(*) AS c FROM classrooms`)?.c ?? 0;
  },
  countByStatus() {
    return all<{ status: string; c: number }>(`SELECT status, COUNT(*) AS c FROM classrooms GROUP BY status`);
  },
};
