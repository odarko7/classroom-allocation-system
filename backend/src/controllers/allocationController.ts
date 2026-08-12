import type { Response } from 'express';
import { allocationRepo } from '../repositories/allocationRepo.ts';
import { courseRepo } from '../repositories/courseRepo.ts';
import { groupRepo } from '../repositories/semesterRepo.ts';
import { all, get, insert, run } from '../utils/db.ts';
import { AllocationEngine } from '../algorithm/engine.ts';
import { optimizeAllocations } from '../algorithm/optimization.ts';
import { buildBusyMaps, recommendRoom, slotLabel } from '../algorithm/recommendation.ts';
import { capacityScore, combineScores, facilityScore, loadWeights } from '../algorithm/scoring.ts';
import { lecturerRepo } from '../repositories/courseRepo.ts';
import { ApiError, type AuthenticatedRequest } from '../middleware/auth.ts';
import { notify, writeAuditLog } from '../services/notificationService.ts';
import { paginate } from '../utils/db.ts';

export function listAllocations(req: AuthenticatedRequest, res: Response): void {
  const { semester, status, department, room, course, page = 1, pageSize = 20 } = req.query as Record<string, string>;
  const effectiveStatus = req.user?.role === 'VIEWER' ? 'APPROVED' : status;
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (semester) { conditions.push(`a.semester_id = ?`); params.push(Number(semester)); }
  if (effectiveStatus) { conditions.push(`a.status = ?`); params.push(effectiveStatus); }
  if (department) { conditions.push(`co.department_id = ?`); params.push(Number(department)); }
  if (room) { conditions.push(`c.room_code LIKE ?`); params.push(`%${room}%`); }
  if (course) { conditions.push(`(co.course_code LIKE ? OR co.name LIKE ?)`); params.push(`%${course}%`, `%${course}%`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT a.*, c.room_code, c.capacity, co.course_code, co.name AS course_name, g.name AS group_name,
      g.student_count AS group_student_count, l.name AS lecturer_name, ts.day AS slot_day,
      ts.start_time AS slot_start, ts.end_time AS slot_end, s.name AS semester_name, d.name AS department_name,
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
    ${where} ORDER BY ts.day, ts.start_time, c.room_code`;
  const result = paginate(sql, params, Number(page), Number(pageSize));
  res.json(result);
}

export function getAllocation(req: AuthenticatedRequest, res: Response): void {
  const id = Number(req.params.id);
  const allocation = allocationRepo.findById(id);
  if (!allocation) throw new ApiError(404, 'Allocation not found.');
  const score = allocationRepo.scoreFor(id);
  res.json({ ...allocation, score });
}

export function getTimetable(req: AuthenticatedRequest, res: Response): void {
  const { semester } = req.query as Record<string, string>;
  let sem = semester
    ? get<{ id: number; name: string; status: string }>(`SELECT id, name, status FROM semesters WHERE id = ?`, [Number(semester)])
    : get<{ id: number; name: string; status: string }>(`SELECT id, name, status FROM semesters WHERE status = 'ACTIVE' ORDER BY id DESC LIMIT 1`);
  if (!sem) throw new ApiError(404, 'No semester found.');
  const semesterId = sem.id;

  const allocations = all(`
    SELECT a.id, a.course_id, a.group_id, a.classroom_id, a.time_slot_id, a.semester_id, a.status,
      c.room_code, c.building, co.course_code, co.name AS course_name, g.name AS group_name,
      l.name AS lecturer_name, ts.day AS slot_day, ts.start_time AS slot_start, ts.end_time AS slot_end, ts.period_name
    FROM allocations a
    JOIN classrooms c ON c.id = a.classroom_id
    JOIN courses co ON co.id = a.course_id
    JOIN student_groups g ON g.id = a.group_id
    LEFT JOIN lecturers l ON l.id = a.lecturer_id
    JOIN time_slots ts ON ts.id = a.time_slot_id
    WHERE a.semester_id = ? AND a.status = 'APPROVED' AND ts.day BETWEEN 0 AND 4
    ORDER BY ts.day, ts.start_time, c.room_code`, [semesterId]);

  const timeSlots = all(`SELECT id, day, start_time, end_time, period_name FROM time_slots WHERE day BETWEEN 0 AND 4 ORDER BY start_time, day`);

  res.json({ semester: sem, allocations, timeSlots });
}

export function runOptimization(req: AuthenticatedRequest, res: Response): void {
  const { semesterId } = req.body;
  if (!semesterId) throw new ApiError(422, 'semesterId is required.');
  const semester = get<{ id: number }>(`SELECT id FROM semesters WHERE id = ?`, [semesterId]);
  if (!semester) throw new ApiError(404, 'Semester not found.');
  writeAuditLog({ userId: req.user!.id, username: req.user!.email, action: 'OPTIMIZATION_RUN', entityType: 'semester', entityId: semesterId, newValue: { } });
  try {
    const result = optimizeAllocations(semesterId, req.user!.id);
    notify({ userId: req.user!.id, type: 'ALLOCATION_PROPOSED', title: 'Optimization completed', message: result.message });
    res.json({ ...result, semesterId });
  } catch (err) {
    notify({ userId: req.user!.id, type: 'OPTIMIZATION_FAILED', title: 'Optimization failed', message: String(err) });
    throw err;
  }
}

export function recommendAllocation(req: AuthenticatedRequest, res: Response): void {
  const { courseId, studentCount, lecturerId, semesterId, timeSlotId } = req.body;
  const result = recommendRoom({
    courseId: Number(courseId),
    studentCount: Number(studentCount),
    lecturerId: Number(lecturerId),
    semesterId: Number(semesterId),
    timeSlotId: timeSlotId ? Number(timeSlotId) : null,
  });
  writeAuditLog({ userId: req.user!.id, username: req.user!.email, action: 'ALLOCATION_RECOMMENDED', entityType: 'course', entityId: result.courseId, newValue: { studentCount: result.studentCount, lecturerId: result.lecturerId, semesterId: result.semesterId } });
  res.json(result);
}

export function confirmRecommendation(req: AuthenticatedRequest, res: Response): void {
  const { courseId, studentCount, lecturerId, semesterId, classroomId, timeSlotId } = req.body;
  if (!courseId || !studentCount || !lecturerId || !semesterId || !classroomId || !timeSlotId) {
    throw new ApiError(422, 'courseId, studentCount, lecturerId, semesterId, classroomId and timeSlotId are required.');
  }
  const cid = Number(courseId);
  const students = Number(studentCount);
  const lid = Number(lecturerId);
  const sid = Number(semesterId);
  const roomId = Number(classroomId);
  const slotId = Number(timeSlotId);

  const course = get<{ id: number; course_code: string; name: string; required_room_type: string | null }>(`SELECT * FROM courses WHERE id = ?`, [cid]);
  if (!course) throw new ApiError(404, 'Course not found.');
  const lecturer = lecturerRepo.findById(lid);
  if (!lecturer) throw new ApiError(404, 'Lecturer not found.');
  if (lecturer.is_active !== 1) throw new ApiError(409, `Lecturer ${lecturer.name} is not active and cannot be assigned.`);
  const semester = get<{ id: number }>(`SELECT * FROM semesters WHERE id = ?`, [sid]);
  if (!semester) throw new ApiError(404, 'Semester not found.');
  const room = get<{ id: number; room_code: string; capacity: number; room_type: string; status: string }>(`SELECT * FROM classrooms WHERE id = ?`, [roomId]);
  if (!room) throw new ApiError(404, 'Classroom not found.');
  if (room.status !== 'ACTIVE') throw new ApiError(409, `Classroom ${room.room_code} is not active.`);
  const slot = get<{ id: number; day: number; start_time: string; end_time: string; period_name: string | null }>(`SELECT id, day, start_time, end_time, period_name FROM time_slots WHERE id = ?`, [slotId]);
  if (!slot) throw new ApiError(404, 'Time slot not found.');

  if (students <= 0) throw new ApiError(422, 'Number of students must be a positive integer.');
  if (room.capacity < students) {
    throw new ApiError(409, `Classroom capacity exceeded: ${students} students > ${room.room_code} capacity (${room.capacity}).`);
  }
  if (course.required_room_type && room.room_type !== course.required_room_type) {
    throw new ApiError(409, `Room type mismatch: ${course.name} requires ${course.required_room_type}, but ${room.room_code} is a ${room.room_type}.`);
  }
  const requiredFacilities = all<{ name: string }>(`SELECT f.name FROM course_requirements cr JOIN facilities f ON f.id = cr.facility_id WHERE cr.course_id = ?`, [cid]).map((r) => r.name);
  const roomFacilities = new Set(all<{ name: string }>(`SELECT f.name FROM classroom_facilities cf JOIN facilities f ON f.id = cf.facility_id WHERE cf.classroom_id = ?`, [roomId]).map((r) => r.name));
  const missingFacilities = requiredFacilities.filter((f) => !roomFacilities.has(f));
  if (missingFacilities.length > 0) {
    throw new ApiError(409, `${room.room_code} is missing required facilities: ${missingFacilities.join(', ')}.`);
  }

  // Ensure the course has a student group for this semester.
  let group = get<{ id: number; course_id: number; lecturer_id: number | null; student_count: number }>(`SELECT * FROM student_groups WHERE course_id = ? AND semester_id = ?`, [cid, sid]);
  let groupCreated = false;
  if (!group) {
    group = {
      id: insert(`INSERT INTO student_groups (name, course_id, lecturer_id, semester_id, student_count) VALUES (?, ?, ?, ?, ?)`, [`${course.course_code} Section 1`, cid, lid, sid, students]),
      course_id: cid,
      lecturer_id: lid,
      student_count: students,
    };
    groupCreated = true;
  } else {
    run(`UPDATE student_groups SET student_count = ?, lecturer_id = ? WHERE id = ?`, [students, lid, group.id]);
  }

  // A course can only have one allocation in a semester.
  const existing = all<{ id: number; status: string }>(`SELECT id, status FROM allocations WHERE group_id = ? AND semester_id = ?`, [group.id, sid]);
  const approved = existing.find((a) => a.status === 'APPROVED');
  if (approved) {
    throw new ApiError(409, `${course.course_code} already has an approved allocation in this semester. Reject it first to re-allocate.`);
  }
  for (const a of existing) if (a.status === 'PROPOSED') allocationRepo.delete(a.id);

  // Re-validate double-booking and lecturer availability, ignoring this course's own group.
  const busy = buildBusyMaps(sid, group.id);
  if ((busy.room.get(roomId) ?? new Set()).has(slotId)) {
    throw new ApiError(409, `${room.room_code} is already booked for this time slot.`);
  }
  if ((busy.lecturer.get(lid) ?? new Set()).has(slotId)) {
    throw new ApiError(409, `${lecturer.name} is already assigned to another class in this time slot.`);
  }

  const weights = loadWeights();
  const score = combineScores(
    {
      capacity: capacityScore(students, room.capacity),
      facilities: facilityScore(requiredFacilities, Array.from(roomFacilities)),
      availability: 1,
      utilization: 1,
      location: 1,
      department: 1,
    },
    weights,
  );

  const allocId = allocationRepo.create({
    groupId: group.id, courseId: cid, classroomId: roomId, timeSlotId: slotId,
    semesterId: sid, lecturerId: lid, status: 'PROPOSED', score, createdBy: req.user!.id,
  });
  allocationRepo.addScore({
    allocationId: allocId, total: score,
    capacity: capacityScore(students, room.capacity), facilities: facilityScore(requiredFacilities, Array.from(roomFacilities)),
    availability: 1, utilization: 1, location: 1, department: 1,
    explanation: JSON.stringify({ source: 'interactive-recommendation', studentCount: students, lecturerId: lid, capacitySuitable: true, facilitySuitable: true }),
    rejectedAlternatives: '[]',
  });

  const engine = new AllocationEngine();
  const conflicts = engine.detectConflicts(allocationRepo.findExisting(sid), sid).filter((c) => c.allocationId === allocId);
  for (const c of conflicts) allocationRepo.addConflict(allocId, c.type, c.description, c.severity);

  writeAuditLog({ userId: req.user!.id, username: req.user!.email, action: 'ALLOCATION_CREATED', entityType: 'allocation', entityId: allocId, newValue: { courseId: cid, classroomId: roomId, timeSlotId: slotId, semesterId: sid, source: 'interactive-recommendation' } });
  notify({ userId: req.user!.id, type: 'ALLOCATION_PROPOSED', title: 'Allocation proposed', message: `${course.course_code} -> ${room.room_code} at ${slotLabel(slot)} (${students} students)` });
  const allocation = allocationRepo.findById(allocId);
  res.status(201).json({
    id: allocId,
    groupId: group.id,
    groupCreated,
    message: `Allocation for ${course.course_code} proposed: ${room.room_code} (capacity ${room.capacity}) at ${slotLabel(slot)}.`,
    allocation,
  });
}

export function proposeAllocation(req: AuthenticatedRequest, res: Response): void {
  const { groupId, semesterId } = req.body;
  const group = get<{ id: number; course_id: number; lecturer_id: number | null; student_count: number }>(`SELECT * FROM student_groups WHERE id = ?`, [groupId]);
  if (!group) throw new ApiError(404, 'Student group not found.');
  const engine = new AllocationEngine();
  const result = engine.generateAllocations(semesterId, req.user!.id);
  writeAuditLog({ userId: req.user!.id, username: req.user!.email, action: 'ALLOCATION_PROPOSED', entityType: 'group', entityId: groupId, newValue: { result } });
  res.json(result);
}

export function approveAllocation(req: AuthenticatedRequest, res: Response): void {
  const id = Number(req.params.id);
  const allocation = allocationRepo.findById(id) as unknown as { semester_id: number; course_code: string; room_code: string; status: string };
  if (!allocation) throw new ApiError(404, 'Allocation not found.');
  const engine = new AllocationEngine();
  // Only conflicts against already approved allocations block approval. Other
  // PROPOSED allocations can still be rejected or re-run, so they must not
  // prevent this one from being approved.
  const existing = allocationRepo.findExisting(allocation.semester_id);
  const toCheck = existing.filter((a) => a.id === id || a.status === 'APPROVED');
  const conflicts = engine.detectConflicts(toCheck, allocation.semester_id);
  const ownConflicts = conflicts.filter((c) => c.allocationId === id);
  if (ownConflicts.length > 0) {
    throw new ApiError(409, `Cannot approve: this allocation conflicts with an already approved allocation (${ownConflicts[0].type}).`);
  }
  allocationRepo.markConflictsResolved(id);
  allocationRepo.updateStatus(id, 'APPROVED', req.user!.id);
  writeAuditLog({ userId: req.user!.id, username: req.user!.email, action: 'ALLOCATION_APPROVED', entityType: 'allocation', entityId: id, oldValue: { status: 'PROPOSED' }, newValue: { status: 'APPROVED' } });
  notify({ role: 'HOD', type: 'ALLOCATION_APPROVED', title: 'Allocation approved', message: `${allocation.course_code} → ${allocation.room_code}` });
  res.json({ message: 'Allocation approved.' });
}

export function rejectAllocation(req: AuthenticatedRequest, res: Response): void {
  const id = Number(req.params.id);
  const allocation = allocationRepo.findById(id);
  if (!allocation) throw new ApiError(404, 'Allocation not found.');
  allocationRepo.updateStatus(id, 'REJECTED', req.user!.id);
  writeAuditLog({ userId: req.user!.id, username: req.user!.email, action: 'ALLOCATION_REJECTED', entityType: 'allocation', entityId: id, oldValue: { status: allocation.status }, newValue: { status: 'REJECTED' } });
  notify({ role: 'HOD', type: 'ALLOCATION_CHANGED', title: 'Allocation rejected', message: `${allocation.course_code} rejected from ${allocation.room_code}` });
  res.json({ message: 'Allocation rejected.' });
}

export function deleteAllocation(req: AuthenticatedRequest, res: Response): void {
  const id = Number(req.params.id);
  if (!allocationRepo.findById(id)) throw new ApiError(404, 'Allocation not found.');
  allocationRepo.delete(id);
  writeAuditLog({ userId: req.user!.id, username: req.user!.email, action: 'ALLOCATION_DELETED', entityType: 'allocation', entityId: id });
  res.json({ message: 'Allocation deleted.' });
}

function normalizeDetectedConflicts(conflicts: { allocationId: number; type: string; description: string; severity: string }[], semesterId: number) {
  const allocs = new Map(allocationRepo.findBySemester(semesterId).map((a) => [a.id, a]));
  return conflicts.map((c, i) => {
    const a = allocs.get(c.allocationId);
    return {
      id: -(i + 1),
      allocation_id: c.allocationId,
      conflict_type: c.type,
      description: c.description,
      severity: c.severity,
      resolved: 0,
      allocation_status: a?.status ?? null,
      room_code: a?.room_code ?? null,
      course_code: a?.course_code ?? null,
      slot_day: a?.slot_day ?? null,
      start_time: a?.slot_start ?? null,
    };
  });
}

export function listConflicts(req: AuthenticatedRequest, res: Response): void {
  const { semester } = req.query as Record<string, string>;
  if (semester) {
    const semesterId = Number(semester);
    const engine = new AllocationEngine();
    const conflicts = engine.detectConflicts(allocationRepo.findExisting(semesterId), semesterId);
    res.json(normalizeDetectedConflicts(conflicts, semesterId));
    return;
  }
  res.json(allocationRepo.conflicts());
}

export function validateSemester(req: AuthenticatedRequest, res: Response): void {
  const { semester } = req.query as Record<string, string>;
  const semesterId = Number(semester) || (get<{ id: number }>(`SELECT id FROM semesters WHERE status = 'ACTIVE'`)?.id ?? 0);
  const engine = new AllocationEngine();
  const allocations = allocationRepo.findExisting(semesterId);
  const conflicts = engine.detectConflicts(allocations, semesterId);
  const groups = get<{ c: number }>(`SELECT COUNT(*) AS c FROM student_groups WHERE semester_id = ?`, [semesterId])?.c ?? 0;
  const allocated = allocations.filter((a) => a.status !== 'REJECTED').length;
  res.json({ semesterId, conflicts, conflictCount: conflicts.length, groups, allocated, unallocated: Math.max(0, groups - allocated) });
}

export function listStudentGroups(req: AuthenticatedRequest, res: Response): void {
  const { semester } = req.query as Record<string, string>;
  const conditions = semester ? `WHERE g.semester_id = ?` : '';
  const params = semester ? [Number(semester)] : [];
  const rows = all(`
    SELECT g.*, c.course_code, c.name AS course_name, l.name AS lecturer_name, d.name AS department_name,
      (SELECT COUNT(*) FROM allocations a WHERE a.group_id = g.id AND a.status = 'APPROVED') AS has_allocation
    FROM student_groups g
    JOIN courses c ON c.id = g.course_id
    LEFT JOIN lecturers l ON l.id = g.lecturer_id
    LEFT JOIN departments d ON d.id = c.department_id
    ${conditions} ORDER BY c.course_code, g.name`, params);
  res.json(rows);
}

export function createAllocation(req: AuthenticatedRequest, res: Response): void {
  const { groupId, classroomId, timeSlotId, semesterId, status = 'PROPOSED' } = req.body;
  if (!groupId || !classroomId || !timeSlotId || !semesterId) {
    throw new ApiError(422, 'groupId, classroomId, timeSlotId and semesterId are required.');
  }
  const group = get<{ id: number; course_id: number; lecturer_id: number | null; student_count: number }>(
    `SELECT * FROM student_groups WHERE id = ?`, [groupId],
  );
  if (!group) throw new ApiError(404, 'Student group not found.');
  const room = get<{ id: number; room_code: string; capacity: number }>(`SELECT * FROM classrooms WHERE id = ?`, [classroomId]);
  if (!room) throw new ApiError(404, 'Classroom not found.');
  const slot = get<{ id: number }>(`SELECT * FROM time_slots WHERE id = ?`, [timeSlotId]);
  if (!slot) throw new ApiError(404, 'Time slot not found.');
  const semester = get<{ id: number }>(`SELECT * FROM semesters WHERE id = ?`, [semesterId]);
  if (!semester) throw new ApiError(404, 'Semester not found.');

  if (group.student_count > room.capacity) {
    throw new ApiError(409, `Group of ${group.student_count} students exceeds ${room.room_code} capacity (${room.capacity}).`);
  }

  const engine = new AllocationEngine();
  const existing = allocationRepo.findExisting(semesterId);
  const conflicting = existing.filter((a) => a.status !== 'REJECTED' && a.time_slot_id === slot.id);
  const roomBusy = conflicting.find((a) => a.classroom_id === room.id);
  if (roomBusy) {
    throw new ApiError(409, `${room.room_code} is already booked for this time slot.`);
  }
  const lecturerId = group.lecturer_id;
  if (lecturerId) {
    const lecturerBusy = conflicting.find((a) => a.lecturer_id === lecturerId);
    if (lecturerBusy) {
      throw new ApiError(409, 'Lecturer is already assigned to another class in this time slot.');
    }
  }
  const groupBusy = conflicting.find((a) => a.group_id === group.id);
  if (groupBusy) {
    throw new ApiError(409, 'This student group is already scheduled in this time slot.');
  }

  const id = allocationRepo.create({
    groupId, courseId: group.course_id, classroomId, timeSlotId, semesterId,
    lecturerId, status, createdBy: req.user!.id,
  });

  const conflicts = engine.detectConflicts(allocationRepo.findExisting(semesterId), semesterId)
    .filter((c) => c.allocationId === id);
  for (const c of conflicts) {
    allocationRepo.addConflict(id, c.type, c.description, c.severity);
  }

  writeAuditLog({ userId: req.user!.id, username: req.user!.email, action: 'ALLOCATION_CREATED', entityType: 'allocation', entityId: id, newValue: req.body });
  const allocation = allocationRepo.findById(id);
  res.status(201).json({ id, message: 'Allocation created.', allocation });
}

export function createGroup(req: AuthenticatedRequest, res: Response): void {
  const { name, courseId, lecturerId, semesterId, studentCount } = req.body;
  const course = courseRepo.findById(courseId);
  if (!course) throw new ApiError(404, 'Course not found.');
  const id = groupRepo.create({ name, courseId, lecturerId, semesterId, studentCount });
  writeAuditLog({ userId: req.user!.id, username: req.user!.email, action: 'GROUP_CREATED', entityType: 'group', entityId: id, newValue: req.body });
  res.status(201).json({ id, message: 'Group created.' });
}
