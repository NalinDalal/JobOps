#!/usr/bin/env node

/**
 * habits.mjs — Daily habit tracker for job hunting
 * Tracks applications, DMs, outreach, and learning streaks.
 *
 * Usage:
 *   node scripts/habits.mjs                    — Show today's habits
 *   node scripts/habits.mjs log apply          — Log an application
 *   node scripts/habits.mjs log dm             — Log a recruiter DM
 *   node scripts/habits.mjs log outreach       — Log a company outreach
 *   node scripts/habits.mjs log learn "topic"  — Log 30min learning
 *   node scripts/habits.mjs log linkedin       — Log a LinkedIn post
 *   node scripts/habits.mjs log project        — Log portfolio project work
 *   node scripts/habits.mjs week               — Show this week's summary
 *   node scripts/habits.mjs streak             — Show current streak
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SEVEN_DAYS_MS, RESPONSE_RATE, INTERVIEW_RATE } from './lib/constants.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const HABITS_PATH = resolve(ROOT, 'data/habits.json');

const DAILY_GOALS = {
  apply: 10,
  dm: 1,
  outreach: 5,
  learn: 1,
  linkedin: 0.14, // 1 per week
  project: 0.033, // 1 per month
};

const HABIT_LABELS = {
  apply: 'Apply to roles',
  dm: 'DM a recruiter/founder',
  outreach: 'Reach out to people at target companies',
  learn: 'Learn a skill (30 min)',
  linkedin: 'LinkedIn post',
  project: 'Portfolio project',
};

function loadHabits() {
  try {
    if (existsSync(HABITS_PATH)) {
      return JSON.parse(readFileSync(HABITS_PATH, 'utf-8'));
    }
  } catch (e) {
    console.warn(`Warning: Could not load habits data: ${e.message}`);
  }
  return { days: {} };
}

function saveHabits(data) {
  mkdirSync(resolve(ROOT, 'data'), { recursive: true });
  writeFileSync(HABITS_PATH, JSON.stringify(data, null, 2));
}

function todayKey() {
  return new Date().toISOString().split('T')[0];
}

function getDay(data, date) {
  if (!data.days[date]) {
    data.days[date] = {
      apply: 0,
      dm: 0,
      outreach: 0,
      learn: 0,
      linkedin: 0,
      project: 0,
      notes: [],
    };
  }
  return data.days[date];
}

function showToday(data) {
  const today = todayKey();
  const day = getDay(data, today);

  console.log(`\n ${today} — Daily Habits\n`);
  console.log('Habit                     Done    Goal    Status');
  console.log('─'.repeat(55));

  for (const [key, label] of Object.entries(HABIT_LABELS)) {
    const done = day[key] || 0;
    const goal = DAILY_GOALS[key];
    const pct = goal > 0 ? Math.min(100, Math.round((done / goal) * 100)) : done > 0 ? 100 : 0;
    const bar = pct >= 100 ? '✅' : pct >= 50 ? '🔶' : '⬜';
    const goalStr =
      key === 'learn' ? `${done}/1` : key === 'apply' ? `${done}/10` : `${done}/${Math.ceil(goal)}`;
    console.log(
      `${bar} ${label.padEnd(26)} ${String(done).padStart(4)}   ${goalStr.padEnd(6)}  ${pct}%`,
    );
  }

  if (day.notes.length > 0) {
    console.log(`\n Notes: ${day.notes.join(' | ')}`);
  }

  // Show what's left
  const remaining = [];
  if ((day.apply || 0) < DAILY_GOALS.apply)
    remaining.push(`${DAILY_GOALS.apply - day.apply} more applications`);
  if ((day.dm || 0) < DAILY_GOALS.dm) remaining.push(`${DAILY_GOALS.dm - day.dm} more DM`);
  if ((day.outreach || 0) < DAILY_GOALS.outreach)
    remaining.push(`${DAILY_GOALS.outreach - day.outreach} more outreach`);
  if ((day.learn || 0) < DAILY_GOALS.learn)
    remaining.push(`${DAILY_GOALS.learn - day.learn} more learning session`);

  if (remaining.length > 0) {
    console.log(`\n Still needed today:`);
    remaining.forEach((r) => console.log(`   • ${r}`));
  } else {
    console.log('\n All daily goals met! Great work.');
  }
}

function showWeek(data) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - SEVEN_DAYS_MS);

  const totals = {
    apply: 0,
    dm: 0,
    outreach: 0,
    learn: 0,
    linkedin: 0,
    project: 0,
  };
  const daysActive = new Set();

  for (const [date, day] of Object.entries(data.days)) {
    const d = new Date(date);
    if (d >= weekAgo && d <= now) {
      for (const key of Object.keys(totals)) {
        totals[key] += day[key] || 0;
      }
      daysActive.add(date);
    }
  }

  console.log("\n This Week's Summary\n");
  console.log('Habit                     Total   Goal    Status');
  console.log('─'.repeat(55));

  const weekGoals = {
    apply: DAILY_GOALS.apply * 7,
    dm: DAILY_GOALS.dm * 7,
    outreach: DAILY_GOALS.outreach * 7,
    learn: DAILY_GOALS.learn * 7,
    linkedin: 1,
    project: 0.25,
  };

  for (const [key, label] of Object.entries(HABIT_LABELS)) {
    const done = totals[key];
    const goal = weekGoals[key];
    const pct = goal > 0 ? Math.min(100, Math.round((done / goal) * 100)) : done > 0 ? 100 : 0;
    const bar = pct >= 100 ? '' : pct >= 50 ? '' : '';
    console.log(
      `${bar} ${label.padEnd(26)} ${String(done).padStart(4)}   ${String(Math.ceil(goal)).padEnd(6)}  ${pct}%`,
    );
  }

  console.log(`\n Days active: ${daysActive.size}/7`);

  // Funnel
  if (totals.apply > 0) {
    console.log(`\n Estimated funnel (at ${Math.round(RESPONSE_RATE * 100)}% response rate):`);
    console.log(
      `   ${totals.apply} applications → ~${Math.round(totals.apply * RESPONSE_RATE)} responses → ~${Math.round(totals.apply * RESPONSE_RATE * INTERVIEW_RATE)} interviews`,
    );
  }
}

function showStreak(data) {
  const dates = Object.keys(data.days).sort().reverse();
  if (dates.length === 0) {
    console.log('\n No habits logged yet. Start today!');
    return;
  }

  let streak = 0;
  let current = new Date();

  for (const date of dates) {
    const d = new Date(date);
    const diff = Math.floor((current - d) / (1000 * 60 * 60 * 24));

    if (diff <= 1) {
      const day = data.days[date];
      const total = Object.values(day).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
      if (total > 0) {
        streak++;
        current = d;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  console.log(`\n Current streak: ${streak} day${streak !== 1 ? 's' : ''}`);
  if (streak >= 7) console.log(' Amazing consistency!');
  else if (streak >= 3) console.log(' Keep it going!');
  else console.log(' Try to log something every day.');
}

// ─── Main ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const data = loadHabits();

if (args[0] === 'log' && args[1]) {
  const habit = args[1];
  const note = args.slice(2).join(' ');

  if (!HABIT_LABELS[habit]) {
    console.error(`Unknown habit: ${habit}`);
    console.error(`Valid habits: ${Object.keys(HABIT_LABELS).join(', ')}`);
    process.exit(1);
  }

  const today = todayKey();
  const day = getDay(data, today);
  day[habit] = (day[habit] || 0) + 1;
  if (note) day.notes.push(note);

  saveHabits(data);
  showToday(data);
} else if (args[0] === 'week') {
  showWeek(data);
} else if (args[0] === 'streak') {
  showStreak(data);
} else {
  showToday(data);
}
