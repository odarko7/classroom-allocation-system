-- ============================================================
-- OPTIMAL CLASSROOM ALLOCATION SYSTEM - Database Schema (SQLite)
-- Domain model covering users, faculties, departments, lecturers,
-- classrooms, facilities, courses, students, semesters, time slots,
-- allocations, conflicts, scores, usage history, notifications,
-- audit logs and system settings.
-- ============================================================

CREATE TABLE IF NOT EXISTS roles (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL UNIQUE,
  description   TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK (role IN ('SUPER_ADMIN','ADMIN','HOD','LECTURER','VIEWER')),
  department_id INTEGER,
  lecturer_id   INTEGER,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  FOREIGN KEY (lecturer_id) REFERENCES lecturers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS faculties (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL UNIQUE,
  code          TEXT    UNIQUE,
  description   TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS departments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL UNIQUE,
  code          TEXT    UNIQUE,
  faculty_id    INTEGER,
  hod_id        INTEGER,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (faculty_id) REFERENCES faculties(id) ON DELETE SET NULL,
  FOREIGN KEY (hod_id) REFERENCES lecturers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS lecturers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_no      TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL,
  email         TEXT    UNIQUE,
  phone         TEXT,
  department_id INTEGER,
  title         TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS facilities (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL UNIQUE,
  description   TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS classrooms (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  room_code     TEXT    NOT NULL UNIQUE,
  name          TEXT,
  building      TEXT    NOT NULL,
  floor         INTEGER NOT NULL DEFAULT 0,
  capacity      INTEGER NOT NULL CHECK (capacity > 0),
  room_type     TEXT    NOT NULL CHECK (room_type IN ('Lecture Hall','Laboratory','Computer Lab','Seminar Room','Examination Hall','Conference Room','Studio')),
  status        TEXT    NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','MAINTENANCE','INACTIVE')),
  accessibility TEXT    CHECK (accessibility IN ('Wheelchair','None')),
  description   TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS classroom_facilities (
  classroom_id  INTEGER NOT NULL,
  facility_id   INTEGER NOT NULL,
  PRIMARY KEY (classroom_id, facility_id),
  FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE CASCADE,
  FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS semesters (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL UNIQUE,
  start_date    TEXT    NOT NULL,
  end_date      TEXT    NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'PLANNING' CHECK (status IN ('PLANNING','ACTIVE','COMPLETED')),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS courses (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  course_code        TEXT    NOT NULL UNIQUE,
  name               TEXT    NOT NULL,
  department_id      INTEGER,
  lecturer_id        INTEGER,
  student_count      INTEGER NOT NULL DEFAULT 0 CHECK (student_count >= 0),
  credit_hours       INTEGER NOT NULL DEFAULT 3,
  required_room_type TEXT,
  semester_id        INTEGER,
  description        TEXT,
  created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  FOREIGN KEY (lecturer_id) REFERENCES lecturers(id) ON DELETE SET NULL,
  FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS course_requirements (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id     INTEGER NOT NULL,
  facility_id   INTEGER NOT NULL,
  required      INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE,
  UNIQUE (course_id, facility_id)
);

CREATE TABLE IF NOT EXISTS students (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  reg_no        TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL,
  email         TEXT,
  department_id INTEGER,
  year_of_study INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS student_groups (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  course_id     INTEGER NOT NULL,
  lecturer_id   INTEGER,
  semester_id   INTEGER,
  student_count INTEGER NOT NULL DEFAULT 0 CHECK (student_count >= 0),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (lecturer_id) REFERENCES lecturers(id) ON DELETE SET NULL,
  FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE SET NULL,
  UNIQUE (course_id, name)
);

CREATE TABLE IF NOT EXISTS time_slots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  day         INTEGER NOT NULL CHECK (day BETWEEN 0 AND 6),
  start_time  TEXT    NOT NULL,
  end_time    TEXT    NOT NULL,
  period_name TEXT,
  CHECK (start_time < end_time),
  UNIQUE (day, start_time, end_time)
);

CREATE TABLE IF NOT EXISTS allocations (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id         INTEGER NOT NULL,
  course_id        INTEGER NOT NULL,
  classroom_id     INTEGER NOT NULL,
  time_slot_id     INTEGER NOT NULL,
  semester_id      INTEGER NOT NULL,
  lecturer_id      INTEGER,
  status           TEXT    NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED','APPROVED','REJECTED')),
  score            REAL,
  approved_by      INTEGER,
  approved_at      TEXT,
  created_by       INTEGER,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (group_id) REFERENCES student_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE CASCADE,
  FOREIGN KEY (time_slot_id) REFERENCES time_slots(id) ON DELETE RESTRICT,
  FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE CASCADE,
  FOREIGN KEY (lecturer_id) REFERENCES lecturers(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_allocations_semester ON allocations(semester_id);
CREATE INDEX IF NOT EXISTS idx_allocations_classroom_slot ON allocations(classroom_id, time_slot_id);
CREATE INDEX IF NOT EXISTS idx_allocations_group ON allocations(group_id);

CREATE TABLE IF NOT EXISTS allocation_conflicts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  allocation_id INTEGER NOT NULL,
  conflict_type TEXT    NOT NULL,
  description   TEXT    NOT NULL,
  severity      TEXT    NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW','MEDIUM','HIGH')),
  resolved      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (allocation_id) REFERENCES allocations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS allocation_scores (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  allocation_id           INTEGER NOT NULL UNIQUE,
  total_score             REAL    NOT NULL,
  capacity_score          REAL,
  facility_score          REAL,
  availability_score      REAL,
  utilization_score       REAL,
  location_score          REAL,
  department_pref_score   REAL,
  explanation             TEXT,
  rejected_alternatives   TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (allocation_id) REFERENCES allocations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS classroom_usage (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  classroom_id     INTEGER NOT NULL,
  semester_id      INTEGER NOT NULL,
  time_slot_id     INTEGER NOT NULL,
  course_id        INTEGER,
  group_id         INTEGER,
  student_count    INTEGER NOT NULL DEFAULT 0,
  used_hours       REAL    NOT NULL DEFAULT 0,
  recorded_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE CASCADE,
  FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE CASCADE,
  FOREIGN KEY (time_slot_id) REFERENCES time_slots(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL,
  FOREIGN KEY (group_id) REFERENCES student_groups(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER,
  role          TEXT,
  type          TEXT NOT NULL,
  title         TEXT NOT NULL,
  message       TEXT,
  is_read       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER,
  username      TEXT,
  action        TEXT NOT NULL,
  entity_type   TEXT,
  entity_id     INTEGER,
  old_value     TEXT,
  new_value     TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS password_resets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  token_hash    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  used_at       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);

CREATE TABLE IF NOT EXISTS system_settings (
  key           TEXT PRIMARY KEY,
  value         TEXT NOT NULL,
  description   TEXT,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Allocation scoring weights (configurable)
INSERT OR IGNORE INTO system_settings (key, value, description) VALUES
  ('allocation.weight.capacity', '25', 'Capacity suitability weight (%)'),
  ('allocation.weight.facilities', '25', 'Facility compatibility weight (%)'),
  ('allocation.weight.availability', '20', 'Availability weight (%)'),
  ('allocation.weight.utilization', '15', 'Utilization balance weight (%)'),
  ('allocation.weight.location', '10', 'Location weight (%)'),
  ('allocation.weight.department', '5', 'Department preference weight (%)');
