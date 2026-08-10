import { get } from '../utils/db.ts';

export interface Weights {
  capacity: number;
  facilities: number;
  availability: number;
  utilization: number;
  location: number;
  department: number;
}

export function loadWeights(): Weights {
  const read = (key: string, fallback: number) => {
    const row = get<{ value: string }>(`SELECT value FROM system_settings WHERE key = ?`, [key]);
    const parsed = Number(row?.value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    capacity: read('allocation.weight.capacity', 25),
    facilities: read('allocation.weight.facilities', 25),
    availability: read('allocation.weight.availability', 20),
    utilization: read('allocation.weight.utilization', 15),
    location: read('allocation.weight.location', 10),
    department: read('allocation.weight.department', 5),
  };
}

/** Time "HH:MM" -> minutes since midnight */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function slotsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(bStart) < timeToMinutes(aEnd);
}

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Capacity suitability based on needed/capacity ratio (0..1). */
export function capacityScore(needed: number, capacity: number): number {
  if (capacity <= 0) return 0;
  const ratio = needed / capacity;
  if (ratio > 1) return 0;
  if (ratio >= 0.9) return 0.8;
  if (ratio >= 0.75) return 0.95;
  if (ratio >= 0.55) return 1;
  if (ratio >= 0.35) return 0.85;
  if (ratio >= 0.2) return 0.7;
  return 0.55;
}

/** Facility compatibility: fraction of required facilities present. */
export function facilityScore(required: string[], present: string[]): number {
  if (required.length === 0) return 1;
  if (present.length === 0) return 0;
  const presentSet = new Set(present);
  const satisfied = required.filter((f) => presentSet.has(f)).length;
  return satisfied / required.length;
}

/** Utilization balance: prefer rooms with lower current load. */
export function utilizationScore(usage: number): number {
  if (usage <= 0) return 1;
  if (usage >= 1) return 0;
  return Math.max(0, 1 - usage);
}

/** Location proximity: distance between building codes (A=0, B=1, ...). */
export function locationScore(fromBuilding: string, preferredBuilding: string | null | undefined): number {
  if (!preferredBuilding) return 1;
  const dist = Math.abs(buildingIndex(fromBuilding) - buildingIndex(preferredBuilding));
  return Math.max(0, 1 - 0.3 * dist);
}

/** Department preference: binary reward for preferred building. */
export function departmentPrefScore(roomBuilding: string, preferredBuilding: string | null | undefined): number {
  if (!preferredBuilding) return 1;
  return roomBuilding.toUpperCase() === preferredBuilding.toUpperCase() ? 1 : 0.5;
}

export function buildingIndex(building: string): number {
  const letters = building.toUpperCase().match(/[A-Z]/)?.[0];
  if (!letters) return 0;
  return letters.charCodeAt(0) - 65;
}

export function combineScores(s: Record<string, number>, w: Weights): number {
  const entries = [
    ['capacity', w.capacity],
    ['facilities', w.facilities],
    ['availability', w.availability],
    ['utilization', w.utilization],
    ['location', w.location],
    ['department', w.department],
  ] as const;
  let total = 0;
  let weightSum = 0;
  for (const [key, weight] of entries) {
    total += (s[key] ?? 0) * weight;
    weightSum += weight;
  }
  if (weightSum === 0) return 0;
  return Math.round((total / weightSum) * 1000) / 10;
}
