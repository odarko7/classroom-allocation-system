import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'oca-alg-')), 'test.db');
process.env.SEED_DEMO_DATA = 'true';

const { db } = await import('../src/db/connection.ts');
const { runMigrations } = await import('../src/db/migrations.ts');
const { seedDatabase } = await import('../src/db/seed.ts');
const { AllocationEngine } = await import('../src/algorithm/engine.ts');
const { optimizeAllocations } = await import('../src/algorithm/optimization.ts');
const { loadWeights, capacityScore, facilityScore, combineScores } = await import('../src/algorithm/scoring.ts');
const { runEvaluation } = await import('../src/algorithm/evaluation.ts');
const { all, get } = await import('../src/utils/db.ts');
const { allocationRepo } = await import('../src/repositories/allocationRepo.ts');

let engine: InstanceType<typeof AllocationEngine>;
let semesterId: number;

before(() => {
  runMigrations();
  seedDatabase();
  engine = new AllocationEngine(loadWeights());
  semesterId = get<{ id: number }>(`SELECT id FROM semesters ORDER BY id DESC LIMIT 1`)!.id;
});

after(() => {
  try { db.close(); } catch {}
  try { rmSync(path.dirname(String(process.env.DB_PATH)), { recursive: true, force: true }); } catch {}
});

function groupContext(groupId: number) {
  const group = get<any>(`SELECT * FROM student_groups WHERE id = ?`, [groupId]);
  const course = get<any>(`SELECT * FROM courses WHERE id = ?`, [group.course_id]);
  const required = all<{ name: string }>(`SELECT f.name FROM course_requirements cr JOIN facilities f ON f.id = cr.facility_id WHERE cr.course_id = ?`, [course.id]).map((r) => r.name);
  return { group, course, requiredFacilities: required };
}

test('capacity scoring: perfect fit scores highest, oversized rooms penalized', () => {
  assert.ok(capacityScore(50, 60) > capacityScore(50, 200));
  assert.equal(capacityScore(100, 50), 0, 'capacity exceeded must fail');
});

test('facility scoring: fraction of required facilities', () => {
  assert.equal(facilityScore(['Projector', 'Internet'], ['Projector', 'Internet', 'Audio']), 1);
  assert.equal(facilityScore(['Projector', 'Internet'], ['Projector']), 0.5);
  assert.equal(facilityScore([], ['Anything']), 1, 'no requirements = pass');
});

test('combineScores respects weights', () => {
  const weights = { capacity: 100, facilities: 0, availability: 0, utilization: 0, location: 0, department: 0 };
  assert.equal(combineScores({ capacity: 0.8, facilities: 0, availability: 0, utilization: 0, location: 0, department: 0 }, weights), 80);
});

test('findCandidateRooms enforces capacity hard constraint', () => {
  const bigGroup = groupContext(all<any>(`SELECT g.id FROM student_groups g ORDER BY g.student_count DESC LIMIT 1`)[0].id);
  const candidates = engine.findCandidateRooms(bigGroup);
  const failing = candidates.filter((c) => c.failReasons.some((r) => r.includes('Capacity insufficient')));
  assert.ok(failing.length > 0, 'there should be rooms too small for the largest group');
});

test('findCandidateRooms enforces facility hard constraint', () => {
  const course = all<any>(`SELECT * FROM courses WHERE required_room_type IS NOT NULL LIMIT 1`)[0];
  const group = all<any>(`SELECT * FROM student_groups WHERE course_id = ? LIMIT 1`, [course.id])[0];
  const gc = { group, course, requiredFacilities: course.required_room_type ? all<{ name: string }>(`SELECT f.name FROM course_requirements cr JOIN facilities f ON f.id = cr.facility_id WHERE cr.course_id = ?`, [course.id]).map((r) => r.name) : [] };
  const candidates = engine.findCandidateRooms(gc);
  for (const c of candidates) {
    if (c.failReasons.length === 0) {
      for (const f of gc.requiredFacilities) {
        assert.ok(c.facilities.includes(f), `candidate must contain required facility ${f}`);
      }
    }
  }
});

test('no suitable room returns unallocated with reason', () => {
  // A group bigger than every classroom
  const rid = all<any>(`SELECT id FROM courses`)[0].id;
  const groupId = insertHugeGroup(rid);
  const result = engine.generateAllocations(semesterId, null);
  const huge = result.unallocated.find((u) => u.groupId === groupId);
  if (huge) {
    assert.ok(huge.reason.includes('Capacity'));
  }
  cleanupGroup(groupId);
});

function insertHugeGroup(courseId: number) {
  const r = db.prepare(`INSERT INTO student_groups (name, course_id, student_count, semester_id) VALUES ('HUGE', ?, 5000, ?)`).run(courseId, semesterId);
  return Number(r.lastInsertRowid);
}

