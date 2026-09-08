/**
 * lib/digestRenderer.mjs — Renders DigestViewModel into HTML email
 *
 * Design language: compact product briefing, not newsletter.
 * Restrained typography, whitespace, subtle borders, one accent color,
 * strong hierarchy, minimal decoration.
 *
 * Sections:
 *   1. Header — "Your job briefing"
 *   2. Intelligence summary
 *   3. Top matches (compact cards with explainable scores)
 *   4. Action items ("Do this today")
 *   5. Skill gap intelligence
 *   6. People worth contacting
 *   7. Quiet footer
 */

import { SCORE_STRONG, SCORE_REVIEW } from './constants.mjs';

// ─── Style tokens ────────────────────────────────────────────────
const S = {
  font: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
  mono: '"SF Mono",SFMono-Regular,Menlo,Consolas,monospace',
  accent: '#0a0a0a',
  textPrimary: '#1d1d1f',
  textSecondary: '#86868b',
  textTertiary: '#aeaeb2',
  success: '#2d6a4f',
  successBg: '#edf5f0',
  warn: '#b45309',
  warnBg: '#fef3c7',
  danger: '#c41e3a',
  dangerBg: '#fef2f2',
  border: '#e5e5ea',
  borderLight: '#f0f0f2',
  bg: '#ffffff',
  bgAlt: '#fafafa',
  cardBg: '#ffffff',
  scoreStrong: '#2d6a4f',
  scoreReview: '#b45309',
  scoreWeak: '#86868b',
  pillStrong: '#1b4332',
  pillReview: '#92400e',
};

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Component helpers ───────────────────────────────────────────

function scoreBadge(score) {
  const bg =
    score >= SCORE_STRONG ? S.scoreStrong : score >= SCORE_REVIEW ? S.scoreReview : S.scoreWeak;
  return `<span style="display:inline-block;background:${bg};color:#fff;font-size:11px;font-weight:600;letter-spacing:0.02em;padding:2px 8px;border-radius:10px;line-height:16px;">${score.toFixed(1)}/5</span>`;
}

function verdictPill(verdict, score) {
  const bg =
    score >= SCORE_STRONG ? S.pillStrong : score >= SCORE_REVIEW ? S.pillReview : S.scoreWeak;
  return `<span style="display:inline-block;background:${bg};color:#fff;font-size:10px;font-weight:600;letter-spacing:0.04em;padding:2px 8px;border-radius:10px;line-height:16px;text-transform:uppercase;">${esc(verdict)}</span>`;
}

function metaDot() {
  return `&nbsp;<span style="color:${S.textTertiary};">&middot;</span>&nbsp;`;
}

function sectionLabel(text, color = S.textSecondary) {
  return `<p style="margin:0 0 8px;font-family:${S.font};font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${color};">${esc(text)}</p>`;
}

// ─── 1. Header ──────────────────────────────────────────────────

function renderHeader(vm) {
  const { date, profile, summary } = vm;
  const roles = profile.targetRoles.slice(0, 3).join(' · ') || 'Software Engineer';
  const locations = profile.targetLocations.slice(0, 3).join(' · ') || 'Remote';

  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;">
    <tr>
      <td style="padding:24px 0 0;">
        <p style="margin:0 0 4px;font-family:${S.font};font-size:13px;font-weight:600;color:${S.textSecondary};letter-spacing:0.06em;">JobOps</p>
        <p style="margin:0 0 12px;font-family:${S.font};font-size:22px;font-weight:700;color:${S.textPrimary};line-height:1.2;">Your job briefing</p>
        <p style="margin:0 0 4px;font-family:${S.font};font-size:14px;color:${S.textSecondary};">${esc(date.weekday)}, ${esc(date.monthDay)}</p>
        <p style="margin:0;font-family:${S.font};font-size:13px;color:${S.textTertiary};">${esc(roles)}</p>
        <p style="margin:2px 0 0;font-family:${S.font};font-size:13px;color:${S.textTertiary};">${esc(locations)}</p>
      </td>
    </tr>
  </table>`;
}

// ─── 2. Intelligence summary ────────────────────────────────────

function renderSummary(vm) {
  const { summary } = vm;

  function stat(label, value, color = S.textPrimary) {
    return `<td style="padding:0 16px 0 0;vertical-align:top;">
      <p style="margin:0;font-family:${S.font};font-size:20px;font-weight:700;color:${color};line-height:1;">${value}</p>
      <p style="margin:4px 0 0;font-family:${S.font};font-size:11px;color:${S.textSecondary};letter-spacing:0.02em;">${esc(label)}</p>
    </td>`;
  }

  const stats = [
    stat('scanned', summary.totalScanned),
    stat('strong', summary.strongMatches, S.scoreStrong),
    stat('review', summary.worthReviewing, S.scoreReview),
    stat('companies', summary.newCompanies),
  ];

  if (summary.withFlags > 0) {
    stats.push(stat('flags', summary.withFlags, S.danger));
  }

  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 28px;">
    <tr>
      <td style="padding:16px 20px;background:${S.bgAlt};border:1px solid ${S.borderLight};border-radius:12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>${stats.join('')}</tr>
        </table>
      </td>
    </tr>
  </table>`;
}

