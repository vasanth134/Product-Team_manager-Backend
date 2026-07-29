"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendInviteEmail = exports.devEmailsList = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// Global in-memory list for dev-mailbox fetching
exports.devEmailsList = [];
const sendInviteEmail = async (to, teamName, inviterName, inviteLink) => {
    const subject = `You've been invited to join ${teamName} on Aether`;
    const body = `Hi there,\n\n${inviterName} has invited you to join the team "${teamName}" on Aether.\n\nClick the link below to accept the invitation and join your team:\n${inviteLink}\n\nBest regards,\nAether Team`;
    // Push to dev-mailbox logs
    exports.devEmailsList.unshift({
        id: Math.random().toString(36).substring(2, 9),
        to,
        subject,
        body,
        link: inviteLink,
        timestamp: new Date()
    });
    // Log locally to root directory (not exposed statically to the public)
    try {
        const logPath = path_1.default.join(process.cwd(), 'emails.log');
        fs_1.default.appendFileSync(logPath, `[${new Date().toISOString()}] To: ${to} | Link: ${inviteLink}\n`);
    }
    catch (err) {
        console.error('Failed to log email to disk:', err);
    }
    // If SMTP variables exist, send real email
    if (process.env.SMTP_HOST) {
        try {
            const transporter = nodemailer_1.default.createTransport({
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
        }
        catch (error) {
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
exports.sendInviteEmail = sendInviteEmail;
