import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '../src/db/migrations.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { runEvaluation } from '../src/algorithm/evaluation.ts';
import { get } from '../src/utils/db.ts';
import { db } from '../src/db/connection.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const evidenceDir = path.resolve(__dirname, '../../docs/evidence');
mkdirSync(evidenceDir, { recursive: true });

runMigrations();
seedDatabase();

const semesterId = get<{ id: number }>(`SELECT id FROM semesters WHERE status = 'ACTIVE'`)?.id ?? 0;
console.log(`Evaluating allocation strategies on semester ${semesterId} (simulated data)...`);

const result = runEvaluation(semesterId, { seeded: true });

console.log('\n================================================================');
console.log('ALLOCATION STRATEGY EVALUATION (SIMULATED DATA)');
console.log('================================================================');
const pad = (s: unknown) => String(s).padEnd(28);
console.log(pad('Metric'), pad('Baseline'), pad('Greedy'), pad('Optimized'));
console.log('-'.repeat(110));
for (const row of result.metrics) {
  console.log(pad(row.metric), pad(row.baseline), pad(row.greedy), pad(row.optimized));
}
console.log('================================================================\n');

const outPath = path.join(evidenceDir, 'evaluation-results.json');
writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(`Results written to ${outPath}`);

db.close();
