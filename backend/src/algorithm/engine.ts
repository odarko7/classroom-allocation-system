import { all, get, tx } from '../utils/db.ts';
import { allocationRepo } from '../repositories/allocationRepo.ts';
import { classroomRepo } from '../repositories/classroomRepo.ts';
import type { AllocationRow, ClassroomRow, CourseRow, StudentGroupRow, TimeSlotRow } from '../models/types.ts';
import {
  capacityScore, combineScores, departmentPrefScore, facilityScore, loadWeights,
  locationScore, slotsOverlap, timeToMinutes, utilizationScore, type Weights,
} from './scoring.ts';

export interface CandidateRoom {
  classroom: ClassroomRow;
  facilities: string[];
  failReasons: string[];
}

export interface CandidateAssessment {
  roomCode: string;
  score: number;
  factors: Record<string, number>;
  reason: string;
}

export interface UnallocatedItem {
  groupId: number;
  courseCode: string;
  groupName: string;
  studentCount: number;
  reason: string;
}

export interface EngineResult {
  allocated: number;
  unallocated: UnallocatedItem[];
  metrics: { conflicts: number; total: number; averageScore: number; unallocatedCount: number };
  warnings: string[];
}

export interface GroupContext {
  group: StudentGroupRow;
  course: CourseRow;
  requiredFacilities: string[];
}

export interface SlotContext {
  classroomSlots: Map<number, Set<number>>;
  lecturerSlots: Map<number, Set<number>>;
  groupSlots: Map<number, Set<number>>;
  classroomHours: Map<number, number>;
}

export function slotHours(ts: TimeSlotRow): number {
  return (timeToMinutes(ts.end_time) - timeToMinutes(ts.start_time)) / 60;
}

export function buildSlotContext(allocations: AllocationRow[], semesterId: number): SlotContext {
  const ctx: SlotContext = {
    classroomSlots: new Map(),
    lecturerSlots: new Map(),
    groupSlots: new Map(),
    classroomHours: new Map(),
  };
  const timeslots = new Map(all<TimeSlotRow>(`SELECT * FROM time_slots`).map((s) => [s.id, s]) as [number, TimeSlotRow][]);
  for (const a of allocations) {
    if (a.semester_id !== semesterId || a.status === 'REJECTED') continue;
    if (!ctx.classroomSlots.has(a.classroom_id)) ctx.classroomSlots.set(a.classroom_id, new Set());
    ctx.classroomSlots.get(a.classroom_id)!.add(a.time_slot_id);
    if (a.lecturer_id) {
      if (!ctx.lecturerSlots.has(a.lecturer_id)) ctx.lecturerSlots.set(a.lecturer_id, new Set());
      ctx.lecturerSlots.get(a.lecturer_id)!.add(a.time_slot_id);
    }
    if (!ctx.groupSlots.has(a.group_id)) ctx.groupSlots.set(a.group_id, new Set());
    ctx.groupSlots.get(a.group_id)!.add(a.time_slot_id);
    const ts = timeslots.get(a.time_slot_id);
    if (ts) ctx.classroomHours.set(a.classroom_id, (ctx.classroomHours.get(a.classroom_id) ?? 0) + slotHours(ts));
  }
  return ctx;
}

function classroomUtilization(classroomId: number, ctx: SlotContext, totalWeeklyHours: number): number {
  const used = ctx.classroomHours.get(classroomId) ?? 0;
  return totalWeeklyHours > 0 ? used / totalWeeklyHours : 0;
}

export class AllocationEngine {
  private weights: Weights;
  private prefBuildingCache = new Map<number | null, string | null>();

  constructor(weights?: Weights) {
    this.weights = weights ?? loadWeights();
  }

  private deptPrefCache: Map<number, string | null> | null = null;

  findCandidateRooms(gc: GroupContext): CandidateRoom[] {
    const rooms = classroomRepo.list().filter((r) => r.status === 'ACTIVE');
    return rooms.map((room) => {
      const failReasons: string[] = [];
      if (room.capacity < gc.group.student_count) {
        failReasons.push(`Capacity insufficient (${room.capacity} < ${gc.group.student_count} students)`);
      }
      if (gc.course.required_room_type && room.room_type !== gc.course.required_room_type) {
        failReasons.push(`Room type mismatch (needs ${gc.course.required_room_type})`);
      }
      const present = new Set(room.facilities);
      for (const f of gc.requiredFacilities) {
        if (!present.has(f)) failReasons.push(`Missing required facility: ${f}`);
      }
      return { classroom: room, facilities: room.facilities, failReasons };
    });
  }

  findAvailableSlot(roomId: number, lecturerId: number | null, groupId: number, slots: TimeSlotRow[], ctx: SlotContext): TimeSlotRow | null {
    const roomBusy = ctx.classroomSlots.get(roomId) ?? new Set();
    const lecturerBusy = lecturerId ? ctx.lecturerSlots.get(lecturerId) ?? new Set() : new Set();
    const groupBusy = ctx.groupSlots.get(groupId) ?? new Set();
    for (const slot of slots) {
      if (roomBusy.has(slot.id) || (lecturerId && lecturerBusy.has(slot.id)) || groupBusy.has(slot.id)) continue;
      return slot;
    }
    return null;
  }

