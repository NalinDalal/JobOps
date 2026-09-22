/**
 * lib/outreach.ts — Outreach draft generation
 *
 * Generates personalized founder DM/email drafts for companies.
 * Never auto-sends. Stores drafts in output/outreach/ for review.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { loadEnv, hasCloudflareKeys } from "./config";
import {
  loadActiveProfile,
  getProfileSkills,
  getProfileExperience,
  getProfileCandidate,
  getProfileTargetRoles,
} from "./config";
import { CV_TRUNCATE } from "./constants";
import { callCloudflareAI } from "./ai";
import type { AcceleratorCompany, OutreachOptions, OutreachDraft } from "./types";

const ROOT = resolve(import.meta.dir, "..");
const OUTPUT_DIR = resolve(ROOT, "output/outreach");

// ─── Main ───────────────────────────────────────────────────────

export async function generateOutreach(
  options: OutreachOptions,
): Promise<OutreachDraft | null> {
  const {
    company,
    role = "Engineer",
    companyUrl = "",
    companyDescription = "",
    techStack = [],
    accelerator = "",
    format = "short-dm",
    output = true,
  } = options;

  console.log(`Generating outreach for: ${company} (${role})`);

  const env = loadEnv();
  if (!hasCloudflareKeys(env)) {
    console.warn("No Cloudflare AI keys found, using template-based outreach");
    return generateTemplateOutreach(options);
  }

  const profile = loadActiveProfile();
  const skills = getProfileSkills(profile);
  const experience = getProfileExperience(profile);
  const candidate = getProfileCandidate(profile);
  const targetRoles = getProfileTargetRoles(profile).join(", ");

  const prompt = buildOutreachPrompt({
    company,
    role,
    companyUrl,
    companyDescription,
    techStack,
    accelerator,
    format,
    candidateName: candidate.name || "Candidate",
    skills,
    experience,
    targetRoles,
  });

  try {
    const response = await callCloudflareAI(prompt, env);
    const draft = parseOutreachResponse(response, options);

    if (output) {
      const savedPath = saveOutreachDraft(draft);
      draft.savedPath = savedPath;
      console.log(`Outreach draft saved to: ${savedPath}`);
    }

    return draft;
  } catch (e) {
    console.error(`Outreach generation failed for ${company}: ${e}`);
    return generateTemplateOutreach(options);
  }
}

// ─── Template-based fallback ────────────────────────────────────

function generateTemplateOutreach(options: OutreachOptions): OutreachDraft {
  const { company, role = "Engineer", techStack = [], accelerator = "" } = options;
  const profile = loadActiveProfile();
  const skills = getProfileSkills(profile);
  const experience = getProfileExperience(profile);
  const candidate = getProfileCandidate(profile);
  const name = candidate.name || "Candidate";

  const topSkills = skills
    .split(", ")
    .slice(0, 3)
    .join(", ") || "TypeScript, Node.js, React";

  const techLine = techStack.length > 0
    ? ` I see you work with ${techStack.slice(0, 3).join(", ")} — that aligns well with my background.`
    : "";

  const accLine = accelerator
    ? ` I came across ${company} through ${accelerator} and was impressed by your trajectory.`
    : ` I came across ${company} and was impressed by your trajectory.`;

  const body = `Hi ${company} team,\n\n` +
    `I'm ${name} — ${experience ? `a ${experience}` : `a software engineer`} focused on shipping reliable systems end to end.` +
    `${accLine}${techLine}\n\n` +
    `My experience with ${topSkills} directly aligns with what you're building.` +
    ` I build production-style projects (tests, CI, DevOps-friendly) and can share concise repos on GitHub.` +
    ` Would you be open to a quick chat or pointing me to the best next step?\n\n` +
    `Thanks!`;

  const draft: OutreachDraft = {
    company,
    role,
    format: options.format || "short-dm",
    body,
  };

  if (options.output !== false) {
    const savedPath = saveOutreachDraft(draft);
    draft.savedPath = savedPath;
    console.log(`Outreach draft saved to: ${savedPath}`);
  }

  return draft;
}

// ─── Prompt Builder ─────────────────────────────────────────────

interface OutreachPromptInput {
  company: string;
  role: string;
  companyUrl: string;
  companyDescription: string;
  techStack: string[];
  accelerator: string;
  format: string;
  candidateName: string;
  skills: string;
  experience: string;
  targetRoles: string;
}

function buildOutreachPrompt(input: OutreachPromptInput): string {
  return `Write a personalized outreach message (DM/email) for a job application.

CANDIDATE:
Name: ${input.candidateName}
Skills: ${input.skills}
Experience: ${input.experience}
Target Roles: ${input.targetRoles}

COMPANY:
Name: ${input.company}
Role: ${input.role}
${input.companyUrl ? `Website: ${input.companyUrl}` : ""}
${input.companyDescription ? `Description: ${input.companyDescription.substring(0, 500)}` : ""}
Tech Stack: ${(input.techStack || []).join(", ") || "Not specified"}
${input.accelerator ? `Accelerator: ${input.accelerator}` : ""}

FORMAT: ${input.format === "short-dm" ? "Short DM (100-150 words)" : input.format === "long-dm" ? "Long DM (200-300 words)" : "Email (300-400 words with subject line)"}

Return JSON:
{
  "subject": "<email subject if format=email, otherwise empty string>",
  "body": "<the outreach message>"
}

Requirements:
1. Be specific to this company — mention something about their work
2. Highlight 2-3 relevant skills from the candidate's profile
3. Keep it concise and respectful of their time
4. End with a clear call to action (chat, referral, next step)
5. No generic fluff — sound like a real engineer reaching out
6. Match the format word count requirement`;
}

// ─── Response Parser ────────────────────────────────────────────

function parseOutreachResponse(
  response: string,
  options: OutreachOptions,
): OutreachDraft {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");

    const parsed = JSON.parse(jsonMatch[0]);
    const body = parsed.body || "";
    const subject = parsed.subject || "";

    if (!body) throw new Error("Missing body in response");

    return {
      company: options.company,
      role: options.role || "Engineer",
      format: options.format || "short-dm",
      subject,
      body,
    };
  } catch (e) {
    console.error("Failed to parse outreach response:", e);
    return generateTemplateOutreach(options);
  }
}

// ─── File Output ────────────────────────────────────────────────

function saveOutreachDraft(draft: OutreachDraft): string {
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  const safeCompany = draft.company.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
  const timestamp = new Date().toISOString().split("T")[0];
  const filename = `${safeCompany}-${draft.role.toLowerCase().replace(/\s+/g, "-")}-${timestamp}.md`;
  const filepath = resolve(OUTPUT_DIR, filename);

  const content = `# Outreach Draft — ${draft.company}\n\n` +
    `**Role:** ${draft.role}\n` +
    `**Format:** ${draft.format}\n` +
    `**Generated:** ${new Date().toISOString()}\n\n` +
    (draft.subject ? `## Subject\n\n${draft.subject}\n\n` : "") +
    `## Message\n\n${draft.body}\n`;

  writeFileSync(filepath, content);
  return filepath;
}

// ─── Batch generation ───────────────────────────────────────────

export async function generateOutreachForCompanies(
  companies: AcceleratorCompany[],
  format: "short-dm" | "long-dm" | "email" = "short-dm",
  max: number = 10,
): Promise<OutreachDraft[]> {
  const targets = companies.slice(0, max);
  const drafts: OutreachDraft[] = [];

  console.log(`Generating outreach for ${targets.length} companies...`);

  for (const company of targets) {
    try {
      const draft = await generateOutreach({
        company: company.name,
        role: "Engineer",
        companyUrl: company.url,
        companyDescription: company.description,
        techStack: company.techStack,
        accelerator: company.accelerator,
        format,
        output: true,
      });
      if (draft) drafts.push(draft);
    } catch (e) {
      console.error(`Failed to generate outreach for ${company.name}: ${e}`);
    }
  }

  console.log(`Generated ${drafts.length} outreach drafts`);
  return drafts;
}

// ─── CLI entry point ────────────────────────────────────────────

if (import.meta.main) {
  const args = process.argv.slice(2);
  const company = args.find((a) => !a.startsWith("--")) || "";
  const role = args.find((a) => a.startsWith("--role="))?.slice(6) || "Engineer";
  const format = (args.find((a) => a.startsWith("--format="))?.slice(8) || "short-dm") as "short-dm" | "long-dm" | "email";

  if (!company) {
    console.error("Usage: outreach <company> [--role <role>] [--format <short-dm|long-dm|email>]");
    process.exit(1);
  }

  generateOutreach({ company, role, format }).catch((e) => {
    console.error(`Outreach failed: ${e}`);
    process.exit(1);
  });
}