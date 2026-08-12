export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'HOD' | 'LECTURER' | 'VIEWER';
export type RoomType = 'Lecture Hall' | 'Laboratory' | 'Computer Lab' | 'Seminar Room' | 'Examination Hall' | 'Conference Room' | 'Studio';
export type ClassroomStatus = 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE';
export type AllocationStatus = 'PROPOSED' | 'APPROVED' | 'REJECTED';
export type SemesterStatus = 'PLANNING' | 'ACTIVE' | 'COMPLETED';
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface LoginResponse {
  token: string;
  user: { id: number; name: string; email: string; role: Role; departmentId: number | null };
}

export interface Paginated<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface Classroom {
  id: number;
  room_code: string;
  name: string | null;
  building: string;
  floor: number;
  capacity: number;
  room_type: RoomType;
  status: ClassroomStatus;
  accessibility: 'Wheelchair' | 'None' | null;
  description: string | null;
  facilities: string[];
}

export interface Course {
  id: number;
  course_code: string;
  name: string;
  department_id: number | null;
  lecturer_id: number | null;
  student_count: number;
  credit_hours: number;
  required_room_type: RoomType | null;
  semester_id: number | null;
  description: string | null;
  department_name: string | null;
  lecturer_name: string | null;
  required_facilities: string[];
}

export interface Lecturer {
  id: number;
  staff_no: string;
  name: string;
  email: string | null;
  phone: string | null;
  department_id: number | null;
  title: string | null;
  is_active: number;
  department_name: string | null;
}

export interface Department {
  id: number;
  name: string;
  code: string | null;
  faculty_id: number | null;
  hod_id: number | null;
  faculty_name: string | null;
  hod_name: string | null;
}

export interface Faculty {
  id: number;
  name: string;
  code: string | null;
  description: string | null;
}

export interface Facility {
  id: number;
  name: string;
  description: string | null;
}

export interface Semester {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  status: SemesterStatus;
}

export interface TimeSlot {
  id: number;
  day: number;
  start_time: string;
  end_time: string;
  period_name: string | null;
}

export interface StudentGroup {
  id: number;
  name: string;
  course_id: number;
  lecturer_id: number | null;
  semester_id: number | null;
  student_count: number;
  course_code: string;
  course_name: string;
  lecturer_name: string | null;
  department_name: string | null;
  has_allocation?: number;
}

export interface Allocation {
  id: number;
  group_id: number;
  course_id: number;
  classroom_id: number;
  time_slot_id: number;
  semester_id: number;
  lecturer_id: number | null;
  status: AllocationStatus;
  score: number | null;
  approved_by: number | null;
  approved_at: string | null;
  room_code: string;
  capacity: number;
  course_code: string;
  course_name: string;
  group_name: string;
  group_student_count: number;
  lecturer_name: string | null;
  slot_day: number;
  slot_start: string;
  slot_end: string;
  semester_name: string;
  department_name: string | null;
  total_score: number | null;
}

export interface Conflict {
  id: number;
  allocation_id: number;
  conflict_type: string;
  description: string;
  severity: Severity;
  resolved: number;
}

export interface ValidationResult {
  semesterId: number;
  conflicts: Conflict[];
  conflictCount: number;
  groups: number;
  allocated: number;
  unallocated: number;
}

export interface DashboardCounts {
  semester: number | null;
  counts: Record<string, number>;
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

export interface BuildingUtilizationRow {
  building: string;
  classrooms: number;
  utilization: number;
}

export interface DepartmentDemandRow {
  department: string;
  department_id: number;
  allocations: number;
  students: number;
  average_score: number | null;
}

export interface TimeDemandRow {
  day: string;
  dayIndex: number;
  startTime: string;
  endTime: string;
  label: string;
  bookings: number;
  hours: number;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  departmentName: string | null;
  isActive: number;
}

export interface NotificationItem {
  id: number;
  user_id: number | null;
  role: string | null;
  type: string;
  title: string;
  message: string | null;
  is_read: number;
}

export interface AuditLogRow {
  id: number;
  user_id: number | null;
  username: string | null;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  old_value: string | null;
  new_value: string | null;
}

export interface ReportInfo {
  name: string;
  filename: string;
  headers: string[];
  rowCount: number;
  preview: unknown[][];
}

export interface ReportPreview {
  name: string;
  filename: string;
  headers: string[];
  rowCount: number;
  rows: unknown[][];
}