  departmentPreferredBuilding(course: CourseRow): string | null {
    if (!course.department_id) return null;
    if (!this.deptPrefCache) {
      const rows = all<{ key: string; value: string }>(`SELECT key, value FROM system_settings WHERE key LIKE 'dept_pref_building_%'`);
      this.deptPrefCache = new Map(rows.map((r) => [Number(r.key.replace('dept_pref_building_', '')), r.value]));
    }
    return this.deptPrefCache.get(course.department_id) ?? null;
  }

  calculateScore(gc: GroupContext, room: CandidateRoom, slot: TimeSlotRow | null, ctx: SlotContext, totalWeeklyHours: number): CandidateAssessment {
    const factors = {
      capacity: capacityScore(gc.group.student_count, room.classroom.capacity),
      facilities: facilityScore(gc.requiredFacilities, room.facilities),
      availability: slot ? 1 : 0,
      utilization: utilizationScore(classroomUtilization(room.classroom.id, ctx, totalWeeklyHours)),
      location: locationScore(room.classroom.building, this.departmentPreferredBuilding(gc.course)),
      department: departmentPrefScore(room.classroom.building, this.departmentPreferredBuilding(gc.course)),
    };
    const score = combineScores(factors, this.weights);
    const reason = this.describeWeakness(gc, room, slot, factors);
    return { roomCode: room.classroom.room_code, score, factors, reason };
  }

  private describeWeakness(gc: GroupContext, room: CandidateRoom, slot: TimeSlotRow | null, factors: Record<string, number>): string {
    if (room.failReasons.length > 0) return room.failReasons[0];
    if (!slot) return 'No available time slot';
    const lowest = Object.entries(factors).sort((a, b) => a[1] - b[1])[0];
    switch (lowest[0]) {
      case 'capacity': return 'Capacity suitability below ideal';
      case 'facilities': return 'Facility compatibility below ideal';
      case 'utilization': return 'Room already heavily utilized';
      case 'location': return 'Far from preferred location';
      case 'department': return 'Outside department preferred building';
      default: return 'Availability below ideal';
    }
  }

  detectConflicts(allocations: AllocationRow[], semesterId: number): { allocationId: number; type: string; description: string; severity: string }[] {
    const conflicts: { allocationId: number; type: string; description: string; severity: string }[] = [];
    const timeslots = new Map(all<TimeSlotRow>(`SELECT * FROM time_slots`).map((s) => [s.id, s]));
    const rooms = new Map(all<ClassroomRow>(`SELECT * FROM classrooms`).map((r) => [r.id, r]));
    const groups = new Map(all<StudentGroupRow>(`SELECT * FROM student_groups`).map((g) => [g.id, g]));
    const active = allocations.filter((a) => a.status !== 'REJECTED' && a.semester_id === semesterId);

    for (let i = 0; i < active.length; i++) {
      const a = active[i];
      const room = rooms.get(a.classroom_id);
      const size = groups.get(a.group_id)?.student_count ?? 0;
      if (room && size > room.capacity) {
        conflicts.push({ allocationId: a.id, type: 'CAPACITY', description: `Group of ${size} exceeds ${room.room_code} capacity (${room.capacity})`, severity: 'HIGH' });
      }
      for (let j = i + 1; j < active.length; j++) {
        const b = active[j];
        if (a.time_slot_id !== b.time_slot_id) continue;
        if (a.classroom_id === b.classroom_id) {
          conflicts.push({ allocationId: a.id, type: 'CLASSROOM_CONFLICT', description: `${rooms.get(a.classroom_id)?.room_code} double-booked at same time slot`, severity: 'HIGH' });
        }
        if (a.lecturer_id && a.lecturer_id === b.lecturer_id) {
          conflicts.push({ allocationId: a.id, type: 'LECTURER_CONFLICT', description: 'Lecturer assigned to two classes in the same time slot', severity: 'HIGH' });
        }
        if (a.group_id === b.group_id) {
          conflicts.push({ allocationId: a.id, type: 'GROUP_CONFLICT', description: 'Student group scheduled twice in the same time slot', severity: 'HIGH' });
        }
        const ta = timeslots.get(a.time_slot_id);
        const tb = timeslots.get(b.time_slot_id);
        if (ta && tb && ta.day === tb.day && slotsOverlap(ta.start_time, ta.end_time, tb.start_time, tb.end_time) && a.classroom_id === b.classroom_id) {
          conflicts.push({ allocationId: a.id, type: 'CLASSROOM_OVERLAP', description: `${rooms.get(a.classroom_id)?.room_code} has overlapping times`, severity: 'MEDIUM' });
        }
      }
    }
    return conflicts;
  }