// ─── 3. Top match card ──────────────────────────────────────────

function renderMatchCard(match) {
  const { font } = S;

  // Role list (if multiple roles at same company)
  const roleListHtml =
    match.roleCount > 1
      ? `<p style="margin:6px 0 0;font-family:${font};font-size:12px;color:${S.textSecondary};">
          <span style="font-weight:600;color:${S.textPrimary};">${match.roleCount} open roles:</span>
          ${match.roleLinks.map((r) => `<a href="${esc(r.url)}" style="color:${S.accent};text-decoration:underline;text-underline-offset:2px;">${esc(r.title)}</a>`).join(' &middot; ')}
        </p>`
      : '';

  // Match reasons
  const matchReasons =
    match.whyMatch.length > 0
      ? `<p style="margin:8px 0 0;font-family:${font};font-size:12px;color:${S.textSecondary};line-height:1.5;">
          <span style="font-weight:600;color:${S.textPrimary};">Why you match:</span>
          ${match.whyMatch.join(' · ')}
        </p>`
      : '';

  // Skill tags
  const skillTags =
    match.matchedSkills.length > 0
      ? match.matchedSkills
          .map(
            (s) =>
              `<span style="display:inline-block;background:${S.bgAlt};border:1px solid ${S.border};border-radius:6px;padding:1px 6px;margin:0 4px 4px 0;font-family:${font};font-size:11px;color:${S.textSecondary};">${esc(s)}</span>`,
          )
          .join('')
      : '';

  // Dimension breakdown
  const dims = [
    { label: 'Role', value: match.score.roleFit },
    { label: 'Location', value: match.score.location },
    { label: 'Growth', value: match.score.growth },
    { label: 'Comp', value: match.score.compensation },
    { label: 'Culture', value: match.score.culture },
  ].filter((d) => d.value > 0);

  const dimHtml =
    dims.length > 0
      ? `<p style="margin:8px 0 0;font-family:${font};font-size:11px;color:${S.textSecondary};">
          ${dims.map((d) => `<span style="margin:0 6px 0 0;"><span style="color:${S.textTertiary};">${esc(d.label)}</span> ${d.value.toFixed(1)}</span>`).join('')}
        </p>`
      : '';

  // Red flags
  const flagsHtml =
    match.redFlags.length > 0
      ? `<p style="margin:8px 0 0;font-family:${font};font-size:12px;color:${S.danger};line-height:1.45;">
          <span style="font-weight:600;">Potential concern:</span>
          ${esc(match.redFlags.join(' · '))}
        </p>`
      : '';

  // Recommendation
  const recHtml = match.recommendation
    ? `<p style="margin:8px 0 0;font-family:${font};font-size:12px;font-style:italic;color:${S.textSecondary};line-height:1.45;">${esc(match.recommendation)}</p>`
    : '';

  // Compensation
  const compHtml = match.compensation
    ? `<span style="margin:0;font-family:${font};font-size:12px;font-weight:600;color:${S.success};">${esc(match.compensation)}</span>`
    : '';

  // Remote badge
  const remoteHtml = match.isRemote
    ? `<span style="display:inline-block;background:${S.successBg};color:${S.success};font-size:10px;font-weight:600;padding:1px 6px;border-radius:4px;text-transform:uppercase;letter-spacing:0.04em;">Remote</span>`
    : '';

  // Actions
  const actionsHtml = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 0;">
      <tr>
        <td style="padding:0 10px 0 0;">
          <a href="${esc(match.url)}" style="display:inline-block;font-family:${font};font-size:12px;font-weight:600;color:#fff;background:${S.accent};padding:6px 14px;border-radius:8px;text-decoration:none;">View posting</a>
        </td>
        <td style="padding:0 10px 0 0;">
          <a href="mailto:?subject=Application: ${esc(match.title)} at ${esc(match.company)}&body=${encodeURIComponent('I am applying for the ' + match.title + ' role at ' + match.company + '.')}" style="display:inline-block;font-family:${font};font-size:12px;color:${S.accent};border:1px solid ${S.border};padding:5px 14px;border-radius:8px;text-decoration:none;">Draft note</a>
        </td>
      </tr>
    </table>`;

  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:16px;">
    <tr>
      <td style="padding:16px 20px;background:${S.cardBg};border:1px solid ${S.border};border-radius:12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="vertical-align:top;">
              <p style="margin:0 0 4px;font-family:${font};font-size:15px;font-weight:600;color:${S.textPrimary};line-height:1.3;">
                <a href="${esc(match.url)}" style="color:${S.textPrimary};text-decoration:underline;text-underline-offset:3px;">${esc(match.company)}</a>
              </p>
              <p style="margin:0 0 6px;font-family:${font};font-size:13px;color:${S.textSecondary};">${esc(match.title)}</p>
            </td>
            <td style="vertical-align:top;text-align:right;white-space:nowrap;padding-left:12px;">
              ${scoreBadge(match.score.overall)}<br/>${verdictPill(match.verdict, match.score.overall)}
            </td>
          </tr>
        </table>
        <p style="margin:6px 0 0;font-family:${font};font-size:12px;color:${S.textTertiary};">
          ${esc(match.location)}${metaDot()}posted ${esc(match.posted)}${remoteHtml ? metaDot() + remoteHtml : ''}${compHtml ? metaDot() + compHtml : ''}
        </p>
        ${matchReasons}
        ${skillTags ? `<div style="margin:8px 0 0;">${skillTags}</div>` : ''}
        ${dimHtml}
        ${flagsHtml}
        ${recHtml}
        ${roleListHtml}
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:12px 0 0;">
          <tr><td style="border-top:1px solid ${S.borderLight};font-size:0;line-height:0;">&nbsp;</td></tr>
        </table>
        ${actionsHtml}
      </td>
    </tr>
  </table>`;
}

