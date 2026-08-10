import { env } from './config/env.ts';
import { runMigrations } from './db/migrations.ts';
import { seedDatabase } from './db/seed.ts';
import { createApp } from './app.ts';
import { db } from './db/connection.ts';

runMigrations();

if (env.seedDemoData) {
  const result = seedDatabase();
  if (result.message === 'Database seeded successfully.') {
    console.log('[seed]', result.message);
  } else if (result.counts && Object.keys(result.counts).length) {
    console.log('[seed] already seeded');
  }
}

const app = createApp();
app.listen(env.port, () => {
  console.log(`[api] Classroom Allocation API listening on http://localhost:${env.port}`);
  console.log(`[api] Health check: http://localhost:${env.port}/api/health`);
});

process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});
