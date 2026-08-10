import { all, get, insert, run } from '../utils/db.ts';
import type { AllocationRow } from '../models/types.ts';

const SELECT_ALLOC = `
  SELECT a.*, c.room_code, c.capacity, c.building, c.room_type,
    co.course_code, co.name AS course_name, co.student_count AS course_student_count,
    g.name AS group_name, g.student_count AS group_student_count,
    l.name AS lecturer_name,
    ts.day AS slot_day, ts.start_time AS slot_start, ts.end_time AS slot_end, ts.period_name,
    s.name AS semester_name, d.name AS department_name, d.id AS department_id,
    sc.total_score
  FROM allocations a
  JOIN classrooms c ON c.id = a.classroom_id
  JOIN courses co ON co.id = a.course_id
  JOIN student_groups g ON g.id = a.group_id
  LEFT JOIN lecturers l ON l.id = a.lecturer_id
  JOIN time_slots ts ON ts.id = a.time_slot_id
  JOIN semesters s ON s.id = a.semester_id
  LEFT JOIN departments d ON d.id = co.department_id
  LEFT JOIN allocation_scores sc ON sc.allocation_id = a.id
`;

export const allocationRepo = {
  list() {
    return all(SELECT_ALLOC + ` ORDER BY a.created_at DESC`);
  },
  findBySemester(semesterId: number) {
    return all(SELECT_ALLOC + ` WHERE a.semester_id = ? ORDER BY ts.day, ts.start_time, c.room_code`, [semesterId]);
  },
  findById(id: number) {
    return get(SELECT_ALLOC + ` WHERE a.id = ?`, [id]);
  },
  findExisting(semesterId: number) {
    return all<AllocationRow>(`SELECT * FROM allocations WHERE semester_id = ?`, [semesterId]);
  },
  countBySemester(semesterId: number) {
    return get<{ c: number }>(`SELECT COUNT(*) AS c FROM allocations WHERE semester_id = ?`, [semesterId])?.c ?? 0;
  },
  count() {
    return get<{ c: number }>(`SELECT COUNT(*) AS c FROM allocations`)?.c ?? 0;
  },
  create(input: { groupId: number; courseId: number; classroomId: number; timeSlotId: number; semesterId: number; lecturerId?: number | null; status?: string; score?: number | null; createdBy?: number | null }) {
    return insert(
      `INSERT INTO allocations (group_id, course_id, classroom_id, time_slot_id, semester_id, lecturer_id, status, score, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [input.groupId, input.courseId, input.classroomId, input.timeSlotId, input.semesterId, input.lecturerId ?? null, input.status ?? 'PROPOSED', input.score ?? null, input.createdBy ?? null],
    );
  },
  updateStatus(id: number, status: string, approvedBy?: number | null) {
    run(`UPDATE allocations SET status = ?, approved_by = ?, approved_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`, [status, approvedBy ?? null, id]);
  },
  delete(id: number) {
    run(`DELETE FROM allocations WHERE id = ?`, [id]);
  },
  conflicts() {
    return all(`
      SELECT cf.*, a.status AS allocation_status, c.room_code, co.course_code, ts.day AS slot_day, ts.start_time
      FROM allocation_conflicts cf
      JOIN allocations a ON a.id = cf.allocation_id
      JOIN classrooms c ON c.id = a.classroom_id
      JOIN courses co ON co.id = a.course_id
      JOIN time_slots ts ON ts.id = a.time_slot_id
      WHERE cf.resolved = 0
      ORDER BY cf.created_at DESC
    `);
  },
  addConflict(allocationId: number, conflictType: string, description: string, severity = 'MEDIUM') {
    return insert(`INSERT INTO allocation_conflicts (allocation_id, conflict_type, description, severity) VALUES (?, ?, ?, ?)`, [allocationId, conflictType, description, severity]);
  },
  markConflictsResolved(allocationId: number) {
    run(`UPDATE allocation_conflicts SET resolved = 1 WHERE allocation_id = ?`, [allocationId]);
  },
  addScore(input: { allocationId: number; total: number; capacity: number; facilities: number; availability: number; utilization: number; location: number; department: number; explanation: string; rejectedAlternatives: string }) {
    run(`DELETE FROM allocation_scores WHERE allocation_id = ?`, [input.allocationId]);
    return insert(
      `INSERT INTO allocation_scores (allocation_id, total_score, capacity_score, facility_score, availability_score, utilization_score, location_score, department_pref_score, explanation, rejected_alternatives)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [input.allocationId, input.total, input.capacity, input.facilities, input.availability, input.utilization, input.location, input.department, input.explanation, input.rejectedAlternatives],
    );
  },
  scoreFor(allocationId: number) {
    return get(`SELECT * FROM allocation_scores WHERE allocation_id = ?`, [allocationId]);
  },
  deleteForSemester(semesterId: number) {
    run(`DELETE FROM allocations WHERE semester_id = ?`, [semesterId]);
  },
  hasAllocations() {
    return get<{ c: number }>(`SELECT COUNT(*) AS c FROM allocations`)?.c ?? 0 > 0;
  },
  classroomCount() {
    return get<{ c: number }>(`SELECT COUNT(DISTINCT classroom_id) AS c FROM allocations`)?.c ?? 0;
  },
};