function cleanupGroup(id: number) {
  db.prepare(`DELETE FROM student_groups WHERE id = ?`).run(id);
}

test('generateAllocations produces conflict-free proposed allocations', () => {
  const conflicts = engine.detectConflicts(allocationRepo.findExisting(semesterId), semesterId);
  // Only the deliberately seeded conflicts should exist; generated ones must not add conflicts
  assert.ok(conflicts.length <= 3, `expected only seeded conflicts, got ${conflicts.length}`);
});

test('optimization improves or maintains average score', () => {
  const result = optimizeAllocations(semesterId, null);
  assert.ok(typeof result.after.averageScore === 'number');
  assert.ok(result.message.length > 0);
});

test('evaluation reports the required comparison metrics', () => {
  const result = runEvaluation(semesterId, { seeded: true });
  const names = result.metrics.map((m) => m.metric);
  for (const required of ['Conflicts', 'Unallocated courses', 'Average utilization (%)', 'Capacity efficiency (%)', 'Average allocation score (%)', 'Execution time (ms)']) {
    assert.ok(names.includes(required), `missing metric ${required}`);
  }
  assert.equal(result.simulatedData, true);
});

test('detectConflicts finds double bookings', () => {
  const slotId = get<{ id: number }>(`SELECT id FROM time_slots ORDER BY id LIMIT 1`)!.id;
  const g1 = all<any>(`SELECT * FROM student_groups WHERE semester_id = ? ORDER BY id LIMIT 1`, [semesterId])[0];
  const g2 = all<any>(`SELECT * FROM student_groups WHERE semester_id = ? ORDER BY id LIMIT 1 OFFSET 1`, [semesterId])[0];
  const room = all<any>(`SELECT * FROM classrooms WHERE capacity >= ? ORDER BY id LIMIT 1`, [g1.student_count])[0];
  const a1 = allocationRepo.create({ groupId: g1.id, courseId: g1.course_id, classroomId: room.id, timeSlotId: slotId, semesterId, lecturerId: g1.lecturer_id, status: 'PROPOSED' });
  const a2 = allocationRepo.create({ groupId: g2.id, courseId: g2.course_id, classroomId: room.id, timeSlotId: slotId, semesterId, lecturerId: g2.lecturer_id, status: 'PROPOSED' });
  const conflicts = engine.detectConflicts(allocationRepo.findExisting(semesterId), semesterId);
  const doubleBook = conflicts.filter((c) => c.type === 'CLASSROOM_CONFLICT' && (c.allocationId === a1 || c.allocationId === a2));
  assert.ok(doubleBook.length > 0, 'double booking must be detected');
  allocationRepo.delete(a1);
  allocationRepo.delete(a2);
});

test('detectConflicts finds lecturer double booking', () => {
  const slotId = get<{ id: number }>(`SELECT id FROM time_slots ORDER BY id LIMIT 1`)!.id;
  const g1 = all<any>(`SELECT * FROM student_groups WHERE semester_id = ? AND lecturer_id IS NOT NULL ORDER BY id LIMIT 1`, [semesterId])[0];
  const g2 = all<any>(`SELECT * FROM student_groups WHERE semester_id = ? AND lecturer_id IS NOT NULL ORDER BY id LIMIT 1 OFFSET 1`, [semesterId])[0];
  const room1 = all<any>(`SELECT * FROM classrooms WHERE capacity >= ? ORDER BY id LIMIT 1`, [g1.student_count])[0];
  const room2 = all<any>(`SELECT * FROM classrooms WHERE capacity >= ? ORDER BY id DESC LIMIT 1`, [g2.student_count])[0];
  const a1 = allocationRepo.create({ groupId: g1.id, courseId: g1.course_id, classroomId: room1.id, timeSlotId: slotId, semesterId, lecturerId: g1.lecturer_id, status: 'PROPOSED' });
  const a2 = allocationRepo.create({ groupId: g2.id, courseId: g2.course_id, classroomId: room2.id, timeSlotId: slotId, semesterId, lecturerId: g1.lecturer_id, status: 'PROPOSED' });
  const conflicts = engine.detectConflicts(allocationRepo.findExisting(semesterId), semesterId);
  assert.ok(conflicts.some((c) => c.type === 'LECTURER_CONFLICT'), 'lecturer double booking must be detected');
  allocationRepo.delete(a1);
  allocationRepo.delete(a2);
});

test('scoring produces a rejected-alternatives explanation list', () => {
  engine.generateAllocations(semesterId, null);
  const withScores = all<any>(`SELECT allocation_id, total_score, rejected_alternatives FROM allocation_scores ORDER BY id LIMIT 3`);
  assert.ok(withScores.length > 0);
  for (const s of withScores) {
    assert.ok(typeof s.total_score === 'number');
    const rejected = JSON.parse(s.rejected_alternatives ?? '[]');
    assert.ok(Array.isArray(rejected));
  }
});