// ─── 4. Action items ────────────────────────────────────────────

function renderActions(vm) {
  if (vm.actions.length === 0) return '';

  const items = vm.actions
    .map(
      (a) => `
    <tr>
      <td style="padding:8px 0;vertical-align:top;width:28px;font-family:${S.font};font-size:16px;font-weight:700;color:${S.textTertiary};">${a.priority}</td>
      <td style="padding:8px 0;vertical-align:top;">
        <p style="margin:0;font-family:${S.font};font-size:13px;font-weight:600;color:${S.textPrimary};">
          <a href="${esc(a.url)}" style="color:${S.textPrimary};text-decoration:underline;text-underline-offset:2px;">${esc(a.label)}</a>
        </p>
        <p style="margin:2px 0 0;font-family:${S.font};font-size:12px;color:${S.textSecondary};">${esc(a.reason)}</p>
      </td>
    </tr>`,
    )
    .join('');

  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 28px;">
    <tr>
      <td style="padding:16px 20px;background:${S.bgAlt};border:1px solid ${S.borderLight};border-radius:12px;">
        ${sectionLabel('Your actions today')}
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          ${items}
        </table>
      </td>
    </tr>
  </table>`;
}

// ─── 5. Skill gap intelligence ──────────────────────────────────

function renderSkillGap(vm) {
  if (!vm.skillGap) return '';
  const { skillGap } = vm;

  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 28px;">
    <tr>
      <td style="padding:16px 20px;background:${S.bgAlt};border:1px solid ${S.borderLight};border-radius:12px;">
        ${sectionLabel('One skill worth improving')}
        <p style="margin:0 0 8px;font-family:${S.font};font-size:13px;color:${S.textPrimary};line-height:1.5;">
          <strong>${esc(skillGap.skill)}</strong> appeared in <strong>${skillGap.frequency}%</strong> of your relevant jobs this week.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px;">
          <tr>
            <td style="padding:0 12px 0 0;font-family:${S.font};font-size:12px;color:${S.textSecondary};">Your profile: <strong style="color:${S.textPrimary};">${esc(skillGap.currentLevel)}</strong></td>
            <td style="padding:0;font-family:${S.font};font-size:12px;color:${S.textSecondary};">Market demand: <strong style="color:${S.textPrimary};">${esc(skillGap.marketDemand)}</strong></td>
          </tr>
        </table>
        <p style="margin:0;font-family:${S.font};font-size:12px;color:${S.textSecondary};line-height:1.5;">${esc(skillGap.suggestion)}</p>
      </td>
    </tr>
  </table>`;
}

