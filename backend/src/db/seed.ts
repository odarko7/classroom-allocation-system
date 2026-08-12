import { all, get, insert, run, tx } from '../utils/db.ts';
import { db } from './connection.ts';
import { hashPassword } from '../security/password.ts';
import { AllocationEngine } from '../algorithm/engine.ts';
import { allocateStudents, generateGroups } from './seedHelpers.ts';
import {
  CLASSROOMS, COURSES, DEMO_USERS, DEPARTMENTS, FACILITIES, FACULTIES, LECTURERS, SEMESTERS, TIME_SLOTS,
} from './seedData.ts';
import { runMigrations } from './migrations.ts';
import { isMain } from '../utils/isMain.ts';

function deptIdByCode(code: string): number | null {
  return get<{ id: number }>(`SELECT id FROM departments WHERE code = ?`, [code])?.id ?? null;
}

function lecturerIdByName(name: string): number | null {
  return get<{ id: number }>(`SELECT id FROM lecturers WHERE name = ?`, [name])?.id ?? null;
}

function facilityIdByName(name: string): number | null {
  return get<{ id: number }>(`SELECT id FROM facilities WHERE name = ?`, [name])?.id ?? null;
}

export function seedDatabase(opts?: { force?: boolean }): { message: string; counts: Record<string, number> } {
  const already = get<{ c: number }>(`SELECT COUNT(*) AS c FROM classrooms`)?.c ?? 0;
  if (already > 0 && !opts?.force) {
    return { message: 'Database already seeded. Use force: true to re-seed.', counts: {} };
  }
  if (opts?.force) {
    // Clear in dependency order
    for (const t of ['allocations', 'allocation_scores', 'allocation_conflicts', 'classroom_usage', 'course_requirements', 'student_groups', 'students', 'courses', 'lecturers', 'departments', 'faculties', 'classroom_facilities', 'classrooms', 'facilities', 'time_slots', 'semesters', 'users', 'notifications', 'audit_logs']) {
      run(`DELETE FROM ${t}`);
    }
  }

  tx(() => {
    // Faculties + Departments
    for (const f of FACULTIES) insert(`INSERT INTO faculties (name, code, description) VALUES (?, ?, ?)`, [f.name, f.code, f.description]);
    for (const d of DEPARTMENTS) {
      const fid = get<{ id: number }>(`SELECT id FROM faculties WHERE code = ?`, [d.facultyCode])?.id;
      insert(`INSERT INTO departments (name, code, faculty_id) VALUES (?, ?, ?)`, [d.name, d.code, fid ?? null]);
    }

    // Lecturers
    for (const l of LECTURERS) {
      insert(`INSERT INTO lecturers (staff_no, name, title, department_id) VALUES (?, ?, ?, ?)`, [l.staffNo, l.name, l.title, deptIdByCode(l.deptCode) ?? null]);
    }

    // Set HODs (first lecturer of each department)
    for (const d of DEPARTMENTS) {
      const did = deptIdByCode(d.code);
      const hod = get<{ id: number }>(`SELECT id FROM lecturers WHERE department_id = ? ORDER BY id LIMIT 1`, [did]);
      if (did && hod) run(`UPDATE departments SET hod_id = ? WHERE id = ?`, [hod.id, did]);
    }

    // Facilities
    for (const f of FACILITIES) insert(`INSERT INTO facilities (name, description) VALUES (?, ?)`, [f.name, f.description]);

    // Classrooms + facilities
    for (const c of CLASSROOMS) {
      const cid = insert(`INSERT INTO classrooms (room_code, name, building, floor, capacity, room_type, status, accessibility) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`, [c.roomCode, `${c.roomCode}`, c.building, c.floor, c.capacity, c.roomType, c.accessibility]);
      for (const f of c.facilities) {
        const fid = facilityIdByName(f);
        if (fid) insert(`INSERT INTO classroom_facilities (classroom_id, facility_id) VALUES (?, ?)`, [cid, fid]);
      }
    }

    // Semesters
    for (const s of SEMESTERS) insert(`INSERT INTO semesters (name, start_date, end_date, status) VALUES (?, ?, ?, ?)`, [s.name, s.startDate, s.endDate, s.status]);

    // Time slots
    for (const t of TIME_SLOTS) insert(`INSERT INTO time_slots (day, start_time, end_time, period_name) VALUES (?, ?, ?, ?)`, [t.day, t.start, t.end, t.period]);

    // Courses + requirements
    for (const c of COURSES) {
      const cid = insert(`INSERT INTO courses (course_code, name, department_id, lecturer_id, student_count, credit_hours, required_room_type, semester_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [c.code, c.name, deptIdByCode(c.dept), lecturerIdByName(c.lecturer), c.students, c.credits, c.roomType ?? null, null]);
      for (const f of c.facilities) {
        const fid = facilityIdByName(f);
        if (fid) insert(`INSERT INTO course_requirements (course_id, facility_id) VALUES (?, ?)`, [cid, fid]);
      }
    }

    // Student groups (sections) - generated per course
    const groupsByCourse = generateGroups();
    for (const [courseCode, groups] of groupsByCourse.entries()) {
      const cid = get<{ id: number }>(`SELECT id FROM courses WHERE course_code = ?`, [courseCode])?.id;
      if (!cid) continue;
      for (const g of groups) {
        insert(`INSERT INTO student_groups (name, course_id, lecturer_id, student_count) VALUES (?, ?, ?, ?)`, [g.name, cid, lecturerIdByName(g.lecturer), g.studentCount]);
      }
    }

    // Students (hundreds)
    const studentNames = [
      'Aisha Bello', 'Brian Otieno', 'Carol Wanjiku', 'David Kimani', 'Esther Muthoni', 'Frank Mwangi', 'Grace Njeri',
      'Henry Omondi', 'Irene Achieng', 'James Kamau', 'Kemi Adeyemi', 'Linda Wairimu', 'Michael Kiprop', 'Nancy Chebet',
      'Oluwatobi Ade', 'Peter Mwangi', 'Queen Adongo', 'Richard Njoroge', 'Sandra Ouma', 'Thomas Mutua', 'Uche Okafor',
      'Vivian Atieno', 'William Karanja', 'Xena Nduta', 'Yusuf Salim', 'Zainab Musa', 'Alice Njoki', 'Benard Kilel',
    ];
    const deptIds = all<{ id: number }>(`SELECT id FROM departments`);
    let seq = 0;
    for (let i = 0; i < 280; i++) {
      const dept = deptIds[i % deptIds.length];
      const name = studentNames[i % studentNames.length] + ` ${i + 1}`;
      insert(`INSERT INTO students (reg_no, name, email, department_id, year_of_study) VALUES (?, ?, ?, ?, ?)`,
        [`REG/${String(2025)}/${String(i + 1).padStart(3, '0')}`, name, `student${i + 1}@student.example.com`, dept?.id ?? null, (i % 4) + 1]);
      seq++;
    }

    // Demo users
    for (const u of DEMO_USERS) {
      const did = u.department ? deptIdByCode(u.department) : null;
      insert(`INSERT INTO users (name, email, password_hash, role, department_id) VALUES (?, ?, ?, ?, ?)`, [u.name, u.email, hashPassword(u.password), u.role, did]);
    }

    // Department preferred buildings
    for (const d of DEPARTMENTS) {
      const did = deptIdByCode(d.code);
      if (did) run(`INSERT OR REPLACE INTO system_settings (key, value, description) VALUES (?, ?, ?)`, [`dept_pref_building_${did}`, d.preferredBuilding, 'Department preferred building']);
    }

    // Semester associations for groups: distribute groups between both semesters
    const semIds = all<{ id: number }>(`SELECT id FROM semesters`);
    const currentSemester = semIds.find((s) => s.id === semIds[semIds.length - 1]?.id) ?? semIds[semIds.length - 1];
    run(`UPDATE student_groups SET semester_id = ?`, [currentSemester.id]);
  });

  // Allocate students to groups (maintains realistic counts)
  allocateStudents();

  // Generate proposed allocations using the real engine, then approve a subset
  const adminUser = get<{ id: number }>(`SELECT id FROM users WHERE email = 'admin@example.com'`);
  const activeSemester = get<{ id: number }>(`SELECT id FROM semesters WHERE status = 'ACTIVE'`);
  if (activeSemester && adminUser) {
    const engine = new AllocationEngine();
    const result = engine.generateAllocations(activeSemester.id, adminUser.id);
    tx(() => {
      const proposed = all<{ id: number }>(`SELECT id FROM allocations WHERE semester_id = ? AND status = 'PROPOSED' ORDER BY id`, [activeSemester.id]);
      proposed.forEach((p, idx) => {
        if (idx % 3 !== 0) {
          run(`UPDATE allocations SET status = 'APPROVED', approved_by = ?, approved_at = datetime('now') WHERE id = ?`, [adminUser.id, p.id]);
        }
      });
    });
    // Deliberate conflicts for demonstration
    injectDemoConflicts(activeSemester.id);
    populateUsage(activeSemester.id);
    console.log(`Seed allocations: ${result.allocated} allocated, ${result.unallocated.length} unallocated, avg score ${result.metrics.averageScore}`);
  }

  return {
    message: 'Database seeded successfully.',
    counts: {
      classrooms: get<{ c: number }>(`SELECT COUNT(*) AS c FROM classrooms`)?.c ?? 0,
      departments: get<{ c: number }>(`SELECT COUNT(*) AS c FROM departments`)?.c ?? 0,
      faculties: get<{ c: number }>(`SELECT COUNT(*) AS c FROM faculties`)?.c ?? 0,
      courses: get<{ c: number }>(`SELECT COUNT(*) AS c FROM courses`)?.c ?? 0,
      lecturers: get<{ c: number }>(`SELECT COUNT(*) AS c FROM lecturers`)?.c ?? 0,
      students: get<{ c: number }>(`SELECT COUNT(*) AS c FROM students`)?.c ?? 0,
      groups: get<{ c: number }>(`SELECT COUNT(*) AS c FROM student_groups`)?.c ?? 0,
      timeSlots: get<{ c: number }>(`SELECT COUNT(*) AS c FROM time_slots`)?.c ?? 0,
      allocations: get<{ c: number }>(`SELECT COUNT(*) AS c FROM allocations`)?.c ?? 0,
      users: get<{ c: number }>(`SELECT COUNT(*) AS c FROM users`)?.c ?? 0,
    },
  };
}

/** Inject a few realistic conflicts to demonstrate conflict detection. */
function injectDemoConflicts(semesterId: number): void {
  const approved = all<{ id: number; group_id: number; course_id: number; classroom_id: number; time_slot_id: number; lecturer_id: number | null }>(
    `SELECT id, group_id, course_id, classroom_id, time_slot_id, lecturer_id FROM allocations WHERE semester_id = ? AND status = 'APPROVED'`, [semesterId]);
  if (approved.length < 2) return;

  // Conflict 1: double-book a room at a slot where that (room, slot) pair is used
  // by exactly one approved allocation. The chosen group must fit the room, and
  // must not already be booked (group or lecturer) at that slot, so exactly one
  // CLASSROOM_CONFLICT is produced.
  const pairCount = new Map<string, number>();
  for (const a of approved) {
    const key = `${a.classroom_id}:${a.time_slot_id}`;
    pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
  }
  let baseSlot: number | null = null;
  for (const candidate of approved) {
    if (pairCount.get(`${candidate.classroom_id}:${candidate.time_slot_id}`) !== 1) continue;
    const roomCap = get<{ capacity: number }>(`SELECT capacity FROM classrooms WHERE id = ?`, [candidate.classroom_id])?.capacity ?? 0;
    const grp = get<{ id: number; course_id: number; lecturer_id: number | null }>(`
      SELECT g.id, g.course_id, g.lecturer_id
      FROM student_groups g
      WHERE g.semester_id = ? AND g.id != ? AND g.student_count <= ?
        AND NOT EXISTS (SELECT 1 FROM allocations a WHERE a.group_id = g.id AND a.time_slot_id = ? AND a.status != 'REJECTED')
        AND NOT EXISTS (
          SELECT 1 FROM allocations a JOIN student_groups g2 ON g2.id = a.group_id
          WHERE g2.lecturer_id = g.lecturer_id AND a.time_slot_id = ? AND a.status != 'REJECTED')
      ORDER BY g.id LIMIT 1`, [semesterId, candidate.group_id, roomCap, candidate.time_slot_id, candidate.time_slot_id]);
    if (!grp) continue;
    const allocId = insert(`INSERT INTO allocations (group_id, course_id, classroom_id, time_slot_id, semester_id, lecturer_id, status, score)
      VALUES (?, ?, ?, ?, ?, ?, 'APPROVED', 55)`, [grp.id, grp.course_id, candidate.classroom_id, candidate.time_slot_id, semesterId, grp.lecturer_id]);
    insert(`INSERT INTO allocation_conflicts (allocation_id, conflict_type, description, severity) VALUES (?, 'CLASSROOM_CONFLICT', 'Room double-booked at same time slot', 'HIGH')`, [allocId]);
    baseSlot = candidate.time_slot_id;
    break;
  }

  // Conflict 2: double-book a lecturer on a room that is free at that slot, so
  // exactly one LECTURER_CONFLICT is produced (no room or group conflict).
  const lectSlots = all<{ lecturer_id: number; time_slot_id: number }>(
    `SELECT DISTINCT lecturer_id, time_slot_id FROM allocations WHERE semester_id = ? AND status = 'APPROVED' AND lecturer_id IS NOT NULL`, [semesterId]);
  for (const lb of lectSlots) {
    if (baseSlot !== null && lb.time_slot_id === baseSlot) continue;
    const freeRoom = get<{ id: number; capacity: number }>(`
      SELECT c.id, c.capacity FROM classrooms c
      WHERE c.status = 'ACTIVE'
        AND NOT EXISTS (SELECT 1 FROM allocations a WHERE a.classroom_id = c.id AND a.time_slot_id = ? AND a.semester_id = ? AND a.status != 'REJECTED')
      ORDER BY c.id LIMIT 1`, [lb.time_slot_id, semesterId]);
    if (!freeRoom) continue;
    const grp2 = get<{ id: number; course_id: number }>(`
      SELECT g.id, g.course_id
      FROM student_groups g
      WHERE g.semester_id = ? AND g.lecturer_id = ? AND g.student_count <= ?
        AND NOT EXISTS (SELECT 1 FROM allocations a WHERE a.group_id = g.id AND a.time_slot_id = ? AND a.status != 'REJECTED')
      ORDER BY g.id LIMIT 1`, [semesterId, lb.lecturer_id, freeRoom.capacity, lb.time_slot_id]);
    if (grp2) {
      const allocId = insert(`INSERT INTO allocations (group_id, course_id, classroom_id, time_slot_id, semester_id, lecturer_id, status, score)
        VALUES (?, ?, ?, ?, ?, ?, 'APPROVED', 50)`, [grp2.id, grp2.course_id, freeRoom.id, lb.time_slot_id, semesterId, lb.lecturer_id]);
      insert(`INSERT INTO allocation_conflicts (allocation_id, conflict_type, description, severity) VALUES (?, 'LECTURER_CONFLICT', 'Lecturer assigned to two classes at the same time', 'HIGH')`, [allocId]);
      break;
    }
  }
}

/** Populate classroom_usage history from approved allocations. */
function populateUsage(semesterId: number): void {
  run(`DELETE FROM classroom_usage WHERE semester_id = ?`, [semesterId]);
  const rows = all<{ classroom_id: number; time_slot_id: number; course_id: number; group_id: number; student_count: number }>(`
    SELECT a.classroom_id, a.time_slot_id, a.course_id, a.group_id, g.student_count
    FROM allocations a JOIN student_groups g ON g.id = a.group_id
    WHERE a.semester_id = ? AND a.status = 'APPROVED'`, [semesterId]);
  for (const r of rows) {
    insert(`INSERT INTO classroom_usage (classroom_id, semester_id, time_slot_id, course_id, group_id, student_count, used_hours)
      VALUES (?, ?, ?, ?, ?, ?, 1.5)`, [r.classroom_id, semesterId, r.time_slot_id, r.course_id, r.group_id, r.student_count]);
  }
  const admin = get<{ id: number }>(`SELECT id FROM users WHERE email = 'admin@example.com'`);
  if (admin) {
    insert(`INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'ALLOCATION_APPROVED', 'Seed allocations approved', 'The demonstration allocations have been generated and approved.')`, [admin.id]);
  }
}

if (isMain(import.meta.url)) {
  runMigrations();
  const result = seedDatabase();
  console.log(result.message, result.counts);
  db.close();
}
