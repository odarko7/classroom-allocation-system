import { all, get } from '../utils/db.ts';
import { allocationRepo } from '../repositories/allocationRepo.ts';
import { classroomRepo } from '../repositories/classroomRepo.ts';
import { lecturerRepo } from '../repositories/courseRepo.ts';
import type { AllocationRow, CourseRow, LecturerRow, TimeSlotRow } from '../models/types.ts';
import { ApiError } from '../middleware/auth.ts';
import { capacityScore, combineScores, DAY_NAMES, facilityScore, loadWeights } from './scoring.ts';

export interface RecommendedRoom {
  classroomId: number;
  roomCode: string;
  building: string;
  floor: number;
  capacity: number;
  roomType: string;
  facilities: string[];
  missingFacilities: string[];
  timeSlotId: number | null;
  timeSlotLabel: string | null;
  utilization: number;
  capacityScore: number;
  facilityScore: number;
  score: number;
}

export interface RejectedRoom {
  roomCode: string;
  building: string;
  capacity: number;
  roomType: string;
  reasons: string[];
}

export interface RecommendationResult {
  success: boolean;
  message: string;
  courseId: number;
  courseCode: string;
  courseName: string;
  departmentName: string | null;
  studentCount: number;
  lecturerId: number | null;
  lecturerName: string | null;
  semesterId: number;
  semesterName: string;
  requiredRoomType: string | null;
  requiredFacilities: string[];
  suitable: RecommendedRoom[];
  rejected: RejectedRoom[];
  best: RecommendedRoom | null;
  reasons: string[];
}

interface BusyMap {
  room: Map<number, Set<number>>;
  lecturer: Map<number, Set<number>>;
}

export function slotLabel(ts: TimeSlotRow): string {
  return `${DAY_NAMES[ts.day] ?? 'Day'} ${ts.start_time}-${ts.end_time}`;
}

/** Build classroom/lecturer busy-slot maps from existing (non-rejected) allocations. */
export function buildBusyMaps(semesterId: number, excludeGroupId?: number): BusyMap {
  const room = new Map<number, Set<number>>();
  const lecturer = new Map<number, Set<number>>();
  const rows = allocationRepo.findExisting(semesterId).filter((a) => a.status !== 'REJECTED' && a.group_id !== excludeGroupId);
  for (const a of rows) {
    if (!room.has(a.classroom_id)) room.set(a.classroom_id, new Set());
    room.get(a.classroom_id)!.add(a.time_slot_id);
    if (a.lecturer_id) {
      if (!lecturer.has(a.lecturer_id)) lecturer.set(a.lecturer_id, new Set());
      lecturer.get(a.lecturer_id)!.add(a.time_slot_id);
    }
  }
  return { room, lecturer };
}

function courseRequiredFacilities(courseId: number): string[] {
  return all<{ name: string }>(`SELECT f.name FROM course_requirements cr JOIN facilities f ON f.id = cr.facility_id WHERE cr.course_id = ?`, [courseId]).map((r) => r.name);
}

export interface RecommendInput {
  courseId: number;
  studentCount: number;
  lecturerId: number;
  semesterId: number;
  timeSlotId?: number | null;
}

