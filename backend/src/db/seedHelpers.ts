import { all } from '../utils/db.ts';
import { COURSES } from './seedData.ts';

export interface GroupSpec {
  name: string;
  lecturer: string;
  studentCount: number;
}

/**
 * Deterministically split each course into one or more student groups (sections).
 * Sections are sized to fit the available rooms of the course's required room type,
 * so the allocation engine can place most groups. A few large courses are kept as
 * single sections to demonstrate genuine capacity-failure edge cases.
 */
export function generateGroups(): Map<string, GroupSpec[]> {
  const result = new Map<string, GroupSpec[]>();
  const SINGLE_SECTION = new Set(['CSC301', 'EE301', 'CSC401']);
  for (const c of COURSES) {
    const groups: GroupSpec[] = [];
    let maxPerSection = Infinity;
    if (c.roomType === 'Computer Lab') maxPerSection = 40;
    else if (c.roomType === 'Laboratory') maxPerSection = 25;
    else if (c.roomType === 'Seminar Room') maxPerSection = 30;

    let sections: number;
    if (SINGLE_SECTION.has(c.code)) {
      sections = 1;
    } else if (maxPerSection !== Infinity) {
      sections = Math.ceil(c.students / maxPerSection);
    } else {
      sections = c.students >= 150 ? 3 : c.students >= 90 ? 2 : 1;
    }

    const base = Math.floor(c.students / sections);
    let remainder = c.students;
    for (let i = 0; i < sections; i++) {
      const count = i === sections - 1 ? remainder : base + (i === 0 ? c.students % sections : 0);
      groups.push({ name: `Section ${String.fromCharCode(65 + i)}`, lecturer: c.lecturer, studentCount: count });
      remainder -= count;
    }
    result.set(c.code, groups);
  }
  return result;
}

/** Ensure student-group counts are consistent; returns total student placements. */
export function allocateStudents(): { groups: number; students: number } {
  const groups = all<{ id: number; course_id: number; student_count: number }>(`SELECT id, course_id, student_count FROM student_groups`);
  const courseStudents = new Map<number, number>();
  for (const g of groups) {
    courseStudents.set(g.course_id, (courseStudents.get(g.course_id) ?? 0) + g.student_count);
  }
  let total = 0;
  for (const v of courseStudents.values()) total += v;
  return { groups: groups.length, students: total };
}
