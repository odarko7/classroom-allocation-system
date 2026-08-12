import { all, get, insert, run } from '../utils/db.ts';

export interface PasswordResetRow {
  id: number;
  user_id: number;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export const resetTokenRepo = {
  create(userId: number, tokenHash: string, expiresInMinutes: number): number {
    return insert(
      `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, datetime('now', '+' || ? || ' minutes'))`,
      [userId, tokenHash, expiresInMinutes],
    );
  },
  findValid(userId: number, tokenHash: string): PasswordResetRow | undefined {
    return get<PasswordResetRow>(
      `SELECT * FROM password_resets WHERE user_id = ? AND token_hash = ? AND used_at IS NULL AND expires_at > datetime('now') ORDER BY id DESC LIMIT 1`,
      [userId, tokenHash],
    );
  },
  listActive(userId: number): PasswordResetRow[] {
    return all<PasswordResetRow>(
      `SELECT * FROM password_resets WHERE user_id = ? AND used_at IS NULL AND expires_at > datetime('now') ORDER BY id DESC`,
      [userId],
    );
  },
  markUsed(id: number) {
    run(`UPDATE password_resets SET used_at = datetime('now') WHERE id = ?`, [id]);
  },
  deleteForUser(userId: number) {
    run(`DELETE FROM password_resets WHERE user_id = ?`, [userId]);
  },
};
