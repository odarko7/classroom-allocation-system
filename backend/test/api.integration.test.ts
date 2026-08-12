import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'oca-test-')), 'test.db');
process.env.JWT_SECRET = 'test-secret';
process.env.SEED_DEMO_DATA = 'true';

const { db } = await import('../src/db/connection.ts');
const { runMigrations } = await import('../src/db/migrations.ts');
const { seedDatabase } = await import('../src/db/seed.ts');
const { createApp } = await import('../src/app.ts');

let server: any;
let base = '';
let token = '';
let adminToken = '';

before(async () => {
  runMigrations();
  seedDatabase();
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address() as { port: number };
      base = `http://127.0.0.1:${addr.port}/api`;
      resolve();
    });
  });
});

after(() => {
  try { server.close(); } catch {}
  try { db.close(); } catch {}
  try {
    const dir = path.dirname(String(process.env.DB_PATH));
    rmSync(dir, { recursive: true, force: true });
  } catch {}
});

async function call(method: string, p: string, body?: unknown, expected?: number, useToken = true) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (useToken && token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json: unknown = null;
  try { json = await res.json(); } catch {}
  if (expected) {
    assert.equal(res.status, expected, `${method} ${p} expected ${expected}, got ${res.status}: ${JSON.stringify(json)}`);
  }
  return { status: res.status, json: json as Record<string, any> };
}

test('health endpoint works', async () => {
  const res = await fetch(base + '/health');
  assert.equal(res.status, 200);
});

test('login rejects wrong password', async () => {
  const res = await call('POST', '/auth/login', { email: 'admin@example.com', password: 'wrong' }, 401);
  assert.ok(res.json.error);
});

test('login succeeds with correct credentials', async () => {
  const res = await call('POST', '/auth/login', { email: 'admin@example.com', password: 'Admin@123' });
  assert.ok(res.json.token);
  token = res.json.token;
});

test('protected routes reject missing token', async () => {
  const res = await fetch(base + '/classrooms');
  assert.equal(res.status, 401);
});

test('me returns current user', async () => {
  const res = await call('GET', '/auth/me');
  assert.equal(res.json.email, 'admin@example.com');
});

test('dashboard returns real counts', async () => {
  const res = await call('GET', '/dashboard');
  assert.ok(res.json.counts.classrooms >= 5);
  assert.ok(res.json.counts.courses >= 5);
  assert.ok(res.json.counts.lecturers >= 5);
});

test('classrooms list supports pagination and filters', async () => {
  const all = await call('GET', '/classrooms?page=1&pageSize=5');
  assert.equal(all.json.rows.length, 5);
  const halls = await call('GET', '/classrooms?roomType=Lecture%20Hall&pageSize=100');
  assert.ok(halls.json.total >= 5);
});

test('admin can create and delete a classroom', async () => {
  const created = await call('POST', '/classrooms', { roomCode: 'TEST-001', building: 'Z', floor: 1, capacity: 60, roomType: 'Seminar Room', facilities: ['Projector'] }, 201);
  const id = created.json.id;
  await call('DELETE', `/classrooms/${id}`, undefined, 200);
});

test('non-admin role cannot create a classroom (403)', async () => {
  await call('POST', '/users', { name: 'Test Lecturer', email: 'testlecturer@example.com', password: 'Test12345', role: 'LECTURER' }, 201);
  const login = await call('POST', '/auth/login', { email: 'testlecturer@example.com', password: 'Test12345' });
  const lectToken = login.json.token;
  const res = await fetch(base + '/classrooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lectToken}` },
    body: JSON.stringify({ roomCode: 'X1', building: 'A', capacity: 20, roomType: 'Seminar Room' }),
  });
  assert.equal(res.status, 403);
});

test('courses CRUD works', async () => {
  const created = await call('POST', '/courses', { courseCode: 'TEST101', name: 'Test Course', studentCount: 30, requiredFacilities: ['Projector'] }, 201);
  await call('GET', `/courses/${created.json.id}`);
  await call('DELETE', `/courses/${created.json.id}`, undefined, 200);
});

test('analytics summary is data-driven', async () => {
  const res = await call('GET', '/analytics/summary');
  assert.ok(res.json.totalClassrooms >= 5);
  assert.ok(typeof res.json.utilizationRate === 'number');
});

test('utilization analytics returns per-room data', async () => {
  const res = await call('GET', '/analytics/utilization');
  assert.ok(Array.isArray(res.json.usage));
  assert.ok(res.json.usage.length >= 3);
});

test('building utilization aggregates', async () => {
  const res = await call('GET', '/analytics/buildings');
  assert.ok(res.json.buildings.length >= 2);
});

test('pattern recognition returns patterns', async () => {
  const res = await call('GET', '/analytics/patterns');
  assert.ok(res.json.patterns.length >= 3);
});

