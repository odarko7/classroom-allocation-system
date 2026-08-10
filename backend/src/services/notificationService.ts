import { insert } from '../utils/db.ts';

export interface AuditInput {
  userId: number | null;
  username: string | null;
  action: string;
  entityType: string | null;
  entityId?: number | null;
  oldValue?: unknown;
  newValue?: unknown;
}

export function writeAuditLog(input: AuditInput): void {
  insert(
    `INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, old_value, new_value)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      input.username ?? null,
      input.action,
      input.entityType,
      input.entityId ?? null,
      input.oldValue !== undefined ? JSON.stringify(input.oldValue) : null,
      input.newValue !== undefined ? JSON.stringify(input.newValue) : null,
    ],
  );
}

export type NotificationType = 'ALLOCATION_APPROVED' | 'ALLOCATION_CHANGED' | 'CONFLICT' | 'ROOM_UNAVAILABLE' | 'HIGH_UTILIZATION' | 'OPTIMIZATION_FAILED' | 'ALLOCATION_PROPOSED';

export function notify(input: { userId?: number; role?: string; type: NotificationType; title: string; message?: string }): void {
  insert(
    `INSERT INTO notifications (user_id, role, type, title, message) VALUES (?, ?, ?, ?, ?)`,
    [input.userId ?? null, input.role ?? null, input.type, input.title, input.message ?? null],
  );
}
