import { all, get, insert, tx } from '../utils/db.ts';
import { allocationRepo } from '../repositories/allocationRepo.ts';
import type { AllocationRow, CourseRow, StudentGroupRow, TimeSlotRow } from '../models/types.ts';
import { AllocationEngine, buildSlotContext, slotHours, type CandidateRoom, type GroupContext } from './engine.ts';
import { loadWeights } from './scoring.ts';

export interface OptimizationResult {
  before: { allocations: number; averageScore: number; conflicts: number; unallocated: number };
  after: { allocations: number; averageScore: number; conflicts: number; unallocated: number };
  improved: number;
  moved: number;
  message: string;
}

function metricsFor(semesterId: number, engine: AllocationEngine, unallocatedGroups: number): { allocations: number; averageScore: number; conflicts: number; unallocated: number } {
  const rows = allocationRepo.findBySemester(semesterId);
  const scores = rows.filter((r) => r.total_score != null).map((r) => Number(r.total_score));
  const averageScore = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;
  const conflicts = engine.detectConflicts(allocationRepo.findExisting(semesterId), semesterId).length;
  return { allocations: rows.length, averageScore, conflicts, unallocated: unallocatedGroups };
}

function ensureGroupsForSemester(semesterId: number): number {
  const courses = all<{ id: number; course_code: string; name: string; lecturer_id: number | null; student_count: number }>(
    `SELECT id, course_code, name, lecturer_id, student_count FROM courses`,
  );
  let created = 0;
  for (const c of courses) {
    const existing = get<{ id: number }>(`SELECT id FROM student_groups WHERE course_id = ? AND semester_id = ?`, [c.id, semesterId]);
    if (existing) continue;
    insert(
      `INSERT INTO student_groups (name, course_id, lecturer_id, semester_id, student_count) VALUES (?, ?, ?, ?, ?)`,
      [`${c.course_code} Section 1`, c.id, c.lecturer_id, semesterId, c.student_count],
    );
    created++;
  }
  return created;
}

export function optimizeAllocations(semesterId: number, createdBy: number | null): OptimizationResult {
  const engine = new AllocationEngine(loadWeights());
  const groupsCreated = ensureGroupsForSemester(semesterId);

  // Step 1: greedy baseline
  const base = engine.generateAllocations(semesterId, createdBy);
  const before = metricsFor(semesterId, engine, base.unallocated.length);

  // Step 2: local search improvement passes
  const slots = all<TimeSlotRow>(`SELECT * FROM time_slots ORDER BY day, start_time`);
  const totalWeeklyHours = slots.reduce((sum, s) => sum + slotHours(s), 0);
  let moved = 0;

  for (let pass = 0; pass < 3; pass++) {
    const existing = allocationRepo.findExisting(semesterId).filter((a) => a.status !== 'REJECTED');

    const rows = allocationRepo.findBySemester(semesterId)
      .filter((r) => r.status === 'PROPOSED')
      .sort((a, b) => (Number(a.total_score) || 0) - (Number(b.total_score) || 0));

    for (const row of rows) {
      const gc = loadGroupContext(row as unknown as { course_id: number; group_id: number });
      if (!gc) continue;
      const lecturerId = gc.group.lecturer_id ?? gc.course.lecturer_id;
      const current = row as unknown as AllocationRow;

      // Temporarily release the current allocation, then scan all (room, slot) pairs
      const context = buildSlotContext(existing.filter((a) => a.id !== current.id), semesterId);
      const passing: CandidateRoom[] = engine.findCandidateRooms(gc).filter((c) => c.failReasons.length === 0);

      let best: { roomId: number; slotId: number; score: number } | null = null;
      for (const room of passing) {
        for (const slot of slots) {
          if (isBusy(room.classroom.id, lecturerId, gc.group.id, slot.id, context)) continue;
          const assessment = engine.calculateScore(gc, room, slot, context, totalWeeklyHours);
          if (!best || assessment.score > best.score) {
            best = { roomId: room.classroom.id, slotId: slot.id, score: assessment.score };
          }
        }
      }

      const currentScore = Number(current.score) || 0;
      if (best && best.score > currentScore + 0.5 && (best.roomId !== current.classroom_id || best.slotId !== current.time_slot_id)) {
        tx(() => {
          const alt = allocationRepo.scoreFor(current.id);
          const newId = allocationRepo.create({
            groupId: gc.group.id, courseId: gc.course.id, classroomId: best!.roomId, timeSlotId: best!.slotId,
            semesterId, lecturerId, status: 'PROPOSED', score: best!.score, createdBy,
          });
          allocationRepo.addScore({
            allocationId: newId, total: best!.score, capacity: 1, facilities: 1, availability: 1, utilization: 1, location: 1, department: 1,
            explanation: JSON.stringify({ optimized: true, replacedScore: currentScore }),
            rejectedAlternatives: alt ? String(alt.rejected_alternatives ?? '[]') : '[]',
          });
          allocationRepo.delete(current.id);
        });
        moved++;
      }
    }
  }

  const after = metricsFor(semesterId, engine, base.unallocated.length);
  const improvement = Math.round((after.averageScore - before.averageScore) * 10) / 10;
  const groupNote = groupsCreated > 0 ? `${groupsCreated} new group(s) auto-created for courses without a group. ` : '';

  return {
    before,
    after,
    improved: improvement > 0 ? improvement : 0,
    moved,
    message: groupNote + (moved > 0
      ? `Optimization improved ${moved} allocation(s). Average score ${before.averageScore}% -> ${after.averageScore}%.`
      : 'Optimization completed. No further improvements found.'),
  };
}

function loadGroupContext(row: { course_id: number; group_id: number }): GroupContext | null {
  const group = get<StudentGroupRow>(`SELECT * FROM student_groups WHERE id = ?`, [row.group_id]);
  const course = get<CourseRow>(`SELECT * FROM courses WHERE id = ?`, [row.course_id]);
  if (!group || !course) return null;
  const required = all<{ name: string }>(`SELECT f.name FROM course_requirements cr JOIN facilities f ON f.id = cr.facility_id WHERE cr.course_id = ?`, [course.id]).map((r) => r.name);
  return { group, course, requiredFacilities: required };
}

function isBusy(roomId: number, lecturerId: number | null, groupId: number, slotId: number, ctx: import('./engine.ts').SlotContext): boolean {
  if ((ctx.classroomSlots.get(roomId) ?? new Set()).has(slotId)) return true;
  if (lecturerId && (ctx.lecturerSlots.get(lecturerId) ?? new Set()).has(slotId)) return true;
  if ((ctx.groupSlots.get(groupId) ?? new Set()).has(slotId)) return true;
  return false;
}
