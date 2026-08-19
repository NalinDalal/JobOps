#!/usr/bin/env node

/**
 * lib/profile.mjs — Shared profile loader for JobOps
 *
 * Loads the active profile from config/profiles/active.json,
 * falling back to config/profile.yml if no active preset is set.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { load as yamlLoad } from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PROFILES_DIR = resolve(ROOT, 'config/profiles');
const ACTIVE_PATH = resolve(PROFILES_DIR, 'active.json');
const FALLBACK_PATH = resolve(ROOT, 'config/profile.yml');

function loadYaml(path) {
  try {
    if (!existsSync(path)) return {};
    return yamlLoad(readFileSync(path, 'utf-8')) || {};
  } catch (e) {
    return {};
  }
}

function loadActiveSlug() {
  try {
    if (existsSync(ACTIVE_PATH)) {
      const raw = readFileSync(ACTIVE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed?.slug && typeof parsed.slug === 'string') return parsed.slug.trim();
    }
  } catch {}
  return null;
}

export function loadActiveProfile() {
  const slug = loadActiveSlug();
  if (slug) {
    const presetPath = resolve(PROFILES_DIR, `${slug}.yaml`);
    if (existsSync(presetPath)) {
      return { source: 'preset', slug, data: loadYaml(presetPath) };
    }
  }
  const fallback = loadYaml(FALLBACK_PATH);
  return { source: 'fallback', slug: null, data: fallback };
}

export function getProfileSkills(profile) {
  const data = profile.data;
  const skills = data.skills || {};
  const cat = (...keys) => keys.flatMap(k => skills[k] || []).filter(Boolean);
  const join = arr => arr.map(String).join(', ');
  return join(cat('languages', 'frameworks', 'databases', 'devops', 'tools'));
}

export function getProfileTargetRoles(profile) {
  return (profile.data.target_roles || []).map(r => String(r).trim()).filter(Boolean);
}

export function getProfileTargetLocations(profile) {
  return (profile.data.target_locations || []).map(String).filter(Boolean);
}

export function getProfileExperience(profile) {
  const exp = profile.data.experience || {};
  const yrs = exp.years ? ` (${exp.years} years)` : '';
  return `${exp.level || ''}${yrs}`.trim();
}

export function getProfileCandidate(profile) {
  return profile.data.candidate || {};
}

export function getProfilePreferences(profile) {
  return profile.data.preferences || {};
}

export function getProfileOutreach(profile) {
  return profile.data.outreach || {};
}

export function getProfileAutonomyLevel(profile) {
  return profile.data.autonomy_level || 'review-each';
}

export function getActiveProfileSlug() {
  return loadActiveSlug();
}

export function setActiveProfile(slug) {
  mkdirSync(resolve(ROOT, 'config/profiles'), { recursive: true });
  writeFileSync(ACTIVE_PATH, JSON.stringify({ slug }, null, 2));
}

import { mkdirSync, writeFileSync } from 'fs';