test('timetable returns approved Mon-Fri schedule', async () => {
  const res = await call('GET', '/timetable');
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.ok(res.json.semester && res.json.semester.id, 'semester missing');
  assert.ok(Array.isArray(res.json.allocations), 'allocations missing');
  assert.ok(Array.isArray(res.json.timeSlots), 'timeSlots missing');
  assert.ok(res.json.timeSlots.length >= 5, 'expected time slots for the week');
  for (const a of res.json.allocations) {
    assert.equal(a.status, 'APPROVED', 'timetable must only include approved allocations');
    assert.ok(a.slot_day >= 0 && a.slot_day <= 4, 'timetable must only include Monday-Friday');
  }
  const semesterId = res.json.semester.id;
  const semesterTimeTable = await call('GET', `/timetable?semester=${semesterId}`);
  assert.equal(semesterTimeTable.status, 200);
});

test('allocations can be listed and optimized', async () => {
  const active = await call('GET', '/semesters');
  const semesterId = active.json[0].id;
  const res = await call('POST', '/allocations/optimize', { semesterId });
  assert.ok(res.json.after);
  assert.ok(typeof res.json.after.averageScore === 'number');
});

test('recommend returns a suitable classroom ordered by smallest capacity', async () => {
  const sem = await call('GET', '/semesters');
  const semesterId = sem.json[0].id;
  const lecturers = await call('GET', '/lecturers?pageSize=100');
  const lecturerId = lecturers.json.rows[0].id;

  const created = await call('POST', '/courses', {
    courseCode: 'REC101',
    name: 'Recommendation Test',
    studentCount: 60,
    lecturerId,
    requiredRoomType: 'Lecture Hall',
    semesterId,
  }, 201);
  const courseId = created.json.id;

  const res = await call('POST', '/allocations/recommend', { courseId, studentCount: 60, lecturerId, semesterId });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.ok(res.json.success, `expected a recommendation, got: ${JSON.stringify(res.json)}`);
  assert.ok(res.json.best, 'best recommendation missing');
  assert.ok(res.json.best.capacity >= 60, 'recommended room must fit the students');
  assert.ok(res.json.best.timeSlotId, 'recommendation must include a time slot');
  const capacities = res.json.suitable.map((r: any) => r.capacity);
  assert.deepEqual(capacities, [...capacities].sort((a, b) => a - b), 'suitable rooms must be sorted smallest-first');
});

test('recommend explains when no classroom has enough capacity', async () => {
  const sem = await call('GET', '/semesters');
  const semesterId = sem.json[0].id;
  const course = await call('GET', '/courses?pageSize=1');
  const c = course.json.rows[0];
  assert.ok(c, 'seed course missing');
  const res = await call('POST', '/allocations/recommend', { courseId: c.id, studentCount: 99999, lecturerId: c.lecturer_id, semesterId });
  assert.equal(res.status, 200);
  assert.equal(res.json.success, false);
  assert.ok(res.json.reasons.some((r: string) => r.includes('capacity')), `expected capacity reason, got ${JSON.stringify(res.json.reasons)}`);
});

test('recommend requires a lecturer and student count', async () => {
  const sem = await call('GET', '/semesters');
  const semesterId = sem.json[0].id;
  const course = await call('GET', '/courses?pageSize=1');
  const c = course.json.rows[0];
  const noLecturer = await call('POST', '/allocations/recommend', { courseId: c.id, studentCount: 10, semesterId }, 422);
  assert.ok(noLecturer.json.error);
  const noStudents = await call('POST', '/allocations/recommend', { courseId: c.id, lecturerId: c.lecturer_id, semesterId }, 422);
  assert.ok(noStudents.json.error);
});

test('confirm saves a recommendation as a PROPOSED allocation', async () => {
  const sem = await call('GET', '/semesters');
  const semesterId = sem.json[0].id;
  const lecturers = await call('GET', '/lecturers?pageSize=100');
  const lecturerId = lecturers.json.rows[0].id;

  const created = await call('POST', '/courses', {
    courseCode: 'REC102',
    name: 'Recommendation Confirm Test',
    studentCount: 45,
    lecturerId,
    requiredRoomType: 'Lecture Hall',
    semesterId,
  }, 201);
  const courseId = created.json.id;

  const rec = await call('POST', '/allocations/recommend', { courseId, studentCount: 45, lecturerId, semesterId });
  assert.ok(rec.json.success, JSON.stringify(rec.json));
  const best = rec.json.best;

  const confirmed = await call('POST', '/allocations/recommend/confirm', {
    courseId,
    studentCount: 45,
    lecturerId,
    semesterId,
    classroomId: best.classroomId,
    timeSlotId: best.timeSlotId,
  }, 201);
  assert.ok(confirmed.json.id, 'created allocation id missing');
  assert.equal(confirmed.json.allocation.status, 'PROPOSED');
  assert.equal(confirmed.json.allocation.room_code, best.roomCode);

  const listed = await call('GET', '/allocations?course=REC102');
  assert.ok(listed.json.rows.some((a: any) => a.id === confirmed.json.id), 'saved allocation should appear in the list');
});

