import { Router } from 'express';
import { classroomRepo } from '../repositories/classroomRepo.ts';
import { loginHandler, registerHandler, meHandler, logoutHandler, listUsersHandler, createUserHandler } from '../controllers/authController.ts';
import {
  listClassrooms, getClassroom, createClassroom, updateClassroom, deleteClassroom,
  listCourses, getCourse, createCourse, updateCourse, deleteCourse,
  listLecturers, getLecturer, createLecturer, updateLecturer, deleteLecturer,
  listDepartments, getDepartment, createDepartment, updateDepartment, deleteDepartment,
  listFaculties, createFaculty, updateFaculty, deleteFaculty,
  listFacilities, createFacility, updateFacility, deleteFacility,
  listTimeSlots, createTimeSlot, updateTimeSlot, deleteTimeSlot,
  listSemesters, createSemester, updateSemester, deleteSemester,
  listGroups,
} from '../controllers/managementController.ts';
import {
  listAllocations, getAllocation, runOptimization, proposeAllocation, approveAllocation,
  rejectAllocation, deleteAllocation, listConflicts, validateSemester, listStudentGroups, createGroup,
  createAllocation,
} from '../controllers/allocationController.ts';
import {
  summaryHandler, utilizationHandler, buildingsHandler, departmentsHandler, timeDemandHandler,
  capacityHandler, conflictRateHandler, patternsHandler, evaluationHandler, roomAnalyticsHandler,
} from '../controllers/analyticsController.ts';
import {
  reportHandler, reportPreviewHandler, listReportNames, miscSummary,
  notificationsHandler, markNotificationsRead, auditLogsHandler,
} from '../controllers/reportController.ts';
import { authenticate, authorize } from '../middleware/auth.ts';
import { validateBody } from '../middleware/errorHandler.ts';
import { z } from 'zod';

const router = Router();

// ---- Public auth ----
router.post('/auth/login', validateBody(z.object({ email: z.string().email(), password: z.string().min(1) })), loginHandler);
router.post('/auth/register', validateBody(z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(6) })), registerHandler);

// ---- Everything else requires authentication ----
router.use(authenticate);

router.get('/auth/me', meHandler);
router.post('/auth/logout', logoutHandler);

// ---- Users (admin only) ----
router.get('/users', authorize('SUPER_ADMIN', 'ADMIN'), listUsersHandler);
router.post('/users', authorize('SUPER_ADMIN'), validateBody(z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(6), role: z.enum(['SUPER_ADMIN', 'ADMIN', 'HOD', 'LECTURER', 'VIEWER']), departmentId: z.number().nullable().optional() })), createUserHandler);

// ---- Classrooms ----
router.get('/classrooms', listClassrooms);
router.get('/classrooms/options', (req, res) => {
  const rows = classroomRepo.list().map((c) => ({ id: c.id, roomCode: c.room_code, building: c.building, capacity: c.capacity, roomType: c.room_type }));
  res.json(rows);
});
router.get('/classrooms/:id', getClassroom);
router.post('/classrooms', authorize('SUPER_ADMIN', 'ADMIN'), createClassroom);
router.put('/classrooms/:id', authorize('SUPER_ADMIN', 'ADMIN'), updateClassroom);
router.delete('/classrooms/:id', authorize('SUPER_ADMIN', 'ADMIN'), deleteClassroom);

// ---- Courses ----
router.get('/courses', listCourses);
router.get('/courses/:id', getCourse);
router.post('/courses', authorize('SUPER_ADMIN', 'ADMIN', 'HOD'), createCourse);
router.put('/courses/:id', authorize('SUPER_ADMIN', 'ADMIN', 'HOD'), updateCourse);
router.delete('/courses/:id', authorize('SUPER_ADMIN', 'ADMIN'), deleteCourse);

// ---- Lecturers ----
router.get('/lecturers', listLecturers);
router.get('/lecturers/:id', getLecturer);
router.post('/lecturers', authorize('SUPER_ADMIN', 'ADMIN'), createLecturer);
router.put('/lecturers/:id', authorize('SUPER_ADMIN', 'ADMIN'), updateLecturer);
router.delete('/lecturers/:id', authorize('SUPER_ADMIN', 'ADMIN'), deleteLecturer);

