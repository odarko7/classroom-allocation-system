import { all, get } from '../utils/db.ts';
import { classroomRepo } from '../repositories/classroomRepo.ts';
import { allocationRepo } from '../repositories/allocationRepo.ts';
import { AllocationEngine } from '../algorithm/engine.ts';
import type { AllocationRow, TimeSlotRow } from '../models/types.ts';
import { DAY_NAMES, timeToMinutes } from '../algorithm/scoring.ts';

function slotHours(ts: TimeSlotRow): number {
  return (timeToMinutes(ts.end_time) - timeToMinutes(ts.start_time)) / 60;
}

function allocationsOf(semesterId: number): AllocationRow[] {
  return all<AllocationRow>(`SELECT * FROM allocations WHERE semester_id = ? AND status != 'REJECTED'`, [semesterId]);
}

export interface ClassroomUsageRow {
  classroomId: number;
  roomCode: string;
  building: string;
  capacity: number;
  usedHours: number;
  availableHours: number;
  utilization: number;
  bookings: number;
  studentsServed: number;
}

export interface AnalyticsSummary {
  totalClassrooms: number;
  availableClassrooms: number;
  totalCourses: number;
  totalLecturers: number;
  totalDepartments: number;
  totalFaculties: number;
  totalStudents: number;
  totalAllocations: number;
  approvedAllocations: number;
  proposedAllocations: number;
  conflicts: number;
  utilizationRate: number;
  averageAllocationScore: number;
  unallocatedGroups: number;
  totalGroups: number;
  allocationSuccessRate: number;
  capacityEfficiency: number;
  peakDay: string;
  peakPeriod: string;
  lowestDay: string;
  averageClassroomsPerBuilding: number;
}

export function classroomUsage(semesterId: number, availableHoursOverride?: number): ClassroomUsageRow[] {
  const rooms = classroomRepo.list();
  const slots = all<TimeSlotRow>(`SELECT * FROM time_slots`);
  const availableHours = availableHoursOverride ?? slots.reduce((s, t) => s + slotHours(t), 0);
  const allocs = allocationsOf(semesterId);
  const hourById = new Map<number, number>();
  const bookingById = new Map<number, number>();
  const studentsById = new Map<number, number>();
  for (const a of allocs) {
    const ts = slots.find((s) => s.id === a.time_slot_id);
    if (!ts) continue;
    hourById.set(a.classroom_id, (hourById.get(a.classroom_id) ?? 0) + slotHours(ts));
    bookingById.set(a.classroom_id, (bookingById.get(a.classroom_id) ?? 0) + 1);
    const g = get<{ student_count: number }>(`SELECT student_count FROM student_groups WHERE id = ?`, [a.group_id]);
    if (g) studentsById.set(a.classroom_id, (studentsById.get(a.classroom_id) ?? 0) + g.student_count);
  }
  return rooms.map((r) => {
    const usedHours = hourById.get(r.id) ?? 0;
    return {
      classroomId: r.id, roomCode: r.room_code, building: r.building, capacity: r.capacity,
      usedHours: Math.round(usedHours * 10) / 10,
      availableHours: Math.round(availableHours * 10) / 10,
      utilization: Math.round((usedHours / availableHours) * 1000) / 10,
      bookings: bookingById.get(r.id) ?? 0,
      studentsServed: studentsById.get(r.id) ?? 0,
    };
  });
}

export function buildingUtilization(semesterId: number) {
  const usage = classroomUsage(semesterId);
  const byBuilding = new Map<string, { usedHours: number; availableHours: number; classrooms: number }>();
  for (const u of usage) {
    const e = byBuilding.get(u.building) ?? { usedHours: 0, availableHours: 0, classrooms: 0 };
    e.usedHours += u.usedHours;
    e.availableHours += u.availableHours;
    e.classrooms += 1;
    byBuilding.set(u.building, e);
  }
  return [...byBuilding.entries()].map(([building, e]) => ({
    building,
    classrooms: e.classrooms,
    utilization: Math.round((e.usedHours / e.availableHours) * 1000) / 10,
  })).sort((a, b) => b.utilization - a.utilization);
}

export function departmentDemand(semesterId: number) {
  return all(`
    SELECT d.name AS department, d.id AS department_id, COUNT(a.id) AS allocations, SUM(g.student_count) AS students,
      AVG(a.score) AS average_score
    FROM allocations a
    JOIN courses co ON co.id = a.course_id
    JOIN departments d ON d.id = co.department_id
    JOIN student_groups g ON g.id = a.group_id
    WHERE a.semester_id = ? AND a.status != 'REJECTED'
    GROUP BY d.id, d.name
    ORDER BY allocations DESC
  `, [semesterId]);
}

export function timeDemand(semesterId: number) {
  const slots = all<TimeSlotRow>(`SELECT * FROM time_slots`);
  const allocs = allocationsOf(semesterId);
  const countById = new Map<number, number>();
  for (const a of allocs) countById.set(a.time_slot_id, (countById.get(a.time_slot_id) ?? 0) + 1);
  return slots.map((s) => ({
    day: DAY_NAMES[s.day],
    dayIndex: s.day,
    startTime: s.start_time,
    endTime: s.end_time,
    label: `${DAY_NAMES[s.day]} ${s.start_time}-${s.end_time}`,
    bookings: countById.get(s.id) ?? 0,
    hours: slotHours(s),
  }));
}

