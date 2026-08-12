import nodemailer from 'nodemailer';
import { env } from '../config/env.ts';

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

export function isEmailConfigured(): boolean {
  return Boolean(env.smtpHost);
}

function getTransporter(): ReturnType<typeof nodemailer.createTransport> | null {
  if (!isEmailConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
    });
  }
  return transporter;
}

export function sendPasswordResetEmail(to: string, name: string, resetUrl: string): boolean {
  const t = getTransporter();
  if (!t) return false;
  t.sendMail({
    from: env.smtpFrom,
    to,
    subject: 'Reset your Classroom Allocation password',
    text: `Hello ${name},\n\nYou requested to reset your password for the Classroom Allocation System.\nOpen the link below to choose a new password (valid for 60 minutes):\n\n${resetUrl}\n\nIf you did not request this, you can safely ignore this email.`,
    html: `<p>Hello ${name},</p><p>You requested to reset your password for the <strong>Classroom Allocation System</strong>.</p><p>Open the link below to choose a new password (valid for 60 minutes):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request this, you can safely ignore this email.</p>`,
  })
    .then(() => console.log(`[email] password reset sent to ${to}`))
    .catch((err) => console.error('[email] password reset send failed:', err));
  return true;
}
