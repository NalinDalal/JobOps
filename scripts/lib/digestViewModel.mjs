/**
 * lib/digestViewModel.mjs — Normalized data model for digest rendering
 *
 * Architecture: Job data → ranking → DigestViewModel → Email renderer
 *               Job data → ranking → DigestViewModel → Web dashboard
 *
 * Separates data preparation from presentation so the same model
 * can drive email, web dashboard, or any other output format.
 */

import {
  loadActiveProfile,
  getProfileCandidate,
  getProfileSkills,
  getProfileExperience,
  getProfileOutreach,
  getProfileTargetLocations,
} from './profile.mjs';
import { SCORE_STRONG, SCORE_REVIEW, TRUNCATE_DEFAULT } from './constants.mjs';

// ─── Text helpers ───
function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(s, maxLen = TRUNCATE_DEFAULT) {
  const clean = stripHtml(s);
  if (clean.length <= maxLen) return clean;
  return clean.substring(0, maxLen).replace(/\s+\S*$/, '') + '…';
}

// ─── Keyword extraction ───
const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'you',
  'your',
  'are',
  'has',
  'have',
  'this',
  'that',
  'will',
  'can',
  'our',
  'job',
  'role',
  'team',
  'work',
  'working',
  'looking',
  'seeking',
  'candidate',
  'experience',
  'years',
  'year',
  'strong',
  'excellent',
  'good',
  'knowledge',
  'using',
  'use',
  'used',
  'etc',
  'including',
  'well',
  'able',
  'must',
  'requirements',
  'required',
  'preferred',
  'plus',
  'bonus',
  'qualifications',
  'skills',
  'responsibilities',
]);

