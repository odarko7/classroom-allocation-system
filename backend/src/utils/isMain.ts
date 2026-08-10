import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

/** True when the current module is the process entry point (not imported). */
export function isMain(moduleUrl: string): boolean {
  if (!process.argv[1]) return false;
  const entry = resolve(process.argv[1]);
  const self = fileURLToPath(moduleUrl);
  return entry === self;
}
