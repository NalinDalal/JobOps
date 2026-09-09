/**
 * digest/renderer.ts — Renders DigestViewModel into HTML email
 *
 * Design: Linear/Apple-style daily briefing.
 * Whitespace as hierarchy. One accent color. No cards.
 * Score as visual anchor. Skills as compact tags.
 */

import type { DigestViewModel, DigestMatch } from "../domain/digest";
import type { OutreachGroup } from "../domain/outreach";
import type { SkillSignal } from "../domain/skill";
import { SCORE_STRONG, SCORE_REVIEW } from "../lib/constants";
import { escapeHtml } from "../lib/text";

// ─── Style tokens ─────────────────────────────────────────────

const S = {
    font: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
    accent: "#C76B16",
    textPrimary: "#1d1d1f",
    textSecondary: "#86868b",
    textTertiary: "#aeaeb2",
    textLink: "#0066cc",
    success: "#2d6a4f",
    danger: "#c41e3a",
    divider: "#e8e8ed",
    tagBg: "#f5f5f7",
    tagBorder: "#e0e0e5",
};

// ─── Component helpers ────────────────────────────────────────

function divider(): string {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0;">
  <tr><td style="padding:20px 0;border-top:1px solid ${S.divider};font-size:0;line-height:0;">&nbsp;</td></tr>
</table>`;
}

function sectionLabel(text: string): string {
    return `<p style="margin:0 0 12px;font-family:${S.font};font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${S.textTertiary};">${escapeHtml(text)}</p>`;
}

function skillTag(skill: string, missing: boolean = false): string {
    const bg = missing ? "transparent" : S.tagBg;
    const border = missing ? S.danger : S.tagBorder;
    const color = missing ? S.danger : S.textSecondary;
    const prefix = missing ? "× " : "";
    return `<span style="display:inline-block;background:${bg};border:1px solid ${border};border-radius:4px;padding:2px 8px;margin:0 6px 6px 0;font-family:${S.font};font-size:11px;color:${color};line-height:16px;">${prefix}${escapeHtml(skill)}</span>`;
}

// ─── 1. Header ────────────────────────────────────────────────

function renderHeader(vm: DigestViewModel): string {
    const roles =
        vm.profile.targetRoles.slice(0, 3).join(" · ") || "Software Engineer";
    const locations =
        vm.profile.targetLocations.slice(0, 2).join(" · ") || "Remote";

    return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">
    <tr>
      <td style="padding:20px 0 0;">
        <p style="margin:0 0 2px;font-family:${S.font};font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${S.textTertiary};">JobOps</p>
        <p style="margin:0 0 6px;font-family:${S.font};font-size:20px;font-weight:700;color:${S.textPrimary};line-height:1.2;">Your daily job briefing</p>
        <p style="margin:0 0 4px;font-family:${S.font};font-size:13px;color:${S.textSecondary};">${escapeHtml(vm.date.long)}</p>
        <p style="margin:0;font-family:${S.font};font-size:12px;color:${S.textTertiary};">${escapeHtml(roles)} · ${escapeHtml(locations)}</p>
      </td>
    </tr>
  </table>`;
}

// ─── 2. Summary ───────────────────────────────────────────────

function renderSummary(vm: DigestViewModel): string {
    const { summary } = vm;
    const parts = [`<strong>${summary.totalScanned}</strong> scanned`];
    if (summary.worthReviewing > 0) {
        parts.push(
            `<strong>${summary.worthReviewing}</strong> worth reviewing`,
        );
    }
    if (summary.strongMatches > 0) {
        parts.push(
            `<strong style="color:${S.success};">${summary.strongMatches}</strong> strong`,
        );
    } else {
        parts.push(`<strong>0</strong> strong matches`);
    }

    return `
  <p style="margin:0 0 20px;font-family:${S.font};font-size:14px;color:${S.textSecondary};line-height:1.5;">${parts.join(" · ")}</p>`;
}