// ─── 6. People worth contacting ─────────────────────────────────

function renderPeopleToContact(vm) {
  if (vm.peopleToContact.length === 0) return '';

  const cards = vm.peopleToContact
    .map(
      (p) => `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:12px;">
      <tr>
        <td style="padding:12px 16px;background:${S.cardBg};border:1px solid ${S.border};border-radius:10px;">
          <p style="margin:0 0 4px;font-family:${S.font};font-size:13px;font-weight:600;color:${S.textPrimary};">${esc(p.company)}</p>
          <p style="margin:0 0 6px;font-family:${S.font};font-size:12px;color:${S.textSecondary};">Hiring for ${esc(p.roles.join(', '))}</p>
          <p style="margin:0 0 8px;font-family:${S.font};font-size:12px;color:${S.textSecondary};line-height:1.5;font-style:italic;">"${esc(p.suggestedAngle)}"</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              ${p.peopleSearchUrls
                .map(
                  (u) =>
                    `<td style="padding:0 6px 0 0;"><a href="${esc(u.url)}" style="font-family:${S.font};font-size:11px;color:${S.accent};text-decoration:underline;text-underline-offset:2px;">${esc(u.title)} →</a></td>`,
                )
                .join('')}
            </tr>
          </table>
        </td>
      </tr>
    </table>`,
    )
    .join('');

  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 28px;">
    <tr>
      <td>
        ${sectionLabel('People worth contacting')}
        ${cards}
      </td>
    </tr>
  </table>`;
}

// ─── 7. Footer ──────────────────────────────────────────────────

function renderFooter(vm) {
  const { footer } = vm;
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0 0;border-top:1px solid ${S.borderLight};">
    <tr>
      <td style="padding:20px 0 0;">
        <p style="margin:0 0 4px;font-family:${S.font};font-size:12px;color:${S.textTertiary};">JobOps · Local-first job intelligence</p>
        <p style="margin:0;font-family:${S.font};font-size:11px;color:${S.textTertiary};">${footer.scanned} scanned · ${footer.filtered} filtered · ${footer.delivered} delivered</p>
      </td>
    </tr>
  </table>`;
}

// ─── Main render ─────────────────────────────────────────────────

