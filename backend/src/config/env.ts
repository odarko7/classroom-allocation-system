import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  apiUrl: process.env.API_URL ?? 'http://localhost:4000/api',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-insecure-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  dbPath: process.env.DB_PATH
    ? path.resolve(__dirname, '../../..', process.env.DB_PATH)
    : path.resolve(__dirname, '../../data/classroom_alloc.db'),
  seedDemoData: (process.env.SEED_DEMO_DATA ?? 'true') === 'true',
} as const;
