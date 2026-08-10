import { all, get } from '../utils/db.ts';
import { buildingUtilization, classroomUsage, departmentDemand, peakPeriods, timeDemand, type ClassroomUsageRow } from './metrics.ts';

export interface RecognizedPattern {
  category: string;
  title: string;
  statement: string;
  severity: 'INFO' | 'WARNING' | 'ALERT';
  data: Record<string, unknown>;
}

export interface PatternResult {
  simulatedData: boolean;
  patterns: RecognizedPattern[];
}

function underOverUtilized(usage: ClassroomUsageRow[]) {
  const under = usage.filter((u) => u.utilization > 0 && u.utilization < 30).sort((a, b) => a.utilization - b.utilization);
  const over = usage.filter((u) => u.utilization > 80).sort((a, b) => b.utilization - a.utilization);
  return { under, over };
}

export function recognizePatterns(semesterId: number | null, simulatedData = true): PatternResult {
  const patterns: RecognizedPattern[] = [];
  const semester = semesterId ?? get<{ id: number }>(`SELECT id FROM semesters ORDER BY id DESC LIMIT 1`)?.id ?? null;

  const usage = semester ? classroomUsage(semester) : [];
  const buildings = semester ? buildingUtilization(semester) : [];
  const demand = semester ? departmentDemand(semester) : [];
  const peaks = semester ? peakPeriods(semester) : { peakDay: 'N/A', lowestDay: 'N/A', peakPeriod: 'N/A', peakPeriodDay: 'N/A', hourly: [] };
  const hourly = peaks.hourly as { day: string; startTime: string; endTime: string; bookings: number }[];

  // Peak demand periods by facility type (Computer Lab / Laboratory focus)
  const labDemand = semester ? all(`
    SELECT ts.day, ts.start_time, ts.end_time, COUNT(a.id) AS bookings
    FROM allocations a
    JOIN classrooms c ON c.id = a.classroom_id
    JOIN time_slots ts ON ts.id = a.time_slot_id
    WHERE a.semester_id = ? AND a.status != 'REJECTED' AND c.room_type IN ('Computer Lab', 'Laboratory')
    GROUP BY ts.id ORDER BY bookings DESC LIMIT 1
  `, [semester])[0] : undefined;
  if (labDemand) {
    patterns.push({
      category: 'Facility demand', title: 'Computer laboratory peak demand',
      statement: `Computer laboratories experience their highest demand on ${labDemand.day === 0 ? 'Monday' : labDemand.day === 1 ? 'Tuesday' : labDemand.day === 2 ? 'Wednesday' : labDemand.day === 3 ? 'Thursday' : labDemand.day === 4 ? 'Friday' : 'Weekend'} between ${labDemand.start_time} and ${labDemand.end_time} (${labDemand.bookings} bookings).`,
      severity: 'INFO', data: labDemand as unknown as Record<string, unknown>,
    });
  }

  for (const b of buildings) {
    patterns.push({
      category: 'Building utilization', title: `${b.building} utilization`,
      statement: `${b.building} has an average utilization of ${b.utilization}% across ${b.classrooms} classrooms.${b.utilization > 75 ? ' This building is approaching over-capacity.' : b.utilization < 35 ? ' This building is underutilized.' : ''}`,
      severity: b.utilization > 75 ? 'WARNING' : b.utilization < 35 ? 'WARNING' : 'INFO',
      data: b as unknown as Record<string, unknown>,
    });
  }

  const { under, over } = underOverUtilized(usage);
  for (const u of under.slice(0, 3)) {
    patterns.push({
      category: 'Underutilization', title: `${u.roomCode} underutilized`,
      statement: `Room ${u.roomCode} in ${u.building} is underutilized at ${u.utilization}% (only ${u.usedHours} of ${u.availableHours} weekly hours used).`,
      severity: 'WARNING', data: u as unknown as Record<string, unknown>,
    });
  }
  for (const o of over.slice(0, 3)) {
    patterns.push({
      category: 'Overutilization', title: `${o.roomCode} overutilized`,
      statement: `Room ${o.roomCode} in ${o.building} is heavily utilized at ${o.utilization}% with ${o.bookings} bookings this semester.`,
      severity: 'WARNING', data: o as unknown as Record<string, unknown>,
    });
  }

  if (demand[0]) {
    patterns.push({
      category: 'Department demand', title: 'Highest departmental demand',
      statement: `${demand[0].department} has the highest classroom demand with ${demand[0].allocations} allocations serving ${demand[0].students} students.`,
      severity: 'INFO', data: demand[0] as unknown as Record<string, unknown>,
    });
  }

  // Peak/lowest time demand
  if (hourly.length) {
    const max = hourly.slice().sort((a, b) => b.bookings - a.bookings)[0];
    const min = hourly.filter((h) => h.bookings === 0).length
      ? hourly.filter((h) => h.bookings === 0)[0]
      : hourly.slice().sort((a, b) => a.bookings - b.bookings)[0];
    patterns.push({
      category: 'Peak period', title: 'Highest demand time slot',
      statement: `The highest-demand time slot is ${max.day} ${max.startTime}-${max.endTime} with ${max.bookings} concurrent bookings.`,
      severity: 'INFO', data: max as unknown as Record<string, unknown>,
    });
    patterns.push({
      category: 'Low demand', title: 'Lowest usage period',
      statement: `The lowest-demand period is ${min.day} ${min.startTime}-${min.endTime} with ${min.bookings} bookings; consider scheduling large or flexible classes here.`,
      severity: 'INFO', data: min as unknown as Record<string, unknown>,
    });
  }

  patterns.push({
    category: 'Pattern recognition', title: 'Data source',
    statement: simulatedData ? 'All patterns above were calculated from simulated demonstration data seeded into the database.' : 'All patterns above were calculated from actual database records.',
    severity: 'INFO', data: { simulatedData },
  });

  return { simulatedData, patterns };
}
