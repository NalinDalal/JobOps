#!/usr/bin/env node

/**
 * emailOutreach.mjs — Find contacts and send direct email outreach
 * The #1 way to land interviews: email CTOs/EMs directly.
 *
 * Usage:
 *   node scripts/emailOutreach.mjs --company "Stripe" --role "SWE"
 *   node scripts/emailOutreach.mjs --company "Vercel" --find-only
 *   node scripts/emailOutreach.mjs --followup          — Show follow-ups due
 *   node scripts/emailOutreach.mjs --log "Stripe" "Applied via email"
 *
 * Flow:
 *   1. Find CTO/EM email (via pattern guessing or Apollo-style lookup)
 *   2. Draft personalized email
 *   3. Track outreach in data/outreach.json
 *   4. Follow up after 4-5 days
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
    loadActiveProfile,
    getProfileSkills,
    getProfileExperience,
    getProfileCandidate,
} from "./lib/profile.mjs";
import { loadEnv } from "./lib/env.mjs";
import { cfAI } from "./lib/ai.mjs";
import { argVal, argFlag } from "./lib/args.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

loadEnv(ROOT);

const OUTREACH_PATH = resolve(ROOT, "data/outreach.json");

const COMPANY = argVal("company", null);
const ROLE = argVal("role", "Software Engineer");
const FIND_ONLY = argFlag("find-only");
const FOLLOWUP = argFlag("followup");
const args = process.argv.slice(2);
const LOG_COMPANY = args[0] === "log" ? args[1] : null;
const LOG_NOTE = args[0] === "log" ? args.slice(2).join(" ") : null;

function loadOutreach() {
    try {
        if (existsSync(OUTREACH_PATH)) {
            return JSON.parse(readFileSync(OUTREACH_PATH, "utf-8"));
        }
    } catch (e) {
        console.warn(`Warning: Could not load outreach data: ${e.message}`);
    }
    return { contacts: [], sent: [] };
}

function saveOutreach(data) {
    mkdirSync(resolve(ROOT, "data"), { recursive: true });
    writeFileSync(OUTREACH_PATH, JSON.stringify(data, null, 2));
}

function guessEmailPatterns(firstName, lastName, domain) {
    const patterns = [
        `${firstName}@${domain}`,
        `${lastName}@${domain}`,
        `${firstName}.${lastName}@${domain}`,
        `${firstName}${lastName}@${domain}`,
        `${firstName[0]}${lastName}@${domain}`,
    ];
    return patterns.map((p) => p.toLowerCase());
}

async function findContacts(company) {
    console.log(`\n Finding contacts at ${company}...\n`);

    // Try to find LinkedIn profiles via public search
    const searchQueries = [
        `CTO ${company}`,
        `Engineering Manager ${company}`,
        `Founder ${company}`,
        `VP Engineering ${company}`,
    ];

    const contacts = [];

    for (const query of searchQueries) {
        try {
            const url = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}&origin=GLOBAL_SEARCH_HEADER`;
            const res = await fetch(url, {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                    Accept: "text/html",
                },
                signal: AbortSignal.timeout(10000),
            });

            if (res.ok) {
                const html = await res.text();
                // Extract names from search results (simplified)
                const nameRegex =
                    /<span[^>]*class="[^"]*entity-result__title-text[^"]*"[^>]*>([^<]*)<\/span>/gi;
                let match;
                while ((match = nameRegex.exec(html)) !== null) {
                    const name = match[1].trim();
                    if (
                        name &&
                        name.includes(" ") &&
                        !name.includes("LinkedIn")
                    ) {
                        const [first, last] = name.split(" ");
                        contacts.push({
                            name,
                            firstName: first,
                            lastName: last,
                            role: query.split(" ")[0],
                            company,
                            linkedinUrl: `https://www.linkedin.com/in/${first.toLowerCase()}-${last.toLowerCase()}/`,
                            emailPatterns: guessEmailPatterns(
                                first.toLowerCase(),
                                last.toLowerCase(),
                                company.toLowerCase().replace(/\s+/g, "") +
                                    ".com",
                            ),
                        });
                    }
                }
            }
        } catch (e) {
            // Skip errors
        }
    }

    // Deduplicate
    const seen = new Set();
    return contacts
        .filter((c) => {
            if (seen.has(c.name)) return false;
            seen.add(c.name);
            return true;
        })
        .slice(0, 5);
}

function draftEmail(contact, company, role, profile) {
    const name = profile.candidate?.name || "Nalin";
    const skills = getProfileSkills(profile).split(", ").slice(0, 5).join(", ");

    return {
        to: contact.emailPatterns[0],
        subject: `${role} at ${company} — quick idea`,
        body: `Hi ${contact.firstName},

I came across ${company}'s work and was impressed by what you're building.

I'm a ${getProfileExperience(profile)} engineer with experience in ${skills}. I noticed ${company} is hiring for ${role} and I believe I could contribute immediately.

Quick context: I've built production-style projects with tests, CI/CD, and DevOps-friendly practices. Happy to share specific examples.

Would love to chat about how I can help. Even a 10-minute call would be great.

Thanks,
${name}`,
        contact,
    };
}

function showFollowups(data) {
    const now = new Date();
    const due = [];

    for (const sent of data.sent) {
        const sentDate = new Date(sent.date);
        const daysSince = Math.floor((now - sentDate) / (1000 * 60 * 60 * 24));

        if (daysSince >= 4 && daysSince <= 7 && !sent.followedUp) {
            due.push({ ...sent, daysSince });
        }
    }

    if (due.length === 0) {
        console.log("\n No follow-ups due today.\n");
        return;
    }

    console.log(`\n Follow-ups due (${due.length}):\n`);
    for (const item of due) {
        console.log(
            `  → ${item.company} (${item.role}) — ${item.daysSince} days ago`,
        );
        console.log(`    Last email: ${item.subject}`);
        console.log(
            `    Follow-up: "Hi, just bumping this up. Still very interested in ${item.role} at ${item.company}."`,
        );
        console.log("");
    }
}

function logOutreach(data, company, note) {
    data.sent.push({
        company,
        role: ROLE,
        date: new Date().toISOString(),
        note,
        followedUp: false,
    });
    saveOutreach(data);
    console.log(`\n Logged outreach to ${company}`);
}

async function main() {
    const profile = loadActiveProfile();

    // Handle follow-up view
    if (FOLLOWUP) {
        const data = loadOutreach();
        showFollowups(data);
        return;
    }

    // Handle logging
    if (LOG_COMPANY) {
        const data = loadOutreach();
        logOutreach(data, LOG_COMPANY, LOG_NOTE || "Emailed directly");
        return;
    }

    if (!COMPANY) {
        console.error("Usage:");
        console.error(
            '  node scripts/emailOutreach.mjs --company "Stripe" --role "SWE"',
        );
        console.error("  node scripts/emailOutreach.mjs --followup");
        console.error('  node scripts/emailOutreach.mjs --log "Stripe" "note"');
        process.exit(1);
    }

    // Find contacts
    const contacts = await findContacts(COMPANY);

    if (contacts.length === 0) {
        console.log(" No contacts found. Try:");
        console.log(`   1. Search LinkedIn: "CTO ${COMPANY}"`);
        console.log(`   2. Check Apollo.io for verified emails`);
        console.log(
            `   3. Try common patterns: cto@${COMPANY.toLowerCase().replace(/\s+/g, "")}.com`,
        );
        return;
    }

    console.log(`\n Found ${contacts.length} contacts:\n`);
    contacts.forEach((c, i) => {
        console.log(`  ${i + 1}. ${c.name} (${c.role})`);
        console.log(`     LinkedIn: ${c.linkedinUrl}`);
        console.log(
            `     Guessed emails: ${c.emailPatterns.slice(0, 3).join(", ")}`,
        );
    });

    if (FIND_ONLY) {
        return;
    }

    // Draft emails
    console.log("\n Drafting personalized emails...\n");

    for (const contact of contacts.slice(0, 2)) {
        const email = draftEmail(contact, COMPANY, ROLE, profile);

        console.log(`\nTo: ${email.to}`);
        console.log(`Subject: ${email.subject}`);
        console.log("─".repeat(50));
        console.log(email.body);
        console.log("─".repeat(50));
    }

    // Save to outreach tracker
    const data = loadOutreach();
    for (const contact of contacts.slice(0, 2)) {
        data.contacts.push({
            ...contact,
            company: COMPANY,
            role: ROLE,
            date: new Date().toISOString(),
        });
    }
    saveOutreach(data);

    console.log("\n   Next steps:");
    console.log("   1. Verify email with Apollo.io or Hunter.io");
    console.log("   2. Copy the email above and send it");
    console.log(
        '   3. Log: node scripts/emailOutreach.mjs --log "Company" "note"',
    );
    console.log(
        "   4. Follow up in 4-5 days: node scripts/emailOutreach.mjs --followup",
    );
}

main().catch((e) => {
    console.error(`Email outreach failed: ${e.message}`);
    process.exit(1);
});
