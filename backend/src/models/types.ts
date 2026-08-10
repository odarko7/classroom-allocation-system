export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'HOD' | 'LECTURER' | 'VIEWER';
export type RoomType = 'Lecture Hall' | 'Laboratory' | 'Computer Lab' | 'Seminar Room' | 'Examination Hall' | 'Conference Room' | 'Studio';
export type ClassroomStatus = 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE';
export type AllocationStatus = 'PROPOSED' | 'APPROVED' | 'REJECTED';
export type SemesterStatus = 'PLANNING' | 'ACTIVE' | 'COMPLETED';
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface RoleRow { id: number; name: Role; description: string | null; }
export interface UserRow {
  id: number; name: string; email: string; password_hash: string;
  role: Role; department_id: number | null; lecturer_id: number | null;
  is_active: number; created_at: string; updated_at: string;
}
export interface FacultyRow { id: number; name: string; code: string | null; description: string | null; }
export interface DepartmentRow { id: number; name: string; code: string | null; faculty_id: number | null; hod_id: number | null; }
export interface LecturerRow {
  id: number; staff_no: string; name: string; email: string | null; phone: string | null;
  department_id: number | null; title: string | null; is_active: number;
}
export interface FacilityRow { id: number; name: string; description: string | null; }
export interface ClassroomRow {
  id: number; room_code: string; name: string | null; building: string; floor: number;
  capacity: number; room_type: RoomType; status: ClassroomStatus;
  accessibility: 'Wheelchair' | 'None' | null; description: string | null;
}
export interface SemesterRow { id: number; name: string; start_date: string; end_date: string; status: SemesterStatus; }
export interface CourseRow {
  id: number; course_code: string; name: string; department_id: number | null; lecturer_id: number | null;
  student_count: number; credit_hours: number; required_room_type: RoomType | null; semester_id: number | null; description: string | null;
}
export interface StudentRow { id: number; reg_no: string; name: string; email: string | null; department_id: number | null; year_of_study: number; }
export interface StudentGroupRow {
  id: number; name: string; course_id: number; lecturer_id: number | null; semester_id: number | null; student_count: number;
}
export interface TimeSlotRow { id: number; day: number; start_time: string; end_time: string; period_name: string | null; }
export interface AllocationRow {
  id: number; group_id: number; course_id: number; classroom_id: number; time_slot_id: number;
  semester_id: number; lecturer_id: number | null; status: AllocationStatus; score: number | null;
  approved_by: number | null; approved_at: string | null; created_by: number | null;
  created_at: string; updated_at: string;
}
export interface AllocationScoreRow {
  id: number; allocation_id: number; total_score: number; capacity_score: number | null;
  facility_score: number | null; availability_score: number | null; utilization_score: number | null;
  location_score: number | null; department_pref_score: number | null;
  explanation: string | null; rejected_alternatives: string | null;
}
export interface ConflictRow { id: number; allocation_id: number; conflict_type: string; description: string; severity: Severity; resolved: number; }
export interface NotificationRow { id: number; user_id: number | null; role: string | null; type: string; title: string; message: string | null; is_read: number; }
export interface AuditLogRow { id: number; user_id: number | null; username: string | null; action: string; entity_type: string | null; entity_id: number | null; old_value: string | null; new_value: string | null; }