// ─── 3. Primary match (detailed) ──────────────────────────────

function renderPrimaryMatch(match: DigestMatch | undefined): string {
    if (!match) return "";

    const matchedTags = match.matchedSkills
        .slice(0, 6)
        .map((s) => skillTag(s))
        .join("");

    const whyHtml =
        match.whyMatch.length > 0
            ? `<p style="margin:0;font-family:${S.font};font-size:13px;color:${S.textSecondary};line-height:1.5;">${match.whyMatch.join(". ")}.</p>`
            : "";

    const watchHtml =
        match.redFlags.length > 0
            ? `<p style="margin:10px 0 0;font-family:${S.font};font-size:12px;color:${S.danger};line-height:1.5;">
        <span style="font-weight:600;">Watch:</span> ${escapeHtml(match.redFlags.join(". "))}
      </p>`
            : "";

    const verdictColor =
        match.score.overall >= SCORE_STRONG
            ? S.success
            : match.score.overall >= SCORE_REVIEW
              ? S.accent
              : S.textSecondary;

    const label = match.label || "Highest-ranked";

    return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0;">
    <tr>
      <td>
        ${sectionLabel(label)}

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="vertical-align:top;width:52px;padding:0 14px 0 0;">
              <p style="margin:0;font-family:${S.font};font-size:22px;font-weight:700;color:${S.textPrimary};line-height:1;">${match.score.overall.toFixed(1)}</p>
              <p style="margin:1px 0 0;font-family:${S.font};font-size:11px;color:${S.textTertiary};">/5</p>
            </td>
            <td style="vertical-align:top;">
              <p style="margin:0 0 2px;font-family:${S.font};font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${verdictColor};">${escapeHtml(match.verdict)}</p>
              <p style="margin:0 0 2px;font-family:${S.font};font-size:16px;font-weight:600;color:${S.textPrimary};line-height:1.3;">
                <a href="${escapeHtml(match.url)}" style="color:${S.textLink};text-decoration:none;">${escapeHtml(match.title)}</a>
              </p>
              <p style="margin:0 0 8px;font-family:${S.font};font-size:14px;color:${S.textPrimary};">${escapeHtml(match.company)}</p>
              <p style="margin:0 0 10px;font-family:${S.font};font-size:12px;color:${S.textTertiary};">${escapeHtml(match.location)} · Posted ${escapeHtml(match.posted)}</p>

              ${matchedTags ? `<div style="margin:0 0 10px;">${matchedTags}</div>` : ""}
              ${whyHtml}
              ${watchHtml}

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 0;">
                <tr>
                  <td style="padding:0;">
                    <a href="${escapeHtml(match.url)}" style="display:inline-block;font-family:${S.font};font-size:13px;font-weight:600;color:#fff;background:${S.accent};padding:7px 16px;border-radius:6px;text-decoration:none;">View posting</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

// ─── 4. Other matches (compact) ───────────────────────────────

function renderOtherMatches(matches: DigestMatch[]): string {
    if (matches.length === 0) return "";

    const rows = matches.map((m) => {
        const verdictColor =
            m.score.overall >= SCORE_STRONG
                ? S.success
                : m.score.overall >= SCORE_REVIEW
                  ? S.accent
                  : S.textSecondary;

        const skillTags = m.matchedSkills
            .slice(0, 4)
            .map((s) => skillTag(s))
            .join("");

        return `
    <tr>
      <td style="padding:14px 0;border-top:1px solid ${S.divider};vertical-align:top;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="vertical-align:top;width:40px;padding:0 12px 0 0;">
              <p style="margin:0;font-family:${S.font};font-size:17px;font-weight:700;color:${S.textPrimary};line-height:1;">${m.score.overall.toFixed(1)}</p>
              <p style="margin:1px 0 0;font-family:${S.font};font-size:10px;color:${S.textTertiary};">/5</p>
            </td>
            <td style="vertical-align:top;">
              <p style="margin:0 0 1px;font-family:${S.font};font-size:14px;font-weight:600;color:${S.textPrimary};line-height:1.3;">
                <a href="${escapeHtml(m.url)}" style="color:${S.textLink};text-decoration:none;">${escapeHtml(m.title)}</a>
              </p>
              <p style="margin:0 0 4px;font-family:${S.font};font-size:13px;color:${S.textSecondary};">${escapeHtml(m.company)}</p>
              <p style="margin:0 0 6px;font-family:${S.font};font-size:11px;color:${S.textTertiary};">${escapeHtml(m.location)} · ${escapeHtml(m.posted)}${m.compensation ? ` · ${escapeHtml(m.compensation)}` : ""}</p>
              ${skillTags ? `<div style="margin:0 0 4px;">${skillTags}</div>` : ""}
              ${m.redFlags.length > 0 ? `<p style="margin:0;font-family:${S.font};font-size:11px;color:${S.danger};line-height:1.4;">${escapeHtml(m.redFlags[0])}</p>` : ""}
              ${m.recommendation && m.redFlags.length === 0 ? `<p style="margin:0;font-family:${S.font};font-size:11px;color:${S.textSecondary};line-height:1.4;">${escapeHtml(m.recommendation)}</p>` : ""}
            </td>
            <td style="vertical-align:top;text-align:right;white-space:nowrap;padding-left:12px;">
              <p style="margin:0;font-family:${S.font};font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${verdictColor};">${escapeHtml(m.verdict)}</p>
              <p style="margin:6px 0 0;"><a href="${escapeHtml(m.url)}" style="font-family:${S.font};font-size:11px;color:${S.textLink};text-decoration:underline;text-underline-offset:2px;">View</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
    });

    return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0;">
    <tr>
      <td>
        ${sectionLabel(`Other matches · ${matches.length}`)}
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          ${rows.join("")}
        </table>
      </td>
    </tr>
  </table>`;
}

// ─── 5. Outreach queue (lightweight) ──────────────────────────

function renderPeopleToContact(vm: DigestViewModel): string {
    if (vm.peopleToContact.length === 0) return "";

    const items = vm.peopleToContact.map((c) => {
        const titleLinks = c.peopleSearchUrls
            .slice(0, 3)
            .map(
                (u) =>
                    `<a href="${escapeHtml(u.url)}" style="font-family:${S.font};font-size:11px;color:${S.textLink};text-decoration:underline;text-underline-offset:2px;">${escapeHtml(u.title)}</a>`,
            )
            .join(" · ");

        const roleSummary =
            c.roleCount > 1
                ? `${c.roleCount} relevant roles`
                : c.roles[0] || "";

        return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:14px;">
      <tr>
        <td style="padding:14px 0 0;border-top:1px solid ${S.divider};">
          <p style="margin:0 0 2px;font-family:${S.font};font-size:14px;font-weight:600;color:${S.textPrimary};">${escapeHtml(c.company)}</p>
          <p style="margin:0 0 6px;font-family:${S.font};font-size:12px;color:${S.textSecondary};">${escapeHtml(roleSummary)}</p>
          <p style="margin:0 0 6px;font-family:${S.font};font-size:11px;color:${S.textTertiary};">${titleLinks}</p>
          <p style="margin:0;"><a href="${escapeHtml(c.peopleSearchUrls[0]?.url || "#")}" style="font-family:${S.font};font-size:12px;color:${S.textLink};text-decoration:underline;text-underline-offset:2px;">Find people →</a></p>
        </td>
      </tr>
    </table>`;
    });

    return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0;">
    <tr>
      <td>
        ${sectionLabel(`Outreach · ${vm.peopleToContact.length} companies`)}
        ${items.join("")}
      </td>
    </tr>
  </table>`;
}

// ─── 6. Skill gap (inline, no card) ───────────────────────────

function renderSkillGap(vm: DigestViewModel): string {
    if (!vm.skillGap) return "";
    const { skillGap } = vm;

    // Skip garbage terms
    const garbageTerms = [
        "software",
        "engineer",
        "development",
        "system",
        "platform",
        "data",
    ];
    if (garbageTerms.includes(skillGap.skill.toLowerCase())) return "";

    return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0;">
    <tr>
      <td style="padding:14px 0;border-top:1px solid ${S.divider};">
        ${sectionLabel("Skill signal")}
        <p style="margin:0;font-family:${S.font};font-size:13px;color:${S.textSecondary};line-height:1.5;">
          <strong style="color:${S.textPrimary};">${escapeHtml(skillGap.skill)}</strong> appeared in ${skillGap.frequency}% of relevant jobs.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;">
          <tr>
            <td style="padding:0 16px 0 0;">
              <p style="margin:0;font-family:${S.font};font-size:11px;color:${S.textTertiary};">Your profile</p>
              <p style="margin:2px 0 0;font-family:${S.font};font-size:12px;font-weight:600;color:${S.textPrimary};">${escapeHtml(skillGap.currentLevel)}</p>
            </td>
            <td>
              <p style="margin:0;font-family:${S.font};font-size:11px;color:${S.textTertiary};">Market demand</p>
              <p style="margin:2px 0 0;font-family:${S.font};font-size:12px;font-weight:600;color:${skillGap.marketDemand === "High" ? S.accent : S.textPrimary};">${escapeHtml(skillGap.marketDemand)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

// ─── 7. Footer ────────────────────────────────────────────────

function renderFooter(vm: DigestViewModel): string {
    const unscoredNote =
        vm.footer.unscoredCount > 0
            ? `<p style="margin:6px 0 0;font-family:${S.font};font-size:11px;color:${S.textTertiary};">${vm.footer.unscoredCount} additional jobs were not scored</p>`
            : "";

    return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0 0;">
    <tr>
      <td style="padding:16px 0 0;border-top:1px solid ${S.divider};">
        <p style="margin:0;font-family:${S.font};font-size:11px;color:${S.textTertiary};">JobOps · ${vm.footer.scanned} scanned · ${vm.footer.filtered} surfaced</p>
        ${unscoredNote}
      </td>
    </tr>
  </table>`;
}

// ─── Main render ──────────────────────────────────────────────

export function renderEmail(vm: DigestViewModel): string {
    const primaryMatch =
        vm.topMatches.length > 0 ? vm.topMatches[0] : undefined;
    const otherMatches = vm.topMatches.slice(1);

    const sections = [
        renderHeader(vm),
        renderSummary(vm),
        renderPrimaryMatch(primaryMatch),
        divider(),
        renderOtherMatches(otherMatches),
        divider(),
        renderPeopleToContact(vm),
        renderSkillGap(vm),
        renderFooter(vm),
    ].filter(Boolean);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>JobOps · Your daily job briefing</title>
  <style type="text/css">
    @media (prefers-color-scheme: dark) {
      body { background-color: #1c1c1e !important; }
      table { background-color: transparent !important; }
      td[style*="border-top:1px solid #e8e8ed"] { border-color: #3a3a3c !important; }
      td[style*="border:1px solid #e0e0e5"] { border-color: #3a3a3c !important; }
      p, span, strong { color: inherit !important; }
      p[style*="color:#1d1d1f"] { color: #f5f5f7 !important; }
      p[style*="color:#86868b"] { color: #98989d !important; }
      p[style*="color:#aeaeb2"] { color: #636366 !important; }
      a { color: #6ea8ff !important; }
      span[style*="background:#C76B16"] { background-color: #e8923a !important; }
      span[style*="color:#C76B16"] { color: #e8923a !important; }
      strong[style*="color:#C76B16"] { color: #e8923a !important; }
      span[style*="border:1px solid #c41e3a"] { border-color: #ef4444 !important; color: #ef4444 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f7;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;">
  <tr>
    <td style="padding:24px 28px 32px;">
      ${sections.join("\n")}
    </td>
  </tr>
</table>
</body>
</html>`;
}

// ─── Plain text version ───────────────────────────────────────

export function renderText(vm: DigestViewModel): string {
    const lines: string[] = [];
    lines.push("JOBOPS");
    lines.push("Your daily job briefing");
    lines.push(vm.date.long);
    lines.push("");

    // Summary
    const parts = [`${vm.summary.totalScanned} scanned`];
    if (vm.summary.worthReviewing > 0)
        parts.push(`${vm.summary.worthReviewing} worth reviewing`);
    if (vm.summary.strongMatches > 0)
        parts.push(`${vm.summary.strongMatches} strong`);
    else parts.push("0 strong matches");
    lines.push(parts.join(" · "));
    lines.push("");

    // Primary match
    if (vm.topMatches.length > 0) {
        const m = vm.topMatches[0]!;
        lines.push(m.label?.toUpperCase() || "HIGHEST-RANKED");
        lines.push("");
        lines.push(
            `  ${m.score.overall.toFixed(1)}/5  ${m.verdict.toUpperCase()}`,
        );
        lines.push(`  ${m.title}`);
        lines.push(`  ${m.company}`);
        lines.push(`  ${m.location} · Posted ${m.posted}`);
        if (m.matchedSkills.length > 0)
            lines.push(`  ${m.matchedSkills.join(" · ")}`);
        if (m.whyMatch.length > 0) lines.push(`  ${m.whyMatch.join(". ")}.`);
        if (m.redFlags.length > 0)
            lines.push(`  Watch: ${m.redFlags.join(". ")}`);
        lines.push(`  ${m.url}`);
        lines.push("");
    }

    // Other matches
    const otherMatches = vm.topMatches.slice(1);
    if (otherMatches.length > 0) {
        lines.push(`OTHER MATCHES · ${otherMatches.length}`);
        for (const m of otherMatches) {
            lines.push("");
            lines.push(
                `  ${m.score.overall.toFixed(1)}/5  ${m.title} · ${m.company}`,
            );
            lines.push(
                `  ${m.location} · ${m.posted}${m.compensation ? ` · ${m.compensation}` : ""}`,
            );
            if (m.matchedSkills.length > 0)
                lines.push(`  ${m.matchedSkills.join(" · ")}`);
            lines.push(`  ${m.url}`);
        }
        lines.push("");
    }

    // Outreach
    if (vm.peopleToContact.length > 0) {
        lines.push(`OUTREACH · ${vm.peopleToContact.length} companies`);
        for (const c of vm.peopleToContact) {
            lines.push("");
            lines.push(`  ${c.company}`);
            const roleSummary =
                c.roleCount > 1
                    ? `${c.roleCount} relevant roles`
                    : c.roles[0] || "";
            lines.push(`  ${roleSummary}`);
            lines.push(
                `  ${c.peopleSearchUrls.map((u) => `${u.title}: ${u.url}`).join("  ")}`,
            );
        }
        lines.push("");
    }

    // Skill gap
    if (vm.skillGap) {
        const garbageTerms = [
            "software",
            "engineer",
            "development",
            "system",
            "platform",
            "data",
        ];
        if (!garbageTerms.includes(vm.skillGap.skill.toLowerCase())) {
            lines.push("SKILL SIGNAL");
            lines.push("");
            lines.push(
                `  ${vm.skillGap.skill} appeared in ${vm.skillGap.frequency}% of relevant jobs.`,
            );
            lines.push(`  Your profile: ${vm.skillGap.currentLevel}`);
            lines.push(`  Market demand: ${vm.skillGap.marketDemand}`);
            lines.push("");
        }
    }

    // Footer
    lines.push("JOBOPS");
    lines.push(`${vm.footer.scanned} scanned · ${vm.footer.filtered} surfaced`);
    if (vm.footer.unscoredCount > 0) {
        lines.push(
            `${vm.footer.unscoredCount} additional jobs were not scored`,
        );
    }

    return lines.join("\n");
}
