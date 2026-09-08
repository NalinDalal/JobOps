/**
 * lib/env.mjs — Load .env file into process.env
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

export function loadEnv(root = ROOT) {
    const envPath = resolve(root, ".env");
    if (!existsSync(envPath)) return;
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

export function getCfCredentials() {
    const token =
        process.env.CLOUDFLARE_API_KEY || process.env.CLOUDFLARE_API_TOKEN;
    const account = process.env.CLOUDFLARE_ACCOUNT_ID;
    const model =
        process.env.CLOUDFLARE_MODEL ||
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
    return { token, account, model };
}
