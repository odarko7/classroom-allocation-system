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
  assert.ok(res.json.counts.classrooms >= 30);
  assert.ok(res.json.counts.courses >= 50);
  assert.ok(res.json.counts.lecturers >= 30);
});

test('classrooms list supports pagination and filters', async () => {
  const all = await call('GET', '/classrooms?page=1&pageSize=5');
  assert.equal(all.json.rows.length, 5);
  const labs = await call('GET', '/classrooms?roomType=Computer%20Lab&pageSize=100');
  assert.ok(labs.json.total >= 5);
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
  assert.ok(res.json.totalClassrooms >= 30);
  assert.ok(typeof res.json.utilizationRate === 'number');
});

test('utilization analytics returns per-room data', async () => {
  const res = await call('GET', '/analytics/utilization');
  assert.ok(Array.isArray(res.json.usage));
  assert.ok(res.json.usage.length >= 10);
});

test('building utilization aggregates', async () => {
  const res = await call('GET', '/analytics/buildings');
  assert.ok(res.json.buildings.length >= 2);
});

test('pattern recognition returns patterns', async () => {
  const res = await call('GET', '/analytics/patterns');
  assert.ok(res.json.patterns.length >= 3);
});

test('allocations can be listed and optimized', async () => {
  const active = await call('GET', '/semesters');
  const semesterId = active.json[0].id;
  const res = await call('POST', '/allocations/optimize', { semesterId });
  assert.ok(res.json.after);
  assert.ok(typeof res.json.after.averageScore === 'number');
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

test('audit logs are recorded', async () => {
  const res = await call('GET', '/audit-logs');
  assert.ok(res.json.total > 0);
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
