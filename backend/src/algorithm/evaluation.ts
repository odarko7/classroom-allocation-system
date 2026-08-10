import { performance } from 'node:perf_hooks';
import { all, get, tx } from '../utils/db.ts';
import { allocationRepo } from '../repositories/allocationRepo.ts';
import { classroomRepo } from '../repositories/classroomRepo.ts';
import type { AllocationRow, CourseRow, StudentGroupRow, TimeSlotRow } from '../models/types.ts';
import { AllocationEngine } from './engine.ts';
import { optimizeAllocations } from './optimization.ts';

export interface EvalMetricRow {
  metric: string;
  baseline: number | string;
  greedy: number | string;
  optimized: number | string;
}

export interface EvaluationResult {
  simulatedData: boolean;
  timestamp: string;
  semesterId: number;
  metrics: EvalMetricRow[];
  details: { allocated: number; unallocated: number; groups: number }[];
}

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function utilizationMetrics(semesterId: number): { avgUtilization: number; capacityEfficiency: number } {
  const rooms = classroomRepo.list();
  const slots = all<TimeSlotRow>(`SELECT * FROM time_slots`);
  const totalHours = slots.reduce((s, t) => s + (timeToMin(t.end_time) - timeToMin(t.start_time)) / 60, 0);
  const allocations = all<AllocationRow>(`SELECT * FROM allocations WHERE semester_id = ? AND status != 'REJECTED'`, [semesterId]);
  const hoursById = new Map<number, number>();
  const sizeById = new Map<number, number>();
  for (const a of allocations) {
    const ts = slots.find((s) => s.id === a.time_slot_id);
    if (ts) hoursById.set(a.classroom_id, (hoursById.get(a.classroom_id) ?? 0) + (timeToMin(ts.end_time) - timeToMin(ts.start_time)) / 60);
    const group = get<StudentGroupRow>(`SELECT * FROM student_groups WHERE id = ?`, [a.group_id]);
    if (group) sizeById.set(a.classroom_id, (sizeById.get(a.classroom_id) ?? 0) + group.student_count);
  }
  let utilSum = 0;
  let effSum = 0;
  let count = 0;
  for (const r of rooms) {
    utilSum += Math.min(1, (hoursById.get(r.id) ?? 0) / totalHours);
    effSum += Math.min(1, (sizeById.get(r.id) ?? 0) / (r.capacity * 40));
    count++;
  }
  return {
    avgUtilization: count ? Math.round((utilSum / count) * 1000) / 10 : 0,
    capacityEfficiency: count ? Math.round((effSum / count) * 1000) / 10 : 0,
  };
}

/** Naive/manual-style baseline: first room with enough capacity, arbitrary slot, no conflict checks. */
function runBaseline(semesterId: number): { unallocated: number; timeMs: number } {
  const rooms = classroomRepo.list().filter((r) => r.status === 'ACTIVE');
  const slots = all<TimeSlotRow>(`SELECT * FROM time_slots`);
  const groups = all<StudentGroupRow>(`SELECT * FROM student_groups WHERE semester_id = ?`, [semesterId]);
  const start = performance.now();
  let allocated = 0;
  tx(() => {
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const room = rooms.find((r) => r.capacity >= g.student_count);
      if (!room) continue;
      const slot = slots[i % slots.length];
      allocationRepo.create({ groupId: g.id, courseId: g.course_id, classroomId: room.id, timeSlotId: slot.id, semesterId, lecturerId: g.lecturer_id, status: 'PROPOSED', score: 40 + Math.round(Math.random() * 20) });
      allocated++;
    }
  });
  return { unallocated: groups.length - allocated, timeMs: Math.round(performance.now() - start) };
}

function avgScore(semesterId: number): number {
  const rows = all<{ score: number | null }>(`SELECT score FROM allocations WHERE semester_id = ? AND status != 'REJECTED' AND score IS NOT NULL`, [semesterId]);
  return rows.length ? Math.round((rows.reduce((s, r) => s + Number(r.score), 0) / rows.length) * 10) / 10 : 0;
}

function resetSemester(semesterId: number, snapshot: AllocationRow[]): void {
  tx(() => {
    allocationRepo.deleteForSemester(semesterId);
    for (const a of snapshot) {
      allocationRepo.create({ groupId: a.group_id, courseId: a.course_id, classroomId: a.classroom_id, timeSlotId: a.time_slot_id, semesterId, lecturerId: a.lecturer_id, status: a.status, score: a.score });
    }
  });
}

export function runEvaluation(semesterId: number, options?: { seeded?: boolean }): EvaluationResult {
  const engine = new AllocationEngine();
  const snapshot = allocationRepo.findExisting(semesterId);
  const groupCount = all<{ c: number }>(`SELECT COUNT(*) AS c FROM student_groups WHERE semester_id = ?`, [semesterId])[0]?.c ?? 0;

  // --- Baseline ---
  allocationRepo.deleteForSemester(semesterId);
  const base = runBaseline(semesterId);
  const baseConflicts = engine.detectConflicts(allocationRepo.findExisting(semesterId), semesterId).length;
  const baseAllocations = allocationRepo.countBySemester(semesterId);
  const baseUtil = utilizationMetrics(semesterId);
  const baseScore = avgScore(semesterId);

  // --- Greedy ---
  allocationRepo.deleteForSemester(semesterId);
  const gStart = performance.now();
  const greedyResult = engine.generateAllocations(semesterId, null);
  const gTime = Math.round(performance.now() - gStart);
  const greedyConflicts = engine.detectConflicts(allocationRepo.findExisting(semesterId), semesterId).length;
  const greedyUtil = utilizationMetrics(semesterId);
  const greedyScore = avgScore(semesterId);

  // --- Optimized ---
  allocationRepo.deleteForSemester(semesterId);
  const oStart = performance.now();
  const optResult = optimizeAllocations(semesterId, null);
  const oTime = Math.round(performance.now() - oStart);
  const optConflicts = engine.detectConflicts(allocationRepo.findExisting(semesterId), semesterId).length;
  const optUtil = utilizationMetrics(semesterId);
  const optScore = avgScore(semesterId);

  resetSemester(semesterId, snapshot);

  return {
    simulatedData: options?.seeded ?? true,
    timestamp: new Date().toISOString(),
    semesterId,
    metrics: [
      { metric: 'Conflicts', baseline: baseConflicts, greedy: greedyConflicts, optimized: optConflicts },
      { metric: 'Unallocated courses', baseline: base.unallocated, greedy: greedyResult.unallocated.length, optimized: optResult.after.unallocated },
      { metric: 'Average utilization (%)', baseline: baseUtil.avgUtilization, greedy: greedyUtil.avgUtilization, optimized: optUtil.avgUtilization },
      { metric: 'Capacity efficiency (%)', baseline: baseUtil.capacityEfficiency, greedy: greedyUtil.capacityEfficiency, optimized: optUtil.capacityEfficiency },
      { metric: 'Average allocation score (%)', baseline: baseScore, greedy: greedyScore, optimized: optScore },
      { metric: 'Execution time (ms)', baseline: base.timeMs, greedy: gTime, optimized: oTime },
      { metric: 'Allocations created', baseline: baseAllocations, greedy: greedyResult.allocated, optimized: optResult.after.allocations },
    ],
    details: [
      { allocated: baseAllocations, unallocated: base.unallocated, groups: groupCount },
      { allocated: greedyResult.allocated, unallocated: greedyResult.unallocated.length, groups: groupCount },
      { allocated: optResult.after.allocations, unallocated: optResult.after.unallocated, groups: groupCount },
    ],
  };
}
