import type { Response } from 'express';
import { allocationRepo } from '../repositories/allocationRepo.ts';
import { courseRepo } from '../repositories/courseRepo.ts';
import { groupRepo } from '../repositories/semesterRepo.ts';
import { all, get } from '../utils/db.ts';
import { AllocationEngine } from '../algorithm/engine.ts';
import { optimizeAllocations } from '../algorithm/optimization.ts';
import { ApiError, type AuthenticatedRequest } from '../middleware/auth.ts';
import { notify, writeAuditLog } from '../services/notificationService.ts';
import { paginate } from '../utils/db.ts';

export function listAllocations(req: AuthenticatedRequest, res: Response): void {
  const { semester, status, department, room, course, page = 1, pageSize = 20 } = req.query as Record<string, string>;
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (semester) { conditions.push(`a.semester_id = ?`); params.push(Number(semester)); }
  if (status) { conditions.push(`a.status = ?`); params.push(status); }
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
  const conflicts = engine.detectConflicts(allocationRepo.findExisting(allocation.semester_id), allocation.semester_id);
  const ownConflicts = conflicts.filter((c) => c.allocationId === id);
  if (ownConflicts.length > 0) {
    throw new ApiError(409, `Cannot approve: this allocation has unresolved conflicts (${ownConflicts[0].type}).`);
  }
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

export function listConflicts(req: AuthenticatedRequest, res: Response): void {
  const { semester } = req.query as Record<string, string>;
  if (semester) {
    const engine = new AllocationEngine();
    const conflicts = engine.detectConflicts(allocationRepo.findExisting(Number(semester)), Number(semester));
    res.json(conflicts);
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
