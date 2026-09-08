/**
 * lib/scan.mjs — Shared scan runner (spawns scan.mjs and parses output)
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

export function runScan(query, location) {
    return new Promise((resolvePromise, reject) => {
        const child = spawn(
            process.execPath,
            [resolve(ROOT, "scripts/scan.mjs"), query, location],
            {
                cwd: ROOT,
            },
        );
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d) => (stdout += d));
        child.stderr.on("data", (d) => (stderr += d));
        child.on("error", reject);
        child.on("close", (code) => {
            if (code !== 0)
                return reject(new Error(stderr || `scan.mjs exited ${code}`));
            const match = stdout.match(/\[[\s\S]*\]\s*$/);
            if (!match) return reject(new Error("Could not parse scan output"));
            try {
                resolvePromise(JSON.parse(match[0]));
            } catch (e) {
                reject(new Error(`Failed to parse scan JSON: ${e.message}`));
            }
        });
    });
}

export function evaluateJob(job) {
    return new Promise((resolvePromise) => {
        const payload = JSON.stringify({
            title: job.title,
            company: job.company,
            snippet: job.snippet,
            url: job.url,
            tags: job.tags,
        });
        const child = spawn(
            process.execPath,
            [resolve(ROOT, "scripts/evaluate.mjs"), payload],
            {
                cwd: ROOT,
            },
        );
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d) => (stdout += d));
        child.stderr.on("data", (d) => (stderr += d));
        child.on("error", () => resolvePromise(null));
        child.on("close", () => {
            try {
                const match = stdout.match(/\{[\s\S]*\}/);
                resolvePromise(match ? JSON.parse(match[0]) : null);
            } catch {
                resolvePromise(null);
            }
        });
    });
}