// ---- Departments / Faculties / Facilities ----
router.get('/departments', listDepartments);
router.get('/departments/:id', getDepartment);
router.post('/departments', authorize('SUPER_ADMIN', 'ADMIN'), createDepartment);
router.put('/departments/:id', authorize('SUPER_ADMIN', 'ADMIN'), updateDepartment);
router.delete('/departments/:id', authorize('SUPER_ADMIN', 'ADMIN'), deleteDepartment);

router.get('/faculties', listFaculties);
router.post('/faculties', authorize('SUPER_ADMIN', 'ADMIN'), createFaculty);
router.put('/faculties/:id', authorize('SUPER_ADMIN', 'ADMIN'), updateFaculty);
router.delete('/faculties/:id', authorize('SUPER_ADMIN', 'ADMIN'), deleteFaculty);

router.get('/facilities', listFacilities);
router.post('/facilities', authorize('SUPER_ADMIN', 'ADMIN'), createFacility);
router.put('/facilities/:id', authorize('SUPER_ADMIN', 'ADMIN'), updateFacility);
router.delete('/facilities/:id', authorize('SUPER_ADMIN', 'ADMIN'), deleteFacility);

// ---- Time slots / Semesters ----
router.get('/timeslots', listTimeSlots);
router.post('/timeslots', authorize('SUPER_ADMIN', 'ADMIN'), createTimeSlot);
router.put('/timeslots/:id', authorize('SUPER_ADMIN', 'ADMIN'), updateTimeSlot);
router.delete('/timeslots/:id', authorize('SUPER_ADMIN', 'ADMIN'), deleteTimeSlot);

router.get('/semesters', listSemesters);
router.post('/semesters', authorize('SUPER_ADMIN', 'ADMIN'), createSemester);
router.put('/semesters/:id', authorize('SUPER_ADMIN', 'ADMIN'), updateSemester);
router.delete('/semesters/:id', authorize('SUPER_ADMIN', 'ADMIN'), deleteSemester);

// ---- Student groups ----
router.get('/groups', listGroups);
router.get('/student-groups', listStudentGroups);
router.post('/student-groups', authorize('SUPER_ADMIN', 'ADMIN', 'HOD'), createGroup);

// ---- Allocations & engine ----
router.get('/allocations', listAllocations);
router.get('/allocations/:id', getAllocation);
router.post('/allocations', authorize('SUPER_ADMIN', 'ADMIN', 'HOD'), createAllocation);
router.post('/allocations/optimize', authorize('SUPER_ADMIN', 'ADMIN', 'HOD'), runOptimization);
router.post('/allocations/propose', authorize('SUPER_ADMIN', 'ADMIN', 'HOD'), proposeAllocation);
router.post('/allocations/:id/approve', authorize('SUPER_ADMIN', 'ADMIN', 'HOD'), approveAllocation);
router.post('/allocations/:id/reject', authorize('SUPER_ADMIN', 'ADMIN', 'HOD'), rejectAllocation);
router.delete('/allocations/:id', authorize('SUPER_ADMIN', 'ADMIN'), deleteAllocation);
router.get('/conflicts', listConflicts);
router.get('/validation', validateSemester);

// ---- Analytics ----
router.get('/analytics/summary', summaryHandler);
router.get('/analytics/utilization', utilizationHandler);
router.get('/analytics/buildings', buildingsHandler);
router.get('/analytics/departments', departmentsHandler);
router.get('/analytics/time-demand', timeDemandHandler);
router.get('/analytics/capacity', capacityHandler);
router.get('/analytics/conflict-rate', conflictRateHandler);
router.get('/analytics/patterns', patternsHandler);
router.get('/analytics/classrooms/:id', roomAnalyticsHandler);
router.get('/evaluation', evaluationHandler);

// ---- Reports ----
router.get('/reports', listReportNames);
router.get('/reports/:name/preview', reportPreviewHandler);
router.get('/reports/:name', reportHandler);

// ---- Misc ----
router.get('/dashboard', miscSummary);
router.get('/notifications', notificationsHandler);
router.post('/notifications/read', markNotificationsRead);
router.get('/audit-logs', auditLogsHandler);

export default router;
