import type { Response } from 'express';
import { classroomRepo } from '../repositories/classroomRepo.ts';
import { courseRepo } from '../repositories/courseRepo.ts';
import { lecturerRepo } from '../repositories/courseRepo.ts';
import { departmentRepo, facultyRepo, facilityRepo } from '../repositories/departmentRepo.ts';
import { semesterRepo, timeSlotRepo, groupRepo } from '../repositories/semesterRepo.ts';
import { ApiError, type AuthenticatedRequest } from '../middleware/auth.ts';
import { writeAuditLog } from '../services/notificationService.ts';
import { paginate } from '../utils/db.ts';

function audit(req: AuthenticatedRequest, action: string, entityType: string, entityId: number, oldValue?: unknown, newValue?: unknown): void {
  writeAuditLog({ userId: req.user!.id, username: req.user!.email, action, entityType, entityId, oldValue, newValue });
}

// ============ CLASSROOMS ============

export function listClassrooms(req: AuthenticatedRequest, res: Response): void {
  const { search, building, roomType, status, capacity, facility, page = 1, pageSize = 20 } = req.query as Record<string, string>;
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (search) { conditions.push(`(c.room_code LIKE ? OR c.building LIKE ?)`); params.push(`%${search}%`, `%${search}%`); }
  if (building) { conditions.push(`c.building = ?`); params.push(building); }
  if (roomType) { conditions.push(`c.room_type = ?`); params.push(roomType); }
  if (status) { conditions.push(`c.status = ?`); params.push(status); }
  if (capacity) { conditions.push(`c.capacity >= ?`); params.push(Number(capacity)); }
  if (facility) { conditions.push(`c.id IN (SELECT cf.classroom_id FROM classroom_facilities cf JOIN facilities f ON f.id = cf.facility_id WHERE f.name = ?)`); params.push(facility); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT c.*, (SELECT GROUP_CONCAT(f.name, '|') FROM classroom_facilities cf JOIN facilities f ON f.id = cf.facility_id WHERE cf.classroom_id = c.id) AS facilities FROM classrooms c ${where} ORDER BY c.building, c.room_code`;
  const result = paginate<any>(sql, params, Number(page), Number(pageSize));
  res.json({ ...result, rows: result.rows.map((r: any) => ({ ...r, facilities: r.facilities ? String(r.facilities).split('|') : [] })) });
}

export function listBuildings(_req: AuthenticatedRequest, res: Response): void {
  res.json(classroomRepo.listBuildings());
}

export function getClassroom(req: AuthenticatedRequest, res: Response): void {
  const room = classroomRepo.findById(Number(req.params.id));
  if (!room) throw new ApiError(404, 'Classroom not found.');
  const facilityRows = classroomRepo.list().find((r) => r.id === room.id);
  res.json({ ...room, facilities: facilityRows?.facilities ?? [] });
}

export function createClassroom(req: AuthenticatedRequest, res: Response): void {
  const { roomCode, name, building, floor, capacity, roomType, status, accessibility, description, facilities = [] } = req.body;
  if (classroomRepo.findByCode(roomCode)) throw new ApiError(409, `Classroom ${roomCode} already exists.`);
  const id = classroomRepo.create({ roomCode, name, building, floor, capacity, roomType, status, accessibility, description });
  const facilityIds = getFacilityIds(facilities);
  classroomRepo.setFacilities(id, facilityIds);
  audit(req, 'CLASSROOM_CREATED', 'classroom', id, null, { roomCode, building, capacity });
  res.status(201).json({ id, message: 'Classroom created.' });
}

export function updateClassroom(req: AuthenticatedRequest, res: Response): void {
  const id = Number(req.params.id);
  const room = classroomRepo.findByIdRaw(id);
  if (!room) throw new ApiError(404, 'Classroom not found.');
  const { roomCode, name, building, floor, capacity, roomType, status, accessibility, description, facilities } = req.body;
  const oldValue = { ...room };
  classroomRepo.update(id, { room_code: roomCode, name, building, floor, capacity, room_type: roomType, status, accessibility, description });
  if (facilities) {
    const facilityIds = getFacilityIds(facilities);
    classroomRepo.setFacilities(id, facilityIds);
  }
  audit(req, 'CLASSROOM_UPDATED', 'classroom', id, oldValue, req.body);
  res.json({ message: 'Classroom updated.' });
}

export function deleteClassroom(req: AuthenticatedRequest, res: Response): void {
  const id = Number(req.params.id);
  const room = classroomRepo.findByIdRaw(id);
  if (!room) throw new ApiError(404, 'Classroom not found.');
  classroomRepo.delete(id);
  audit(req, 'CLASSROOM_DELETED', 'classroom', id, { roomCode: room.room_code }, null);
  res.json({ message: 'Classroom deleted.' });
}

function getFacilityIds(names: string[]): number[] {
  const ids: number[] = [];
  for (const n of names) {
    const f = facilityRepo.findByName(n) as { id: number } | undefined;
    if (f) ids.push(f.id);
  }
  return ids;
}

// ============ COURSES ============

export function listCourses(req: AuthenticatedRequest, res: Response): void {
  const { search, department, semester, page = 1, pageSize = 20 } = req.query as Record<string, string>;
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (search) { conditions.push(`(c.course_code LIKE ? OR c.name LIKE ?)`); params.push(`%${search}%`, `%${search}%`); }
  if (department) { conditions.push(`c.department_id = ?`); params.push(Number(department)); }
  if (semester) { conditions.push(`c.semester_id = ?`); params.push(Number(semester)); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT c.*, d.name AS department_name, l.name AS lecturer_name,
      (SELECT GROUP_CONCAT(f.name, '|') FROM course_requirements cr JOIN facilities f ON f.id = cr.facility_id WHERE cr.course_id = c.id) AS required_facilities
    FROM courses c
    LEFT JOIN departments d ON d.id = c.department_id
    LEFT JOIN lecturers l ON l.id = c.lecturer_id
    ${where} ORDER BY c.course_code`;
  const result = paginate<any>(sql, params, Number(page), Number(pageSize));
  res.json({ ...result, rows: result.rows.map((r: any) => ({ ...r, required_facilities: r.required_facilities ? String(r.required_facilities).split('|') : [] })) });
}

export function getCourse(req: AuthenticatedRequest, res: Response): void {
  const course = courseRepo.findById(Number(req.params.id)) as unknown as { id: number };
  if (!course) throw new ApiError(404, 'Course not found.');
  const requirements = courseRepo.requirements(course.id).map((r) => r.name);
  const groups = groupRepo.findByCourse(course.id);
  res.json({ ...course, requiredFacilities: requirements, groups });
}

export function createCourse(req: AuthenticatedRequest, res: Response): void {
  const { courseCode, name, departmentId, lecturerId, studentCount, creditHours, requiredRoomType, semesterId, description, requiredFacilities = [] } = req.body;
  const id = courseRepo.create({ courseCode, name, departmentId, lecturerId, studentCount, creditHours, requiredRoomType, semesterId, description });
  const facilityIds = requiredFacilities.map((n: string) => (facilityRepo.findByName(n) as { id: number } | undefined)?.id).filter((x: number | undefined): x is number => x != null);
  courseRepo.setRequirements(id, facilityIds);
  audit(req, 'COURSE_CREATED', 'course', id, null, { courseCode, name, studentCount });
  res.status(201).json({ id, message: 'Course created.' });
}

export function updateCourse(req: AuthenticatedRequest, res: Response): void {
  const id = Number(req.params.id);
  const existing = courseRepo.findById(id);
  if (!existing) throw new ApiError(404, 'Course not found.');
  const { courseCode, name, departmentId, lecturerId, studentCount, creditHours, requiredRoomType, semesterId, description, requiredFacilities } = req.body;
  courseRepo.update(id, { course_code: courseCode, name, department_id: departmentId, lecturer_id: lecturerId, student_count: studentCount, credit_hours: creditHours, required_room_type: requiredRoomType, semester_id: semesterId, description });
  if (requiredFacilities) {
    const facilityIds = requiredFacilities.map((n: string) => (facilityRepo.findByName(n) as { id: number } | undefined)?.id).filter((x: number | undefined): x is number => x != null);
    courseRepo.setRequirements(id, facilityIds);
  }
  audit(req, 'COURSE_UPDATED', 'course', id, { name: existing.name }, req.body);
  res.json({ message: 'Course updated.' });
}

export function deleteCourse(req: AuthenticatedRequest, res: Response): void {
  const id = Number(req.params.id);
  const existing = courseRepo.findById(id);
  if (!existing) throw new ApiError(404, 'Course not found.');
  courseRepo.delete(id);
  audit(req, 'COURSE_DELETED', 'course', id, { courseCode: existing.course_code }, null);
  res.json({ message: 'Course deleted.' });
}

// ============ LECTURERS ============

export function listLecturers(req: AuthenticatedRequest, res: Response): void {
  const { search, department, page = 1, pageSize = 20 } = req.query as Record<string, string>;
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (search) { conditions.push(`(l.name LIKE ? OR l.staff_no LIKE ? OR l.email LIKE ?)`); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (department) { conditions.push(`l.department_id = ?`); params.push(Number(department)); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT l.*, d.name AS department_name FROM lecturers l LEFT JOIN departments d ON d.id = l.department_id ${where} ORDER BY l.name`;
  res.json(paginate(sql, params, Number(page), Number(pageSize)));
}

export function getLecturer(req: AuthenticatedRequest, res: Response): void {
  const lecturer = lecturerRepo.findById(Number(req.params.id));
  if (!lecturer) throw new ApiError(404, 'Lecturer not found.');
  res.json(lecturer);
}

export function createLecturer(req: AuthenticatedRequest, res: Response): void {
  const { staffNo, name, email, phone, departmentId, title } = req.body;
  const id = lecturerRepo.create({ staffNo, name, email, phone, departmentId, title });
  audit(req, 'LECTURER_CREATED', 'lecturer', id, null, { staffNo, name });
  res.status(201).json({ id, message: 'Lecturer created.' });
}

export function updateLecturer(req: AuthenticatedRequest, res: Response): void {
  const id = Number(req.params.id);
  if (!lecturerRepo.findById(id)) throw new ApiError(404, 'Lecturer not found.');
  const { staffNo, name, email, phone, departmentId, title, isActive } = req.body;
  lecturerRepo.update(id, { staff_no: staffNo, name, email, phone, department_id: departmentId, title, is_active: isActive });
  audit(req, 'LECTURER_UPDATED', 'lecturer', id, null, req.body);
  res.json({ message: 'Lecturer updated.' });
}

export function deleteLecturer(req: AuthenticatedRequest, res: Response): void {
  const id = Number(req.params.id);
  if (!lecturerRepo.findById(id)) throw new ApiError(404, 'Lecturer not found.');
  lecturerRepo.delete(id);
  audit(req, 'LECTURER_DELETED', 'lecturer', id, null, null);
  res.json({ message: 'Lecturer deleted.' });
}

// ============ DEPARTMENTS ============

export function listDepartments(req: AuthenticatedRequest, res: Response): void {
  res.json(departmentRepo.list());
}

export function getDepartment(req: AuthenticatedRequest, res: Response): void {
  const d = departmentRepo.findById(Number(req.params.id));
  if (!d) throw new ApiError(404, 'Department not found.');
  res.json(d);
}

export function createDepartment(req: AuthenticatedRequest, res: Response): void {
  const { name, code, facultyId, hodId } = req.body;
  const id = departmentRepo.create({ name, code, facultyId, hodId });
  audit(req, 'DEPARTMENT_CREATED', 'department', id, null, { name, code });
  res.status(201).json({ id, message: 'Department created.' });
}

export function updateDepartment(req: AuthenticatedRequest, res: Response): void {
  const id = Number(req.params.id);
  if (!departmentRepo.findById(id)) throw new ApiError(404, 'Department not found.');
  const { name, code, facultyId, hodId } = req.body;
  departmentRepo.update(id, { name, code, faculty_id: facultyId, hod_id: hodId });
  audit(req, 'DEPARTMENT_UPDATED', 'department', id, null, req.body);
  res.json({ message: 'Department updated.' });
}

export function deleteDepartment(req: AuthenticatedRequest, res: Response): void {
  const id = Number(req.params.id);
  if (!departmentRepo.findById(id)) throw new ApiError(404, 'Department not found.');
  departmentRepo.delete(id);
  audit(req, 'DEPARTMENT_DELETED', 'department', id, null, null);
  res.json({ message: 'Department deleted.' });
}

// ============ FACULTIES ============

export function listFaculties(_req: AuthenticatedRequest, res: Response): void {
  res.json(facultyRepo.list());
}

export function createFaculty(req: AuthenticatedRequest, res: Response): void {
  const { name, code, description } = req.body;
  const id = facultyRepo.create({ name, code, description });
  audit(req, 'FACULTY_CREATED', 'faculty', id, null, { name });
  res.status(201).json({ id, message: 'Faculty created.' });
}

export function updateFaculty(req: AuthenticatedRequest, res: Response): void {
  const id = Number(req.params.id);
  if (!facultyRepo.findById(id)) throw new ApiError(404, 'Faculty not found.');
  facultyRepo.update(id, req.body);
  audit(req, 'FACULTY_UPDATED', 'faculty', id, null, req.body);
  res.json({ message: 'Faculty updated.' });
}

export function deleteFaculty(req: AuthenticatedRequest, res: Response): void {
  const id = Number(req.params.id);
  if (!facultyRepo.findById(id)) throw new ApiError(404, 'Faculty not found.');
  facultyRepo.delete(id);
  audit(req, 'FACULTY_DELETED', 'faculty', id, null, null);
  res.json({ message: 'Faculty deleted.' });
}

// ============ FACILITIES ============

export function listFacilities(_req: AuthenticatedRequest, res: Response): void {
  res.json(facilityRepo.list());
}

export function createFacility(req: AuthenticatedRequest, res: Response): void {
  const { name, description } = req.body;
  const id = facilityRepo.create({ name, description });
  audit(req, 'FACILITY_CREATED', 'facility', id, null, { name });
  res.status(201).json({ id, message: 'Facility created.' });
}

export function updateFacility(req: AuthenticatedRequest, res: Response): void {
  const id = Number(req.params.id);
  if (!facilityRepo.findById(id)) throw new ApiError(404, 'Facility not found.');
  facilityRepo.update(id, req.body);
  audit(req, 'FACILITY_UPDATED', 'facility', id, null, req.body);
  res.json({ message: 'Facility updated.' });
}

export function deleteFacility(req: AuthenticatedRequest, res: Response): void {
  const id = Number(req.params.id);
  if (!facilityRepo.findById(id)) throw new ApiError(404, 'Facility not found.');
  facilityRepo.delete(id);
  audit(req, 'FACILITY_DELETED', 'facility', id, null, null);
  res.json({ message: 'Facility deleted.' });
}

// ============ TIME SLOTS ============

export function listTimeSlots(_req: AuthenticatedRequest, res: Response): void {
  res.json(timeSlotRepo.list());
}

export function createTimeSlot(req: AuthenticatedRequest, res: Response): void {
  const { day, startTime, endTime, periodName } = req.body;
  const id = timeSlotRepo.create({ day, startTime, endTime, periodName });
  audit(req, 'TIMESLOT_CREATED', 'time_slot', id, null, { day, startTime, endTime });
  res.status(201).json({ id, message: 'Time slot created.' });
}

export function updateTimeSlot(req: AuthenticatedRequest, res: Response): void {
  const id = Number(req.params.id);
  if (!timeSlotRepo.findById(id)) throw new ApiError(404, 'Time slot not found.');
  timeSlotRepo.update(id, req.body);
  audit(req, 'TIMESLOT_UPDATED', 'time_slot', id, null, req.body);
  res.json({ message: 'Time slot updated.' });
}

export function deleteTimeSlot(req: AuthenticatedRequest, res: Response): void {
  const id = Number(req.params.id);
  if (!timeSlotRepo.findById(id)) throw new ApiError(404, 'Time slot not found.');
  timeSlotRepo.delete(id);
  audit(req, 'TIMESLOT_DELETED', 'time_slot', id, null, null);
  res.json({ message: 'Time slot deleted.' });
}

// ============ SEMESTERS ============

export function listSemesters(_req: AuthenticatedRequest, res: Response): void {
  res.json(semesterRepo.list());
}

export function createSemester(req: AuthenticatedRequest, res: Response): void {
  const { name, startDate, endDate, status } = req.body;
  const id = semesterRepo.create({ name, startDate, endDate, status });
  audit(req, 'SEMESTER_CREATED', 'semester', id, null, { name });
  res.status(201).json({ id, message: 'Semester created.' });
}

export function updateSemester(req: AuthenticatedRequest, res: Response): void {
  const id = Number(req.params.id);
  if (!semesterRepo.findById(id)) throw new ApiError(404, 'Semester not found.');
  semesterRepo.update(id, req.body);
  audit(req, 'SEMESTER_UPDATED', 'semester', id, null, req.body);
  res.json({ message: 'Semester updated.' });
}

export function deleteSemester(req: AuthenticatedRequest, res: Response): void {
  const id = Number(req.params.id);
  if (!semesterRepo.findById(id)) throw new ApiError(404, 'Semester not found.');
  semesterRepo.delete(id);
  audit(req, 'SEMESTER_DELETED', 'semester', id, null, null);
  res.json({ message: 'Semester deleted.' });
}

// ============ GROUPS ============

export function listGroups(_req: AuthenticatedRequest, res: Response): void {
  res.json(groupRepo.list());
}