function extractJDKeywords(text) {
  if (!text) return [];
  const lower = String(text).toLowerCase();
  const tokens = new Set();
  for (const m of lower.matchAll(/[a-z][a-z0-9+#.\-]{2,}/g)) {
    const t = m[0];
    if (!STOP_WORDS.has(t) && t.length >= 3) tokens.add(t);
  }
  return [...tokens].slice(0, 30);
}

// ─── Skill matching ───
const WEB_PRIORITY_SKILLS = [
  'typescript',
  'javascript',
  'react',
  'next.js',
  'node.js',
  'tailwind css',
  'elysia',
  'express',
  'postgresql',
  'prisma',
  'mongodb',
  'redis',
  'docker',
  'kubernetes',
  'aws',
  'github actions',
  'bun',
  'jest',
  'bash',
  'linux',
];

function matchSkillsToJob(job, allSkills) {
  const jdTokens = new Set(
    extractJDKeywords(`${job.title} ${job.snippet || ''} ${(job.tags || []).join(' ')}`),
  );
  const matched = [];
  for (const skill of allSkills) {
    const s = skill.toLowerCase();
    if (jdTokens.has(s) || `${job.title} ${job.snippet || ''}`.toLowerCase().includes(s)) {
      matched.push(skill);
    }
  }
  return matched;
}

function pickRelevantFallbackSkills(allSkills) {
  const lower = allSkills.map((s) => s.toLowerCase());
  const picked = [];
  for (const priority of WEB_PRIORITY_SKILLS) {
    const idx = lower.indexOf(priority);
    if (idx !== -1 && !picked.includes(allSkills[idx])) {
      picked.push(allSkills[idx]);
      if (picked.length >= 3) break;
    }
  }
  if (picked.length === 0) return allSkills.slice(0, 3);
  return picked;
}

// ─── Seniority detection ───
const SENIOR_INDICATORS = [
  'senior',
  'staff',
  'principal',
  'lead',
  'manager',
  'director',
  'vp',
  'head of',
  'architect',
  'fellow',
  'distinguished',
  'staff engineer',
  'principal engineer',
  'iii',
  'iv',
  'v',
  '5+ years',
  '6+ years',
  '7+ years',
  '8+ years',
];

function isSeniorRole(title, snippet) {
  const text = `${title} ${snippet || ''}`.toLowerCase();
  return SENIOR_INDICATORS.some((ind) => text.includes(ind));
}

// ─── Compensation extraction ───
function extractCompRange(text) {
  if (!text) return null;
  const patterns = [
    /(?:₹|rs\.?|inr)\s*[\d,]+(?:\.\d+)?\s*(?:lakh|lac|lpa|k)?/i,
    /\$[\d,]+(?:\.\d+)?\s*(?:k|per\s*year|\/year|pa|p\.a\.)?/i,
    /[\d,]+(?:\.\d+)?\s*(?:k|per\s*year|\/year|pa|p\.a\.)/i,
    /(?:salary|comp|ctc|package)\s*[:\-]?\s*(?:₹|\$|rs\.?|inr)?\s*[\d,]+(?:\.\d+)?\s*(?:lakh|lac|lpa|k)?/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) return m[0].trim();
  }
  return null;
}

// ─── Verdict label ───
function verdictLabel(score) {
  if (score >= SCORE_STRONG) return 'Strong Apply';
  if (score >= SCORE_REVIEW) return 'Review';
  if (score >= 3.0) return 'Maybe';
  return 'Skip';
}

// ─── Outreach blurb generation ───
function buildOutreachBlurb(job, profile, candidate, outreachConfig) {
  const name = candidate.name || 'Candidate';
  const experience = getProfileExperience(profile);
  const allSkills = getProfileSkills(profile)
    .split(', ')
    .map((s) => s.trim())
    .filter(Boolean);
  const templates = outreachConfig.short_dm || outreachConfig.long_dm || '';

  const matchedSkills = matchSkillsToJob(job, allSkills);
  const topSkills =
    matchedSkills.slice(0, 3).join(', ') || pickRelevantFallbackSkills(allSkills).join(', ');

  const seniorMismatch = isSeniorRole(job.title, job.snippet);
  const experienceLine = seniorMismatch
    ? `I'm early in my career (0-2 years) and looking for a team that invests in junior engineers.`
    : `${experience ? `I'm a ${experience}` : `I'm a software engineer`} focused on shipping reliable systems end to end.`;

  const companyHook =
    matchedSkills.length > 0
      ? `I noticed ${job.company} works with ${matchedSkills[0]} — that's one of my core tools.`
      : `I'm excited about ${job.company}'s work and this ${job.title} role.`;

  const skillLine =
    matchedSkills.length > 0
      ? `My experience with ${topSkills} directly aligns with what you're looking for.`
      : `My background is in ${topSkills} and similar modern stacks.`;

  const lines = [
    `Hi Hiring Manager, I'm ${name} — ${experienceLine}`,
    companyHook,
    skillLine,
    `I build production-style projects (tests, CI, DevOps-friendly) and can share concise repos${candidate.github ? ` (${candidate.github})` : ''}.`,
    'Would you be open to a quick chat or pointing me to the best next step? Thanks!',
  ];

  if (templates && templates.includes('{skills}')) {
    return templates
      .replace(/\{Name\}/g, 'Hiring Manager')
      .replace(/\{candidate_name\}/g, name)
      .replace(/\{experience_level\}/g, experience || 'software')
      .replace(/\{skills\}/g, topSkills)
      .replace(/\{role\}/g, job.title)
      .replace(/\{company\}/g, job.company);
  }

  return lines.join('\n');
}

// ─── Skill gap analysis ───
function analyzeSkillGaps(jobs, allSkills) {
  const skillCounts = new Map();
  const totalJobs = jobs.length || 1;

  for (const job of jobs) {
    const jdTokens = new Set(
      extractJDKeywords(`${job.title} ${job.snippet || ''} ${(job.tags || []).join(' ')}`),
    );
    for (const token of jdTokens) {
      skillCounts.set(token, (skillCounts.get(token) || 0) + 1);
    }
  }

  const lowerSkills = new Set(allSkills.map((s) => s.toLowerCase()));
  const gaps = [];

  for (const [skill, count] of skillCounts) {
    const frequency = count / totalJobs;
    if (frequency >= 0.15 && !lowerSkills.has(skill)) {
      gaps.push({ skill, frequency, count });
    }
  }

  gaps.sort((a, b) => b.frequency - a.frequency);

  if (gaps.length === 0) return null;

  const top = gaps[0];
  return {
    skill: top.skill,
    frequency: Math.round(top.frequency * 100),
    count: top.count,
    currentLevel: 'Not listed',
    marketDemand: top.frequency >= 0.3 ? 'High' : 'Medium',
  };
}

// ─── LinkedIn people search URLs ───
function buildPeopleSearchUrls(company, linkedinTitles) {
  return (linkedinTitles || ['Engineering Manager', 'Tech Lead', 'CTO', 'HR'])
    .slice(0, 3)
    .map((title) => ({
      title,
      url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${title} at ${company}`)}&origin=GLOBAL_SEARCH_HEADER`,
    }));
}

// ─── Build a single match entry ───
function buildMatch(job, idx, jobs, allSkills, targetLocations) {
  const matchedSkills = matchSkillsToJob(job, allSkills);
  const evaluation = job.evaluation || {};
  const score = {
    overall: evaluation.overall || 0,
    roleFit: evaluation.roleFit || 0,
    location: evaluation.location || 0,
    growth: evaluation.growth || 0,
    compensation: evaluation.compensation || 0,
    culture: evaluation.culture || 0,
  };

  const whyMatch = [];
  if (matchedSkills.length > 0) {
    whyMatch.push(`${matchedSkills.slice(0, 4).join(', ')} match your profile`);
  }
  if (
    job.location?.toLowerCase().includes('remote') ||
    targetLocations.some((l) => job.location?.toLowerCase().includes(l.toLowerCase()))
  ) {
    whyMatch.push('Remote preference matches');
  }
  if (evaluation.overall >= SCORE_STRONG) {
    whyMatch.push('Strong overall fit');
  }

  return {
    rank: idx + 1,
    company: job.company,
    title: job.title,
    location: job.location,
    posted: job.posted,
    url: job.url,
    isRemote: job.location?.toLowerCase().includes('remote'),
    compensation: extractCompRange(job.snippet || ''),
    score,
    verdict: evaluation.overall ? verdictLabel(evaluation.overall) : 'Unscored',
    whyMatch,
    matchedSkills: matchedSkills.slice(0, 6),
    recommendation: evaluation.recommendation || '',
    redFlags: evaluation.redFlags || [],
    snippet: truncate(job.snippet, 220),
  };
}

// ─── Main: Build the ViewModel ───
export function buildViewModel(jobs, meta = {}) {
  const profile = loadActiveProfile();
  const candidate = getProfileCandidate(profile);
  const outreachConfig = getProfileOutreach(profile);
  const targetLocations = getProfileTargetLocations(profile);
  const targetRoles = (profile.data.target_roles || [])
    .map((r) => String(r).trim())
    .filter(Boolean);

  const allSkills = getProfileSkills(profile)
    .split(', ')
    .map((s) => s.trim())
    .filter(Boolean);

  const linkedinTitles = outreachConfig.linkedin_titles || [
    'Engineering Manager',
    'Tech Lead',
    'CTO',
    'HR',
  ];

  // Date formatting
  const now = new Date();
  const dateStr = meta.dateStr || now.toISOString().replace('T', ' ').substring(0, 16);
  const dateLong = now.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const dateShort = now.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  // Summary stats
  const strongMatches = jobs.filter((j) => j.evaluation?.overall >= SCORE_STRONG).length;
  const worthReviewing = jobs.filter(
    (j) => j.evaluation?.overall >= SCORE_REVIEW && j.evaluation?.overall < SCORE_STRONG,
  ).length;
  const withFlags = jobs.filter((j) => j.evaluation?.redFlags?.length > 0).length;
  const companies = new Set(jobs.map((j) => j.company));

  // Build all matches (ranked)
  const topMatches = jobs.map((job, idx) => buildMatch(job, idx, jobs, allSkills, targetLocations));

  // Actions — one per match that warrants action
  const actions = [];
  for (const m of topMatches) {
    if (m.score.overall >= SCORE_STRONG) {
      actions.push({
        label: `Apply to ${m.company}`,
        url: m.url,
        reason: `${m.score.overall.toFixed(1)}/5 — Strong Apply`,
      });
    } else if (m.score.overall >= SCORE_REVIEW) {
      actions.push({
        label: `Tailor CV for ${m.company}`,
        url: m.url,
        reason: `${m.score.overall.toFixed(1)}/5 — ${m.verdict}`,
      });
    }
  }

  // People to contact — consolidated per company
  const peopleCompanyMap = new Map();
  for (const match of topMatches) {
    if (!peopleCompanyMap.has(match.company)) {
      peopleCompanyMap.set(match.company, {
        company: match.company,
        roles: [],
        peopleSearchUrls: buildPeopleSearchUrls(match.company, linkedinTitles),
      });
    }
    peopleCompanyMap.get(match.company).roles.push(match.title);
  }

  const peopleToContact = [...peopleCompanyMap.values()].slice(0, 5).map((c) => {
    const firstJob = jobs.find((j) => j.company === c.company);
    return {
      ...c,
      outreachBlurb: firstJob
        ? buildOutreachBlurb(firstJob, profile, candidate, outreachConfig)
        : '',
    };
  });

  // Skill gap
  const skillGap = analyzeSkillGaps(jobs, allSkills);

  return {
    date: { full: dateStr, long: dateLong, short: dateShort },
    profile: { name: candidate.name, targetRoles, targetLocations },
    summary: {
      totalScanned: meta.totalScanned || jobs.length,
      freshCount: meta.freshCount || jobs.length,
      strongMatches,
      worthReviewing,
      withFlags,
      unscored: jobs.filter((j) => !j.evaluation?.overall).length,
      newCompanies: companies.size,
    },
    topMatches,
    actions,
    peopleToContact,
    skillGap,
    footer: {
      scanned: meta.totalScanned || jobs.length,
      filtered: jobs.length,
      delivered: jobs.length,
    },
  };
}