export function peakPeriods(semesterId: number) {
  const demand = timeDemand(semesterId);
  const byDay = new Map<string, number>();
  for (const d of demand) byDay.set(d.day, (byDay.get(d.day) ?? 0) + d.bookings);
  const sorted = [...byDay.entries()].sort((a, b) => b[1] - a[1]);
  const peak = demand.slice().sort((a, b) => b.bookings - a.bookings);
  return {
    peakDay: sorted[0]?.[0] ?? 'N/A',
    lowestDay: sorted[sorted.length - 1]?.[0] ?? 'N/A',
    peakPeriod: peak[0] ? `${peak[0].startTime} - ${peak[0].endTime}` : 'N/A',
    peakPeriodDay: peak[0]?.day ?? 'N/A',
    hourly: demand,
  };
}

export function capacityEfficiency(semesterId: number): number {
  const allocs = allocationsOf(semesterId);
  const groups = all<{ id: number; student_count: number }>(`SELECT id, student_count FROM student_groups`);
  const rooms = all<{ id: number; capacity: number }>(`SELECT id, capacity FROM classrooms`);
  const size = new Map(groups.map((g) => [g.id, g.student_count]));
  const cap = new Map(rooms.map((r) => [r.id, r.capacity]));
  let sum = 0;
  let count = 0;
  for (const a of allocs) {
    const c = cap.get(a.classroom_id);
    const s = size.get(a.group_id);
    if (c && s && c > 0) { sum += s / c; count++; }
  }
  return count ? Math.round((sum / count) * 1000) / 10 : 0;
}

export function conflictRate(semesterId: number): number {
  const allocs = allocationRepo.countBySemester(semesterId);
  if (allocs === 0) return 0;
  const engine = new AllocationEngine();
  const conflicts = engine.detectConflicts(allocationsOf(semesterId), semesterId).length;
  return Math.round((conflicts / allocs) * 1000) / 10;
}

export async function analyticsSummary(semesterId: number | null): Promise<AnalyticsSummary> {
  const semester = semesterId ?? get<{ id: number }>(`SELECT id FROM semesters ORDER BY id DESC LIMIT 1`)?.id ?? null;
  const totalGroups = semester ? get<{ c: number }>(`SELECT COUNT(*) AS c FROM student_groups WHERE semester_id = ?`, [semester])?.c ?? 0 : 0;
  const allocatedGroups = semester ? get<{ c: number }>(`SELECT COUNT(*) AS c FROM allocations WHERE semester_id = ? AND status != 'REJECTED'`, [semester])?.c ?? 0 : 0;
  const conflicts = semester ? new AllocationEngine().detectConflicts(allocationRepo.findExisting(semester), semester).length : 0;
  const usage = semester ? classroomUsage(semester) : [];
  const used = usage.reduce((s, u) => s + u.usedHours, 0);
  const avail = usage.reduce((s, u) => s + u.availableHours, 0);
  const peaks = semester ? peakPeriods(semester) : { peakDay: 'N/A', lowestDay: 'N/A', peakPeriod: 'N/A', peakPeriodDay: 'N/A', hourly: [] };
  const scores = semester ? all<{ score: number | null }>(`SELECT score FROM allocations WHERE semester_id = ? AND status != 'REJECTED' AND score IS NOT NULL`, [semester]) : [];
  const avgScore = scores.length ? Math.round(scores.reduce((s, r) => s + Number(r.score), 0) / scores.length * 10) / 10 : 0;
  const totalAllocations = semester ? allocationRepo.countBySemester(semester) : 0;
  const approved = semester ? get<{ c: number }>(`SELECT COUNT(*) AS c FROM allocations WHERE semester_id = ? AND status = 'APPROVED'`, [semester])?.c ?? 0 : 0;
  const proposed = semester ? get<{ c: number }>(`SELECT COUNT(*) AS c FROM allocations WHERE semester_id = ? AND status = 'PROPOSED'`, [semester])?.c ?? 0 : 0;

  return {
    totalClassrooms: classroomRepo.count(),
    availableClassrooms: get<{ c: number }>(`SELECT COUNT(*) AS c FROM classrooms WHERE status = 'ACTIVE'`)?.c ?? 0,
    totalCourses: get<{ c: number }>(`SELECT COUNT(*) AS c FROM courses`)?.c ?? 0,
    totalLecturers: get<{ c: number }>(`SELECT COUNT(*) AS c FROM lecturers`)?.c ?? 0,
    totalDepartments: get<{ c: number }>(`SELECT COUNT(*) AS c FROM departments`)?.c ?? 0,
    totalFaculties: get<{ c: number }>(`SELECT COUNT(*) AS c FROM faculties`)?.c ?? 0,
    totalStudents: get<{ c: number }>(`SELECT COUNT(*) AS c FROM students`)?.c ?? 0,
    totalAllocations,
    approvedAllocations: approved,
    proposedAllocations: proposed,
    conflicts,
    utilizationRate: avail > 0 ? Math.round((used / avail) * 1000) / 10 : 0,
    averageAllocationScore: avgScore,
    unallocatedGroups: Math.max(0, totalGroups - allocatedGroups),
    totalGroups,
    allocationSuccessRate: totalGroups > 0 ? Math.round((allocatedGroups / totalGroups) * 1000) / 10 : 0,
    capacityEfficiency: semester ? capacityEfficiency(semester) : 0,
    peakDay: peaks.peakDay,
    peakPeriod: peaks.peakPeriod,
    lowestDay: peaks.lowestDay,
    averageClassroomsPerBuilding: 0,
  };
}
