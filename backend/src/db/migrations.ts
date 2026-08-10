import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, closeDb } from './connection.ts';
import { isMain } from '../utils/isMain.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, 'schema.sql');

export function runMigrations(): void {
  const sql = readFileSync(schemaPath, 'utf8');
  db.exec(sql);
  db.exec(`
    INSERT OR IGNORE INTO roles (name, description) VALUES
      ('SUPER_ADMIN', 'Full system access'),
      ('ADMIN', 'System administrator'),
      ('HOD', 'Head of Department'),
      ('LECTURER', 'Teaching staff'),
      ('VIEWER', 'Read-only access');
  `);
}

if (isMain(import.meta.url)) {
  runMigrations();
  console.log('Database initialized (migrations applied).');
  closeDb();
}
