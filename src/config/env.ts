/**
 * config/env.ts — Centralized environment variable handling
 *
 * This is the ONLY place that reads process.env.
 * All other modules receive the Env object.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

export interface Env {
  // Cloudflare AI
  cloudflareApiKey: string | undefined;
  cloudflareAccountId: string | undefined;
  cloudflareModel: string;

  // Email (Resend)
  resendApiKey: string | undefined;
  mailFrom: string | undefined;
  mailTo: string | undefined;

  // Email (SMTP)
  smtpHost: string | undefined;
  smtpPort: number | undefined;
  smtpUser: string | undefined;
  smtpPass: string | undefined;
}

const DEFAULT_ENV: Env = {
  cloudflareApiKey: undefined,
  cloudflareAccountId: undefined,
  cloudflareModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  resendApiKey: undefined,
  mailFrom: undefined,
  mailTo: undefined,
  smtpHost: undefined,
  smtpPort: undefined,
  smtpUser: undefined,
  smtpPass: undefined,
};

let cachedEnv: Env | undefined;

/**
 * Load environment variables from .env file into process.env,
 * then return a typed Env object.
 */
export function loadEnv(root?: string): Env {
  if (cachedEnv) return cachedEnv;

  // Load .env file
  const rootDir = root || resolve(import.meta.dir, "..", "..");
  const envPath = resolve(rootDir, ".env");

  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      if (!line.trim() || line.trim().startsWith("#")) continue;
      const eqIdx = line.indexOf("=");
      if (eqIdx === -1) continue;
      const key = line.slice(0, eqIdx).trim();
      const val = line.slice(eqIdx + 1).trim();
      if (key) process.env[key] = val;
    }
  }

  // Build typed Env object
  cachedEnv = {
    cloudflareApiKey: process.env.CLOUDFLARE_API_KEY || process.env.CLOUDFLARE_API_TOKEN,
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareModel: process.env.CLOUDFLARE_MODEL || DEFAULT_ENV.cloudflareModel,
    resendApiKey: process.env.RESEND_API_KEY,
    mailFrom: process.env.MAIL_FROM,
    mailTo: process.env.MAIL_TO,
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : undefined,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
  };

  return cachedEnv;
}

/**
 * Check if Cloudflare AI credentials are configured.
 */
export function hasCloudflareKeys(env: Env): boolean {
  return Boolean(env.cloudflareApiKey && env.cloudflareAccountId);
}

/**
 * Check if email credentials are configured.
 */
export function hasEmailConfig(env: Env): boolean {
  return Boolean(env.resendApiKey) || Boolean(env.smtpUser && env.smtpPass);
}