test('confirm rejects an over-capacity classroom', async () => {
  const sem = await call('GET', '/semesters');
  const semesterId = sem.json[0].id;
  const lecturers = await call('GET', '/lecturers?pageSize=100');
  const lecturerId = lecturers.json.rows[0].id;

  const created = await call('POST', '/courses', {
    courseCode: 'REC103',
    name: 'Recommendation Capacity Test',
    studentCount: 200,
    lecturerId,
    requiredRoomType: 'Lecture Hall',
    semesterId,
  }, 201);

  const smallRoom = await call('GET', '/classrooms?capacity=40&pageSize=1');
  const room = smallRoom.json.rows[0];

  const confirmed = await call('POST', '/allocations/recommend/confirm', {
    courseId: created.json.id,
    studentCount: 200,
    lecturerId,
    semesterId,
    classroomId: room.id,
    timeSlotId: sem.json[0].id,
  }, 409);
  assert.ok(confirmed.json.error);
});

test('conflict detection reports conflicts', async () => {
  const res = await call('GET', '/conflicts');
  assert.ok(Array.isArray(res.json));
  assert.ok(res.json.length >= 2);
});

test('report preview returns CSV structure', async () => {
  const res = await call('GET', '/reports/classroom-utilization/preview');
  assert.ok(res.json.headers.includes('Room'));
  assert.ok(res.json.rowCount > 0);
});

test('notifications are recorded', async () => {
  const res = await call('GET', '/notifications');
  assert.ok(res.json.rows.length > 0);
});

test('evaluation runs and reports metrics', async () => {
  const res = await call('GET', '/evaluation');
  assert.ok(res.json.metrics.length >= 6);
  assert.ok(res.json.simulatedData === true);
});

test('viewer can read but not write', async () => {
  await call('POST', '/users', { name: 'Test Viewer', email: 'testviewer@example.com', password: 'Test12345', role: 'VIEWER' }, 201);
  const login = await call('POST', '/auth/login', { email: 'testviewer@example.com', password: 'Test12345' });
  const vt = login.json.token;
  const read = await fetch(base + '/classrooms?pageSize=1', { headers: { Authorization: `Bearer ${vt}` } });
  assert.equal(read.status, 200);
  const write = await fetch(base + '/classrooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vt}` },
    body: JSON.stringify({ roomCode: 'X2', building: 'A', capacity: 20, roomType: 'Seminar Room' }),
  });
  assert.equal(write.status, 403);
});

test('logout works', async () => {
  const res = await call('POST', '/auth/logout');
  assert.equal(res.status, 200);
});

test('forgot password returns generic message for unknown email', async () => {
  const res = await call('POST', '/auth/forgot-password', { email: 'nobody@example.com' });
  assert.equal(res.status, 200);
  assert.ok(res.json.message);
  assert.equal(res.json.token, undefined);
});

test('forgot password generates token when email is not configured', async () => {
  const res = await call('POST', '/auth/forgot-password', { email: 'admin@example.com' });
  assert.equal(res.status, 200);
  assert.ok(res.json.token, 'expected a plain reset token (no SMTP in tests)');
  assert.equal(res.json.email, 'admin@example.com');
});

test('reset password with valid token updates password', async () => {
  const req = await call('POST', '/auth/forgot-password', { email: 'admin@example.com' });
  const reset = await call('POST', '/auth/reset-password', {
    email: 'admin@example.com',
    token: req.json.token,
    password: 'NewPass123',
  });
  assert.equal(reset.status, 200);
  assert.ok(reset.json.message);

  const oldLogin = await call('POST', '/auth/login', { email: 'admin@example.com', password: 'Admin@123' }, 401);
  assert.equal(oldLogin.status, 401);
  const newLogin = await call('POST', '/auth/login', { email: 'admin@example.com', password: 'NewPass123' });
  assert.ok(newLogin.json.token);

  token = newLogin.json.token;
});

test('reset password rejects an invalid token', async () => {
  const res = await call('POST', '/auth/reset-password', {
    email: 'admin@example.com',
    token: 'totally-wrong-token',
    password: 'Whatever123',
  });
  assert.equal(res.status, 400);
  assert.ok(res.json.error);
});

test('reset token is single use', async () => {
  const req = await call('POST', '/auth/forgot-password', { email: 'admin@example.com' });
  const first = await call('POST', '/auth/reset-password', { email: 'admin@example.com', token: req.json.token, password: 'Another123' });
  assert.equal(first.status, 200);
  const second = await call('POST', '/auth/reset-password', { email: 'admin@example.com', token: req.json.token, password: 'Third123' });
  assert.equal(second.status, 400);
});

test('admin can generate a reset token for a user', async () => {
  const created = await call('POST', '/users', { name: 'Reset User', email: 'resetuser@example.com', password: 'OldPass123', role: 'VIEWER' }, 201);
  const res = await call('POST', `/users/${created.json.id}/reset-token`);
  assert.equal(res.status, 201);
  assert.ok(res.json.token);
  assert.equal(res.json.email, 'resetuser@example.com');

  const reset = await call('POST', '/auth/reset-password', { email: 'resetuser@example.com', token: res.json.token, password: 'FreshPass123' });
  assert.equal(reset.status, 200);
});
