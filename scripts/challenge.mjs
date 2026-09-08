#!/usr/bin/env node

/**
 * challenge.mjs — 30-day job hunting challenge tracker
 * 10 companies/day × 30 days = 300 direct outreach.
 *
 * Usage:
 *   node scripts/challenge.mjs                  — Show today's progress
 *   node scripts/challenge.mjs log "Stripe"     — Log a company outreach
 *   node scripts/challenge.mjs stats            — Overall stats
 *   node scripts/challenge.mjs reset            — Reset challenge (start fresh)
 *   node scripts/challenge.mjs leaderboard      — See top approaches that worked
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CHALLENGE_PATH = resolve(ROOT, 'data/challenge.json');

function loadChallenge() {
  try {
    if (existsSync(CHALLENGE_PATH)) {
      return JSON.parse(readFileSync(CHALLENGE_PATH, 'utf-8'));
    }
  } catch {}
  return {
    startDate: new Date().toISOString().split('T')[0],
    goal: 300,
    dailyGoal: 10,
    days: {},
  };
}

function saveChallenge(data) {
  mkdirSync(resolve(ROOT, 'data'), { recursive: true });
  writeFileSync(CHALLENGE_PATH, JSON.stringify(data, null, 2));
}

function getToday() {
  return new Date().toISOString().split('T')[0];
}

function getDayNumber(startDate) {
  const start = new Date(startDate);
  const now = new Date();
  const diff = Math.floor((now - start) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, diff);
}

function showToday(data) {
  const today = getToday();
  const day = data.days[today] || { companies: [], emails: 0, linkedin: 0, calls: 0 };
  const dayNum = getDayNumber(data.startDate);
  const totalOutreach = Object.values(data.days).reduce((sum, d) => sum + (d.companies?.length || 0), 0);
  const daysActive = Object.keys(data.days).length;
  
  console.log(`\n Day ${dayNum}/30 — ${today}\n`);
  
  console.log(`   Today's progress: ${day.companies?.length || 0}/${data.dailyGoal} companies`);
  
  if (day.companies?.length > 0) {
    console.log('\n   Companies reached out to today:');
    day.companies.forEach(c => console.log(`      ${c.company} — ${c.method}`));
  }
  
  // Progress bar
  const progress = Math.min(1, (day.companies?.length || 0) / data.dailyGoal);
  const filled = Math.round(progress * 20);
  const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
  console.log(`\n   [${bar}] ${Math.round(progress * 100)}%`);
  
  console.log('\n   ───────────────────────────────────────');
  console.log(`    Overall: ${totalOutreach}/${data.goal} companies (${Math.round(totalOutreach/data.goal*100)}%)`);
  console.log(`    Days active: ${daysActive}/30`);
  console.log(`    Avg/day: ${(totalOutreach/Math.max(1, daysActive)).toFixed(1)}`);
  
  // Estimate completion
  const remaining = data.goal - totalOutreach;
  const daysLeft = 30 - dayNum;
  const neededPerDay = remaining / Math.max(1, daysLeft);
  
  if (daysLeft > 0) {
    console.log(`\n    ${remaining} companies left, ${daysLeft} days remaining`);
    console.log(`    Need ${neededPerDay.toFixed(1)} per day to hit goal`);
    
    if (neededPerDay > data.dailyGoal) {
      console.log(`     You're behind pace! Consider increasing daily outreach.`);
    } else {
      console.log(`    On track! Keep it up.`);
    }
  } else {
    console.log(`\n    Challenge complete!`);
    console.log(`    Final score: ${totalOutreach}/${data.goal} companies`);
  }
}

function showStats(data) {
  const totalOutreach = Object.values(data.days).reduce((sum, d) => sum + (d.companies?.length || 0), 0);
  const totalEmails = Object.values(data.days).reduce((sum, d) => sum + (d.emails || 0), 0);
  const totalLinkedin = Object.values(data.days).reduce((sum, d) => sum + (d.linkedin || 0), 0);
  const totalCalls = Object.values(data.days).reduce((sum, d) => sum + (d.calls || 0), 0);
  const daysActive = Object.keys(data.days).length;
  const dayNum = getDayNumber(data.startDate);
  
  console.log(`\n Challenge Stats (Day ${dayNum}/30)\n`);
  console.log('   Metric                    Value');
  console.log('   ─────────────────────────────────');
  console.log(`   Total companies reached    ${totalOutreach}/${data.goal}`);
  console.log(`   Direct emails sent         ${totalEmails}`);
  console.log(`   LinkedIn DMs sent          ${totalLinkedin}`);
  console.log(`   Calls scheduled            ${totalCalls}`);
  console.log(`   Days active                ${daysActive}/30`);
  console.log(`   Avg per day                ${(totalOutreach/Math.max(1, daysActive)).toFixed(1)}`);
  
  // Funnel estimate
  const responseRate = 0.15;
  const interviewRate = 0.3;
  const responses = Math.round(totalOutreach * responseRate);
  const interviews = Math.round(responses * interviewRate);
  const offers = Math.round(interviews * 0.3);
  
  console.log('\n    Estimated funnel (15% response rate):');
  console.log(`      ${totalOutreach} outreach → ${responses} responses → ${interviews} interviews → ${offers} offers`);
  
  // Best methods
  const methods = {};
  Object.values(data.days).forEach(d => {
    d.companies?.forEach(c => {
      methods[c.method] = (methods[c.method] || 0) + 1;
    });
  });
  
  if (Object.keys(methods).length > 0) {
    console.log('\n    Best outreach methods:');
    Object.entries(methods)
      .sort(([,a], [,b]) => b - a)
      .forEach(([method, count]) => {
        console.log(`      ${method}: ${count}`);
      });
  }
  
  // Daily breakdown
  console.log('\n    Daily breakdown:');
  Object.entries(data.days)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 7)
    .forEach(([date, d]) => {
      console.log(`      ${date}: ${d.companies?.length || 0} companies`);
    });
}

function logCompany(data, company, method = 'email') {
  const today = getToday();
  if (!data.days[today]) {
    data.days[today] = { companies: [], emails: 0, linkedin: 0, calls: 0 };
  }
  
  data.days[today].companies.push({
    company,
    method,
    time: new Date().toISOString(),
  });
  
  if (method === 'email') data.days[today].emails++;
  if (method === 'linkedin') data.days[today].linkedin++;
  if (method === 'call') data.days[today].calls++;
  
  saveChallenge(data);
  
  const dayTotal = data.days[today].companies.length;
  console.log(`\n Logged: ${company} (${method})`);
  console.log(`   Today: ${dayTotal}/${data.dailyGoal} companies`);
  
  if (dayTotal >= data.dailyGoal) {
    console.log(`\n Daily goal reached! Great work today.`);
  }
}

function resetChallenge(data) {
  data.startDate = getToday();
  data.days = {};
  saveChallenge(data);
  console.log(`\n Challenge reset! Starting fresh from ${data.startDate}`);
}

const args = process.argv.slice(2);
const command = args[0] || 'today';

const data = loadChallenge();

switch (command) {
  case 'today':
    showToday(data);
    break;
  case 'log':
    if (!args[1]) {
      console.error('Usage: node scripts/challenge.mjs log "Company" [method]');
      console.error('Methods: email, linkedin, call');
      process.exit(1);
    }
    logCompany(data, args[1], args[2] || 'email');
    break;
  case 'stats':
    showStats(data);
    break;
  case 'reset':
    resetChallenge(data);
    break;
  default:
    showToday(data);
}