export function recommendRoom(input: RecommendInput): RecommendationResult {
  const { courseId, studentCount, lecturerId, semesterId } = input;
  if (!Number.isInteger(courseId) || courseId <= 0) throw new ApiError(422, 'A valid course must be selected.');
  if (!Number.isInteger(studentCount) || studentCount <= 0) throw new ApiError(422, 'Number of students must be a positive integer.');
  if (!Number.isInteger(lecturerId) || lecturerId <= 0) throw new ApiError(422, 'A lecturer must be selected.');
  if (!Number.isInteger(semesterId) || semesterId <= 0) throw new ApiError(422, 'A semester must be selected.');

  const course = get<CourseRow & { department_name: string | null }>(
    `SELECT c.*, d.name AS department_name FROM courses c LEFT JOIN departments d ON d.id = c.department_id WHERE c.id = ?`, [courseId],
  );
  if (!course) throw new ApiError(404, 'Course not found.');

  const lecturer = lecturerRepo.findById(lecturerId) as LecturerRow | undefined;
  if (!lecturer) throw new ApiError(404, 'Lecturer not found.');
  if (lecturer.is_active !== 1) throw new ApiError(409, `Lecturer ${lecturer.name} is not active and cannot be assigned.`);

  const semester = get<{ id: number; name: string }>(`SELECT id, name FROM semesters WHERE id = ?`, [semesterId]);
  if (!semester) throw new ApiError(404, 'Semester not found.');

  const requiredFacilities = courseRequiredFacilities(course.id);
  const requiredRoomType = course.required_room_type;
  const reasons: string[] = [];

  const slots = all<TimeSlotRow>(`SELECT * FROM time_slots ORDER BY day, start_time`);
  const requestedSlot = input.timeSlotId
    ? get<TimeSlotRow>(`SELECT * FROM time_slots WHERE id = ?`, [input.timeSlotId])
    : undefined;
  if (input.timeSlotId && !requestedSlot) throw new ApiError(404, 'Time slot not found.');
  const candidateSlots = requestedSlot ? [requestedSlot] : slots;

  const busy = buildBusyMaps(semesterId);
  const lecturerBusySlots = busy.lecturer.get(lecturerId) ?? new Set<number>();

  const rejected: RejectedRoom[] = [];
  const suitable: RecommendedRoom[] = [];
  const weights = loadWeights();

  const activeRooms = classroomRepo.list().filter((r) => r.status === 'ACTIVE');

  for (const room of activeRooms) {
    const failReasons: string[] = [];
    if (room.capacity < studentCount) {
      failReasons.push(`Capacity insufficient (${room.capacity} seats < ${studentCount} students)`);
    }
    if (requiredRoomType && room.room_type !== requiredRoomType) {
      failReasons.push(`Room type mismatch (needs ${requiredRoomType})`);
    }
    const present = new Set(room.facilities);
    const missing = requiredFacilities.filter((f) => !present.has(f));
    for (const f of missing) failReasons.push(`Missing required facility: ${f}`);

    if (failReasons.length > 0) {
      rejected.push({ roomCode: room.room_code, building: room.building, capacity: room.capacity, roomType: room.room_type, reasons: failReasons });
      continue;
    }

    const roomBusy = busy.room.get(room.id) ?? new Set<number>();
    let slot: TimeSlotRow | null = null;
    for (const s of candidateSlots) {
      if (roomBusy.has(s.id)) continue;
      if (lecturerBusySlots.has(s.id)) continue;
      slot = s;
      break;
    }

    if (!slot) {
      rejected.push({
        roomCode: room.room_code,
        building: room.building,
        capacity: room.capacity,
        roomType: room.room_type,
        reasons: ['No available time slot (room or lecturer already booked for every option)'],
      });
      continue;
    }

    const cScore = capacityScore(studentCount, room.capacity);
    const fScore = facilityScore(requiredFacilities, room.facilities);
    const totalHours = slots.reduce((sum, s) => sum + (new Date(`1970-01-01T${s.end_time}:00`).getTime() - new Date(`1970-01-01T${s.start_time}:00`).getTime()) / 3600000, 0);
    const usedHours = (busy.room.get(room.id) ?? new Set()).size * 1.5;
    const utilization = totalHours > 0 ? Math.min(1, usedHours / totalHours) : 0;
    const score = combineScores(
      {
        capacity: cScore,
        facilities: fScore,
        availability: 1,
        utilization: 1 - utilization,
        location: 1,
        department: 1,
      },
      weights,
    );

    suitable.push({
      classroomId: room.id,
      roomCode: room.room_code,
      building: room.building,
      floor: room.floor,
      capacity: room.capacity,
      roomType: room.room_type,
      facilities: room.facilities,
      missingFacilities: [],
      timeSlotId: slot.id,
      timeSlotLabel: slotLabel(slot),
      utilization,
      capacityScore: cScore,
      facilityScore: fScore,
      score,
    });
  }

  // Prefer the smallest suitable classroom that still fits, then the best score.
  suitable.sort((a, b) => a.capacity - b.capacity || b.score - a.score);

  if (lecturerBusySlots.size >= slots.length) {
    reasons.push(`Lecturer ${lecturer.name} is already assigned for every available time slot in this semester.`);
  }

  if (suitable.length === 0) {
    if (activeRooms.length === 0) {
      reasons.push('No active classrooms exist in the system.');
    } else {
      const onlyCapacity = rejected.length > 0 && rejected.every((r) => r.reasons.every((x) => x.startsWith('Capacity insufficient')));
      const onlyFacility = rejected.length > 0 && rejected.every((r) => r.reasons.every((x) => x.startsWith('Missing required facility')));
      const onlyType = rejected.length > 0 && rejected.every((r) => r.reasons.every((x) => x.startsWith('Room type mismatch')));
      if (onlyCapacity) reasons.push(`No classroom has enough capacity for ${studentCount} students.`);
      else if (onlyFacility) reasons.push(`No classroom provides all required facilities: ${requiredFacilities.join(', ')}.`);
      else if (onlyType) reasons.push(`No classroom matches the required room type: ${requiredRoomType}.`);
      else reasons.push('No classroom satisfies the capacity, room type and facility requirements for this course.');
      if (requestedSlot) reasons.push(`The selected time slot (${slotLabel(requestedSlot)}) may be limiting availability.`);
    }
  }

  const best = suitable[0] ?? null;
  const message = best
    ? `Recommended ${best.roomCode} (capacity ${best.capacity}) for ${studentCount} students at ${best.timeSlotLabel}.`
    : reasons[0] ?? 'No suitable classroom could be found for this course.';

  return {
    success: suitable.length > 0,
    message,
    courseId: course.id,
    courseCode: course.course_code,
    courseName: course.name,
    departmentName: course.department_name ?? null,
    studentCount,
    lecturerId,
    lecturerName: lecturer.name,
    semesterId,
    semesterName: semester.name,
    requiredRoomType,
    requiredFacilities,
    suitable,
    rejected,
    best,
    reasons,
  };
}
