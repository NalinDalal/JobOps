#!/usr/bin/env node

/**
 * profile-generator.mjs — Generate profile.yml from master resume.md
 * Parses structured markdown and enriches with GitHub/CP data
 * 
 * Usage: 
 *   node scripts/profile-generator.mjs              # uses config/resume.md
 *   node scripts/profile-generator.mjs --enrich     # also fetch GitHub/CP data
 *   node scripts/profile-generator.mjs resume.md    # custom file
 * 
 * Output: config/profile.yml (overwrites existing)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Load env
const envPath = resolve(ROOT, '.env');
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const [key, ...val] = line.split('=');
    if (key && val.length) process.env[key.trim()] = val.join('=').trim();
  }
}

const CF_TOKEN = process.env.CLOUDFLARE_API_KEY || process.env.CLOUDFLARE_API_TOKEN;
const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_MODEL = process.env.CLOUDFLARE_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

async function cfAI(prompt) {
  if (!CF_TOKEN || !CF_ACCOUNT) {
    throw new Error('Cloudflare credentials not configured. Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in .env');
  }
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/${CF_MODEL}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CF_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: 'You are a resume parser. Extract structured data and return ONLY valid YAML.' },
          { role: 'user', content: prompt },
        ],
        stream: false,
        max_tokens: 4096,
        temperature: 0.1,
      }),
    }
  );
  const data = await res.json();
  return data.result?.choices?.[0]?.message?.content || data.result?.response || '';
}

function parseResumeSections(content) {
  const sections = {};
  let currentSection = 'header';
  let currentContent = [];
  
  const lines = content.split('\n');
  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      if (currentContent.length > 0) {
        sections[currentSection] = currentContent.join('\n').trim();
      }
      // Normalize section name: remove em dashes, parentheses, special chars
      currentSection = headingMatch[1]
        .toLowerCase()
        .replace(/[—–]/g, '_')  // em/en dashes
        .replace(/[()]/g, '')
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  if (currentContent.length > 0) {
    sections[currentSection] = currentContent.join('\n').trim();
  }
  
  return sections;
}

function extractSkillsFromResume(sections) {
  const skillsText = sections['full_skills_inventory_granular_trim_per_jd'] || '';
  const skills = {
    languages: [],
    frameworks: [],
    databases: [],
    devops: [],
    tools: [],
    systems: [],
    web3: [],
  };
  
  // Parse each skill category - match **Category:** pattern
  const categoryPatterns = {
    languages: /\*\*Languages:\*\*\s*([^\n]+)/,
    frameworks: /\*\*Frameworks\s*[&&]\s*APIs:\*\*\s*([^\n]+)/,
    databases: /\*\*Data\s*[&&]\s*Messaging:\*\*\s*([^\n]+)/,
    devops: /\*\*DevOps\s*[&&]\s*Cloud:\*\*\s*([^\n]+)/,
    tools: /\*\*Dev\s*Tools:\*\*\s*([^\n]+)/,
    systems: /\*\*Systems.*?Low.level.*?:\*\*\s*([^\n]+)/,
    web3: /\*\*Web3.*?Rust\s*track.*?:\*\*\s*([^\n]+)/,
  };
  
  for (const [key, regex] of Object.entries(categoryPatterns)) {
    const match = skillsText.match(regex);
    if (match) {
      skills[key] = match[1].split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  
  return skills;
}

function extractProjects(sections) {
  const projectsText = sections['projects_full_list'] || '';
  const projects = [];
  
  // Match project headers like "### Modheshwari — TypeScript, Next.js, PostgreSQL, Kafka, Redis, Docker, AWS · Jun 2024 – Aug 2026"
  const projectRegex = /^###\s+(.+?)\s*[—–]\s*(.+?)\s*[·•]\s*(.+?)$/gm;
  let match;
  while ((match = projectRegex.exec(projectsText)) !== null) {
    projects.push({
      name: match[1].trim(),
      tech: match[2].trim(),
      dates: match[3].trim(),
    });
  }
  
  return projects;
}

function extractExperience(sections) {
  const expText = sections['experience_full_detail_more_bullets_than_the_trimmed_tex'] || '';
  const experience = [];
  
  // Match "### Company — Location" followed by "**Role** · Dates"
  const expRegex = /^###\s+(.+?)\s*[—–]\s*(.+?)$\s*\*\*(.+?)\*\*\s*[·•]\s*(.+?)$/gm;
  let match;
  while ((match = expRegex.exec(expText)) !== null) {
    experience.push({
      company: match[1].trim(),
      location: match[2].trim(),
      role: match[3].trim(),
      dates: match[4].trim(),
    });
  }
  
  return experience;
}

async function fetchGitHubData() {
  try {
    // Fetch user repos
    const reposRes = await fetch('https://api.github.com/users/NalinDalal/repos?per_page=100&sort=updated', {
      headers: { 'User-Agent': 'JobOps' }
    });
    const repos = await reposRes.json();
    
    // Get pinned repos via GraphQL
    const graphqlRes = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'JobOps'
      },
      body: JSON.stringify({
        query: `
          query {
            user(login: "NalinDalal") {
              pinnedItems(first: 6, types: REPOSITORY) {
                nodes {
                  ... on Repository {
                    name
                    description
                    primaryLanguage { name }
                    stargazerCount
                    forkCount
                    url
                  }
                }
              }
              contributionsCollection {
                contributionCalendar {
                  totalContributions
                }
              }
            }
          }
        `
      })
    });
    
    const graphqlData = await graphqlRes.json();
    
    return {
      publicRepos: repos.filter(r => !r.fork).length,
      totalStars: repos.reduce((sum, r) => sum + r.stargazers_count, 0),
      languages: [...new Set(repos.map(r => r.language).filter(Boolean))],
      pinnedRepos: graphqlData.data?.user?.pinnedItems?.nodes || [],
      totalContributions: graphqlData.data?.user?.contributionsCollection?.contributionCalendar?.totalContributions || 0,
    };
  } catch (e) {
    console.warn('GitHub fetch failed:', e.message);
    return null;
  }
}

async function fetchCPData() {
  const cpData = {};
  
  try {
    // LeetCode
    const lcRes = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query getUserProfile($username: String!) {
            matchedUser(username: $username) {
              submitStats: submitStatsGlobal {
                acSubmissionNum {
                  difficulty
                  count
                  submissions
                }
              }
              profile {
                ranking
                reputation
              }
            }
          }
        `,
        variables: { username: 'Nalindalal2004' }
      })
    });
    const lcData = await lcRes.json();
    if (lcData.data?.matchedUser) {
      const stats = lcData.data.matchedUser.submitStats.acSubmissionNum;
      const total = stats.find(s => s.difficulty === 'All')?.count || 0;
      cpData.leetcode = { total, ranking: lcData.data.matchedUser.profile?.ranking };
    }
  } catch (e) {
    console.warn('LeetCode fetch failed:', e.message);
  }
  
  try {
    // Codeforces
    const cfRes = await fetch('https://codeforces.com/api/user.info?handles=nalindalal2004');
    const cfData = await cfRes.json();
    if (cfData.status === 'OK' && cfData.result[0]) {
      const user = cfData.result[0];
      cpData.codeforces = {
        rating: user.rating,
        maxRating: user.maxRating,
        rank: user.rank,
        title: user.title,
      };
    }
  } catch (e) {
    console.warn('Codeforces fetch failed:', e.message);
  }
  
  return cpData;
}

function parseAIResponse(text) {
  try {
    const cleaned = text
      .replace(/```ya?ml\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();
    const match = cleaned.match(/([\s\S]*?)(?:\n---|\n\.\.\.|$)/);
    return yamlLoad(match ? match[1] : cleaned);
  } catch (e) {
    console.error('Failed to parse AI response as YAML:', e.message);
    console.error('Raw response:', text.substring(0, 500));
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const enrich = args.includes('--enrich');
  const customFile = args.find(a => !a.startsWith('--'));
  
  const resumePath = customFile ? resolve(ROOT, customFile) : resolve(ROOT, 'config/resume.md');
  
  if (!existsSync(resumePath)) {
    console.error(`Resume not found: ${resumePath}`);
    process.exit(1);
  }
  
  console.log('📄 Reading master resume...');
  const resumeContent = readFileSync(resumePath, 'utf-8');
  const sections = parseResumeSections(resumeContent);
  
  // Extract structured data
  const skills = extractSkillsFromResume(sections);
  const projects = extractProjects(sections);
  const experience = extractExperience(sections);
  
  console.log(`   Skills categories: ${Object.keys(skills).filter(k => skills[k].length > 0).join(', ')}`);
  console.log(`   Projects found: ${projects.length}`);
  console.log(`   Experience entries: ${experience.length}`);
  
  let githubData = null;
  let cpData = null;
  
  if (enrich) {
    console.log('🌐 Fetching GitHub data...');
    githubData = await fetchGitHubData();
    if (githubData) {
      console.log(`   Public repos: ${githubData.publicRepos}, Stars: ${githubData.totalStars}, Contributions: ${githubData.totalContributions}`);
    }
    
    console.log('🏆 Fetching competitive programming data...');
    cpData = await fetchCPData();
    if (cpData.leetcode) console.log(`   LeetCode: ${cpData.leetcode.total} solved`);
    if (cpData.codeforces) console.log(`   Codeforces: ${cpData.codeforces.rating} (${cpData.codeforces.rank})`);
  }
  
  console.log('🤖 Generating profile with AI...');
  
  const prompt = `Parse this master resume and generate a JobOps profile.yml. Return ONLY valid YAML.

RESUME SECTIONS:
${Object.entries(sections).map(([k, v]) => `## ${k}\n${v.substring(0, 3000)}`).join('\n\n')}

EXTRACTED STRUCTURED DATA:
Skills: ${JSON.stringify(skills, null, 2)}
Projects: ${JSON.stringify(projects.slice(0, 8), null, 2)}
Experience: ${JSON.stringify(experience, null, 2)}
${githubData ? `GitHub: ${JSON.stringify(githubData, null, 2)}` : ''}
${cpData ? `Competitive Programming: ${JSON.stringify(cpData, null, 2)}` : ''}

Extract and structure as follows (all fields optional but provide what you can):

candidate:
  name: "Nalin Dalal"
  email: "nalindalal2004@gmail.com"
  phone: "+91 7440620675"
  location: "Bhopal, India"
  linkedin: "linkedin.com/in/nalin-dalal/"
  github: "github.com/NalinDalal"
  leetcode: "leetcode.com/Nalindalal2004/"
  codeforces: "codeforces.com/profile/nalindalal2004"
  portfolio: "nalin.nerdev.in"

skills:
  languages: []
  frameworks: []
  databases: []
  devops: []
  tools: []

target_roles:
  - Software Engineer
  - Full Stack Developer
  - Backend Engineer
  - Systems Engineer
  - DevOps Engineer

target_locations:
  - India
  - Remote
  - US
  - Europe
  - Canada

experience:
  level: "Junior/Entry"
  years: "0-2"
  open_source: true
  competitive_programming: true

preferences:
  remote: true
  salary_range: "Negotiable"
  company_size: "Any"
  company_type:
    - Startup
    - Mid-size
    - Big Tech

autonomy_level: "review-each"

location_preferences:
  positive:
    - India
    - Remote
  negative: []`;

  const yamlOutput = await cfAI(prompt);
  const profile = parseAIResponse(yamlOutput);
  
  if (!profile) {
    console.error('Failed to generate valid profile');
    process.exit(1);
  }

  // Ensure output directory exists
  const configDir = resolve(ROOT, 'config');
  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });

  const outputPath = resolve(configDir, 'profile.yml');
  const yamlString = yamlDump(profile, { lineWidth: 120, noRefs: true });
  
  writeFileSync(outputPath, yamlString);
  console.log(`\n✅ Profile generated: ${outputPath}`);
  console.log('\n📋 Review the generated profile and adjust as needed.');
  console.log('   Key fields to verify: target_roles, skills, experience.level, target_locations');
}

main().catch(e => {
  console.error(`Profile generation failed: ${e.message}`);
  process.exit(1);
});