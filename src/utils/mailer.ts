import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

export interface EmailLogEntry {
  id: string;
  to: string;
  subject: string;
  body: string;
  link: string;
  timestamp: Date;
}

// Global in-memory list for dev-mailbox fetching
export const devEmailsList: EmailLogEntry[] = [];

export const sendInviteEmail = async (to: string, teamName: string, inviterName: string, inviteLink: string) => {
  const subject = `You've been invited to join ${teamName} on Aether`;
  const body = `Hi there,\n\n${inviterName} has invited you to join the team "${teamName}" on Aether.\n\nClick the link below to accept the invitation and join your team:\n${inviteLink}\n\nBest regards,\nAether Team`;

  // Push to dev-mailbox logs
  devEmailsList.unshift({
    id: Math.random().toString(36).substring(2, 9),
    to,
    subject,
    body,
    link: inviteLink,
    timestamp: new Date()
  });

  // Log locally to static upload directory
  try {
    const logPath = path.join(process.cwd(), 'public', 'uploads', 'emails.log');
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] To: ${to} | Link: ${inviteLink}\n`);
  } catch (err) {
    console.error('Failed to log email to disk:', err);
  }

  // If SMTP variables exist, send real email
  if (process.env.SMTP_HOST) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: `"Aether Team" <${process.env.SMTP_USER}>`,
        to,
        subject,
        text: body,
        html: `<p>Hi there,</p><p><strong>${inviterName}</strong> has invited you to join the team "<strong>${teamName}</strong>" on Aether.</p><p><a href="${inviteLink}" style="padding: 10px 20px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 6px; display: inline-block;">Accept Invitation</a></p><p>Or copy this link: <a href="${inviteLink}">${inviteLink}</a></p>`,
      });
      console.log(`[SMTP] Sent invite email to ${to}`);
      return;
    } catch (error) {
      console.error('[SMTP] Real mail send failed, logging to console:', error);
    }
  }

  console.log(`
=========================================================
[DEV MAILBOX] Simulating email delivery
To: ${to}
Subject: ${subject}
Join Link: ${inviteLink}
=========================================================
  `);
};
