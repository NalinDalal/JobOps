/**
 * digest/mailer.ts
 *
 * Email delivery via Resend or SMTP.
 */

import nodemailer from "nodemailer";
import { loadEnv, type Env } from "../config/env";

// ─── Types ────────────────────────────────────────────────────

export interface EmailOptions {
    subject: string;
    text: string;
    html: string;
}

export interface MailResult {
    sent: boolean;
    provider?: "resend" | "smtp";
}

// ─── Resend ───────────────────────────────────────────────────

async function sendViaResend(
    options: EmailOptions,
    env: Env,
): Promise<MailResult> {
    if (!env.resendApiKey || !env.mailFrom || !env.mailTo) {
        return { sent: false };
    }

    try {
        const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${env.resendApiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from: env.mailFrom,
                to: [env.mailTo],
                subject: options.subject,
                text: options.text,
                html: options.html,
            }),
        });

        if (!response.ok) {
            const body = await response.text();

            throw new Error(`Resend ${response.status}: ${body.slice(0, 300)}`);
        }

        console.log(`[email] Sent via Resend to ${env.mailTo}`);

        return {
            sent: true,
            provider: "resend",
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        console.error(`[email] Resend failed: ${message}`);

        return { sent: false };
    }
}

// ─── SMTP ─────────────────────────────────────────────────────

async function sendViaSMTP(
    options: EmailOptions,
    env: Env,
): Promise<MailResult> {
    if (!env.smtpUser || !env.smtpPass || !env.mailTo) {
        return { sent: false };
    }

    const host = env.smtpHost ?? "smtp.gmail.com";
    const port = env.smtpPort ?? 587;
    const from = env.mailFrom ?? env.smtpUser;

    try {
        const transporter = nodemailer.createTransport({
            host,
            port,
            secure: port === 465,
            auth: {
                user: env.smtpUser,
                pass: env.smtpPass,
            },
        });

        await transporter.sendMail({
            from,
            to: env.mailTo,
            subject: options.subject,
            text: options.text,
            html: options.html,
        });

        console.log(`[email] Sent via SMTP to ${env.mailTo}`);

        return {
            sent: true,
            provider: "smtp",
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        console.error(`[email] SMTP failed: ${message}`);

        return { sent: false };
    }
}

// ─── Main ─────────────────────────────────────────────────────

export async function sendEmail(
    options: EmailOptions,
    env: Env = loadEnv(),
): Promise<MailResult> {
    if (env.resendApiKey) {
        return sendViaResend(options, env);
    }

    if (env.smtpUser && env.smtpPass) {
        return sendViaSMTP(options, env);
    }

    console.log(
        "\n[email] No email provider configured. Printing digest instead.\n",
    );

    console.log(`Subject: ${options.subject}\n`);
    console.log(options.text);

    return { sent: false };
}