export function renderEmail(vm) {
  const sections = [
    renderHeader(vm),
    renderSummary(vm),
    vm.topMatches.length > 0
      ? sectionLabel(`Top matches · ${vm.topMatches.length}`, S.textPrimary)
      : '',
    ...vm.topMatches.map(renderMatchCard),
    renderActions(vm),
    renderSkillGap(vm),
    renderPeopleToContact(vm),
    renderFooter(vm),
  ].filter(Boolean);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>JobOps · Your job briefing</title>
  <style type="text/css">
    @media (prefers-color-scheme: dark) {
      body { background-color: #1c1c1e !important; }
      table { background-color: transparent !important; }
      td[style*="background:#ffffff"], td[style*="background:${S.bg}"] { background-color: #2c2c2e !important; }
      td[style*="background:#fafafa"], td[style*="background:${S.bgAlt}"] { background-color: #252526 !important; }
      td[style*="border:1px solid #e5e5ea"], td[style*="border:1px solid ${S.border}"] { border-color: #3a3a3c !important; }
      td[style*="border:1px solid #f0f0f2"], td[style*="border:1px solid ${S.borderLight}"] { border-color: #333 !important; }
      p[style*="color:#1d1d1f"] { color: #f5f5f7 !important; }
      p[style*="color:#86868b"] { color: #98989d !important; }
      p[style*="color:#aeaeb2"] { color: #636366 !important; }
      a[style*="color:#0a0a0a"] { color: #f5f5f7 !important; }
      span[style*="background:#2d6a4f"] { background-color: #34a853 !important; }
      span[style*="background:#b45309"] { background-color: #f59e0b !important; }
      span[style*="background:#1b4332"] { background-color: #166534 !important; }
      span[style*="background:#92400e"] { background-color: #b45309 !important; }
      td[style*="background:#edf5f0"] { background-color: #1a2e1a !important; }
      td[style*="background:#fef3c7"] { background-color: #2e2a1a !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f7;font-family:${S.font};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;background:${S.bg};">
  <tr>
    <td style="padding:24px 28px;">
      ${sections.join('\n')}
    </td>
  </tr>
</table>
</body>
</html>`;
}

// ─── Plain text version ──────────────────────────────────────────

export function renderText(vm) {
  const lines = [];
  lines.push(`JobOps · Your job briefing`);
  lines.push(`${vm.date.weekday}, ${vm.date.monthDay}`);
  lines.push(`${vm.profile.targetRoles.slice(0, 3).join(' · ')}`);
  lines.push(`${vm.profile.targetLocations.slice(0, 3).join(' · ')}`);
  lines.push('');

  // Summary
  lines.push(`Today`);
  lines.push(`  ${vm.summary.totalScanned} jobs scanned`);
  lines.push(`  ${vm.summary.strongMatches} strong matches`);
  lines.push(`  ${vm.summary.worthReviewing} worth reviewing`);
  lines.push(`  ${vm.summary.newCompanies} new companies`);
  if (vm.summary.withFlags > 0) lines.push(`  ${vm.summary.withFlags} with red flags`);
  lines.push('');

  // Top matches
  if (vm.topMatches.length > 0) {
    lines.push(`Top matches`);
    for (const m of vm.topMatches) {
      lines.push(``);
      lines.push(`  #${m.rank} ${m.company} — ${m.title}`);
      lines.push(`     ${m.score.overall.toFixed(1)}/5 · ${m.verdict}`);
      lines.push(`     ${m.location} · posted ${m.posted}`);
      if (m.isRemote) lines.push(`     Remote`);
      if (m.compensation) lines.push(`     ${m.compensation}`);
      if (m.whyMatch.length > 0) lines.push(`     Why: ${m.whyMatch.join(' · ')}`);
      if (m.redFlags.length > 0) lines.push(`     Concern: ${m.redFlags.join(' · ')}`);
      lines.push(`     ${m.url}`);
    }
    lines.push('');
  }

  // Actions
  if (vm.actions.length > 0) {
    lines.push(`Your actions today`);
    for (const a of vm.actions) {
      lines.push(`  ${a.priority}. ${a.label} — ${a.reason}`);
    }
    lines.push('');
  }

  // Skill gap
  if (vm.skillGap) {
    lines.push(`One skill worth improving`);
    lines.push(
      `  ${vm.skillGap.skill} appeared in ${vm.skillGap.frequency}% of your relevant jobs.`,
    );
    lines.push(
      `  Your profile: ${vm.skillGap.currentLevel} · Market demand: ${vm.skillGap.marketDemand}`,
    );
    lines.push(`  ${vm.skillGap.suggestion}`);
    lines.push('');
  }

  // People
  if (vm.peopleToContact.length > 0) {
    lines.push(`People worth contacting`);
    for (const p of vm.peopleToContact) {
      lines.push(`  ${p.company} — ${p.roles.join(', ')}`);
      for (const u of p.peopleSearchUrls) {
        lines.push(`    ${u.title}: ${u.url}`);
      }
    }
    lines.push('');
  }

  lines.push(`JobOps · Local-first job intelligence`);
  lines.push(
    `${vm.footer.scanned} scanned · ${vm.footer.filtered} filtered · ${vm.footer.delivered} delivered`,
  );

  return lines.join('\n');
}