  generateAllocations(semesterId: number, createdBy: number | null): EngineResult {
    const warnings: string[] = [];
    const existing = allocationRepo.findExisting(semesterId);
    const ctx = buildSlotContext(existing, semesterId);
    const slots = all<TimeSlotRow>(`SELECT * FROM time_slots ORDER BY day, start_time`);
    const totalWeeklyHours = slots.reduce((sum, s) => sum + slotHours(s), 0);
    const existingByGroup = new Map<number, AllocationRow>();
    for (const a of existing) existingByGroup.set(a.group_id, a);

    const groups: GroupContext[] = all<StudentGroupRow>(`SELECT g.* FROM student_groups g WHERE g.semester_id = ?`, [semesterId])
      .map((g) => {
        const course = get<CourseRow>(`SELECT * FROM courses WHERE id = ?`, [g.course_id]);
        const required = course
          ? all<{ name: string }>(`SELECT f.name FROM course_requirements cr JOIN facilities f ON f.id = cr.facility_id WHERE cr.course_id = ?`, [course.id]).map((r) => r.name)
          : [];
        return course ? { group: g, course, requiredFacilities: required } : null;
      })
      .filter((gc): gc is GroupContext => gc !== null);

    const prioritized = [...groups].sort((a, b) => {
      if (b.group.student_count !== a.group.student_count) return b.group.student_count - a.group.student_count;
      if (b.requiredFacilities.length !== a.requiredFacilities.length) return b.requiredFacilities.length - a.requiredFacilities.length;
      return (b.course.credit_hours ?? 0) - (a.course.credit_hours ?? 0);
    });

    const unallocated: UnallocatedItem[] = [];
    let allocatedCount = 0;
    let scoreSum = 0;

    tx(() => {
      for (const gc of prioritized) {
        const existingAlloc = existingByGroup.get(gc.group.id);
        if (existingAlloc?.status === 'APPROVED') continue;
        if (existingAlloc?.status === 'PROPOSED') allocationRepo.delete(existingAlloc.id);

        const candidates = this.findCandidateRooms(gc);
        const passing = candidates.filter((c) => c.failReasons.length === 0);
        if (passing.length === 0) {
          const reason = candidates.length === 0 ? 'No active classrooms exist' : `No room satisfies hard constraints (${candidates[0].failReasons.join('; ')})`;
          unallocated.push({ groupId: gc.group.id, courseCode: gc.course.course_code, groupName: gc.group.name, studentCount: gc.group.student_count, reason });
          continue;
        }

        const lecturerId = gc.group.lecturer_id ?? gc.course.lecturer_id;
        const assessments: (CandidateAssessment & { classroomId: number; slot: TimeSlotRow | null })[] = [];
        for (const room of passing) {
          const slot = this.findAvailableSlot(room.classroom.id, lecturerId, gc.group.id, slots, ctx);
          const a = this.calculateScore(gc, room, slot, ctx, totalWeeklyHours);
          assessments.push({ ...a, classroomId: room.classroom.id, slot });
        }

        assessments.sort((x, y) => y.score - x.score);
        const best = assessments[0];
        if (!best.slot) {
          unallocated.push({ groupId: gc.group.id, courseCode: gc.course.course_code, groupName: gc.group.name, studentCount: gc.group.student_count, reason: 'No available time slot for any candidate room' });
          continue;
        }

        const allocId = allocationRepo.create({
          groupId: gc.group.id, courseId: gc.course.id, classroomId: best.classroomId, timeSlotId: best.slot.id,
          semesterId, lecturerId, status: 'PROPOSED', score: best.score, createdBy,
        });

        const rejected = assessments.slice(1, 6).map((a) => ({ roomCode: a.roomCode, score: a.score, reason: a.reason }));
        allocationRepo.addScore({
          allocationId: allocId, total: best.score, capacity: best.factors.capacity, facilities: best.factors.facilities,
          availability: best.factors.availability, utilization: best.factors.utilization, location: best.factors.location,
          department: best.factors.department,
          explanation: JSON.stringify({ capacitySuitable: best.factors.capacity > 0, facilitySuitable: best.factors.facilities > 0, available: true, lecturerAvailable: true, noConflict: true }),
          rejectedAlternatives: JSON.stringify(rejected),
        });

        if (!ctx.classroomSlots.has(best.classroomId)) ctx.classroomSlots.set(best.classroomId, new Set());
        ctx.classroomSlots.get(best.classroomId)!.add(best.slot.id);
        if (lecturerId) {
          if (!ctx.lecturerSlots.has(lecturerId)) ctx.lecturerSlots.set(lecturerId, new Set());
          ctx.lecturerSlots.get(lecturerId)!.add(best.slot.id);
        }
        if (!ctx.groupSlots.has(gc.group.id)) ctx.groupSlots.set(gc.group.id, new Set());
        ctx.groupSlots.get(gc.group.id)!.add(best.slot.id);

        allocatedCount++;
        scoreSum += best.score;
      }
    });

    const conflictCount = this.detectConflicts(allocationRepo.findExisting(semesterId), semesterId).length;
    return {
      allocated: allocatedCount,
      unallocated,
      metrics: { conflicts: conflictCount, total: allocatedCount, averageScore: allocatedCount > 0 ? Math.round((scoreSum / allocatedCount) * 10) / 10 : 0, unallocatedCount: unallocated.length },
      warnings,
    };
  }
}
