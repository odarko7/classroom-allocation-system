import { db } from '../db/connection.ts';

type Row = Record<string, unknown>;

export function all<T = Row>(sql: string, params: unknown[] = []): T[] {
  return db.prepare(sql).all(...(params as never[])) as T[];
}

export function get<T = Row>(sql: string, params: unknown[] = []): T | undefined {
  return db.prepare(sql).get(...(params as never[])) as T | undefined;
}

export function run(sql: string, params: unknown[] = []): { lastInsertRowid: number; changes: number } {
  const result = db.prepare(sql).run(...(params as never[]));
  return { lastInsertRowid: Number(result.lastInsertRowid), changes: Number(result.changes) };
}

export function insert(sql: string, params: unknown[] = []): number {
  return run(sql, params).lastInsertRowid;
}

export function tx<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function paginate<T>(sql: string, params: unknown[], page = 1, pageSize = 20): { rows: T[]; total: number; page: number; pageSize: number; totalPages: number } {
  const countSql = `SELECT COUNT(*) AS total FROM (${sql}) AS t`;
  const total = get<{ total: number }>(countSql, params)?.total ?? 0;
  const safePage = Math.max(1, page);
  const offset = (safePage - 1) * pageSize;
  const rows = all<T>(`${sql} LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
  return { rows, total, page: safePage, pageSize, totalPages: Math.ceil(total / pageSize) || 1 };
}
