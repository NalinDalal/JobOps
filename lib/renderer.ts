/**
 * lib/renderer.ts — Daily briefing email (editorial, not carded)
 *
 * Skillset: house-style + craft-floor + ui-core/build
 * - No eyebrow (craft-floor ban). Headings speak.
 * - Whitespace separates, not cards. One card only (featured).
 * - One accent (#111), neutral 9-stop, 4.5:1 contrast, system font.
 * - Type: -0.02em display, 0.14em small caps only for brand, 65ch measure.
 * - Mobile: stats 2+2, list full-width.
 */

import type { DigestViewModel, DigestMatch } from "./types";
import { SCORE_STRONG, SCORE_REVIEW } from "./constants";
import { escapeHtml } from "./text";

const F =
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';
const S = {
    bg: "#f5f5f7",
    card: "#ffffff",
    ink: "#111111",
    body: "#2b2b2e",
    muted: "#6e6e73",
    faint: "#6e6e73", // was #86868b — darkened to pass 4.5:1 on bg
    line: "#e8e8ed",
    subLine: "#f0f0f3",
    accent: "#111111",
    success: "#1a7f37",
    warn: "#925400",
    danger: "#b42318",
    tagBg: "#f2f2f5",
    tagBd: "#e8e8ec",
    r: "10px",
};

// ── tiny atoms ──

function tinyLabel(text: string): string {
    // craft-floor: no eyebrow above heading — this is only for brand + stats, not section headings
    return `<p style="margin:0;font-family:${F};font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${S.faint};">${escapeHtml(text)}</p>`;
}

function sectionTitle(text: string): string {
    // UI-core Typography: headline max 2 lines, no eyebrow, weight 600, no uppercase tracking spam
    return `<p style="margin:0 0 14px;font-family:${F};font-size:13px;font-weight:600;color:${S.ink};line-height:1.3;letter-spacing:-0.01em;">${escapeHtml(text)}</p>`;
}

function hairline(): string {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0;"><tr><td style="border-top:1px solid ${S.line};line-height:1px;font-size:0;padding:0;">&nbsp;</td></tr></table>`;
}

function tag(text: string): string {
    return `<span style="display:inline-block;background:${S.tagBg};border:1px solid ${S.tagBd};border-radius:999px;padding:2px 8px;margin:0 5px 5px 0;font-family:${F};font-size:11px;font-weight:500;color:${S.muted};line-height:14px;white-space:nowrap;">${escapeHtml(text)}</span>`;
}

function scoreBadge(v: number): string {
    const color =
        v >= SCORE_STRONG ? S.success : v >= SCORE_REVIEW ? S.warn : S.muted;
    const bg =
        v >= SCORE_STRONG ? "#dcfce7" : v >= SCORE_REVIEW ? "#fef3c7" : S.tagBg;
    return `<span style="display:inline-block;background:${bg};border-radius:999px;padding:3px 8px;font-family:${F};font-size:11px;font-weight:700;color:${color};letter-spacing:0.01em;">${v.toFixed(1)} / 5</span>`;
}

function verdictText(v: string, score: number): string {
    const color =
        score >= SCORE_STRONG
            ? S.success
            : score >= SCORE_REVIEW
              ? S.warn
              : S.muted;
    return `<span style="font-family:${F};font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${color};">${escapeHtml(v)}</span>`;
}

// ── sections ──

function header(vm: DigestViewModel): string {
    const roles =
        vm.profile.targetRoles.slice(0, 2).join(" · ") || "Software Engineer";
    const locs =
        vm.profile.targetLocations.slice(0, 2).join(" · ") || "Remote · India";
    return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:0 0 22px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="vertical-align:bottom;">
            ${tinyLabel("JobOps")}
            <p style="margin:5px 0 0;font-family:${F};font-size:24px;font-weight:700;color:${S.ink};line-height:1.1;letter-spacing:-0.025em;">Daily briefing</p>
          </td>
          <td style="vertical-align:bottom;text-align:right;padding-left:16px;">
            <p style="margin:0;font-family:${F};font-size:11px;color:${S.muted};white-space:nowrap;">${escapeHtml(vm.date.long)}</p>
            <p style="margin:2px 0 0;font-family:${F};font-size:11px;color:${S.faint};">${escapeHtml(vm.date.short)}</p>
          </td>
        </tr>
      </table>
      <p style="margin:12px 0 0;font-family:${F};font-size:12px;color:${S.muted};line-height:1.5;max-width:65ch;">${escapeHtml(roles)} <span style="color:${S.line};">·</span> ${escapeHtml(locs)}</p>
    </td></tr>
  </table>`;
}

function stats(vm: DigestViewModel): string {
    const s = vm.summary;
    // editorial: no card, no border-radius, just numbers with hairline separators
    const strongColor = s.strongMatches > 0 ? S.success : S.ink;
    const reviewColor = s.worthReviewing > 0 ? S.ink : S.muted;
    return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
    <tr><td style="padding:0;">
      ${hairline()}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0;">
        <tr>
          <td style="width:25%;text-align:center;padding:6px 4px;">
            <p style="margin:0;font-family:${F};font-size:22px;font-weight:700;color:${S.ink};line-height:1;letter-spacing:-0.02em;">${s.totalScanned}</p>
            <p style="margin:6px 0 0;font-family:${F};font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${S.faint};">Scanned</p>
          </td>
          <td style="width:1px;background:${S.line};font-size:0;line-height:0;padding:0;">&nbsp;</td>
          <td style="width:25%;text-align:center;padding:6px 4px;">
            <p style="margin:0;font-family:${F};font-size:22px;font-weight:700;color:${S.ink};line-height:1;letter-spacing:-0.02em;">${s.freshCount}</p>
            <p style="margin:6px 0 0;font-family:${F};font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${S.faint};">Fresh</p>
          </td>
          <td style="width:1px;background:${S.line};font-size:0;line-height:0;padding:0;">&nbsp;</td>
          <td style="width:25%;text-align:center;padding:6px 4px;">
            <p style="margin:0;font-family:${F};font-size:22px;font-weight:700;color:${strongColor};line-height:1;letter-spacing:-0.02em;">${s.strongMatches}</p>
            <p style="margin:6px 0 0;font-family:${F};font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${S.faint};">Strong</p>
          </td>
          <td style="width:1px;background:${S.line};font-size:0;line-height:0;padding:0;">&nbsp;</td>
          <td style="width:25%;text-align:center;padding:6px 4px;">
            <p style="margin:0;font-family:${F};font-size:22px;font-weight:700;color:${reviewColor};line-height:1;letter-spacing:-0.02em;">${s.worthReviewing}</p>
            <p style="margin:6px 0 0;font-family:${F};font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${S.faint};">To review</p>
          </td>
        </tr>
      </table>
      ${hairline()}
    </td></tr>
  </table>`;
}

function featured(m: DigestMatch | undefined): string {
    if (!m) return "";
    const tags = m.matchedSkills.slice(0, 5).map(tag).join("");
    const why = m.whyMatch.length
        ? `<p style="margin:10px 0 0;font-family:${F};font-size:12px;color:${S.muted};line-height:1.6;">${escapeHtml(m.whyMatch.join(" · "))}</p>`
        : "";
    const warn = m.redFlags.length
        ? `<p style="margin:10px 0 0;font-family:${F};font-size:11px;color:${S.danger};line-height:1.6;"><span style="font-weight:700;">Watch —</span> ${escapeHtml(m.redFlags.join(" · "))}</p>`
        : "";
    const posted = m.posted !== "Unknown" ? ` · ${escapeHtml(m.posted)}` : "";
    const comp = m.compensation ? ` · ${escapeHtml(m.compensation)}` : "";
    return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
    <tr><td>
      ${sectionTitle(m.label === "Top match" ? "Featured" : m.label || "Featured")}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${S.card};border:1px solid ${S.line};border-radius:${S.r};overflow:hidden;">
        <tr><td style="padding:20px 20px 18px;">
          <p style="margin:0 0 10px;">${scoreBadge(m.score.overall)} <span style="margin-left:10px;">${verdictText(m.verdict, m.score.overall)}</span></p>
          <p style="margin:0;font-family:${F};font-size:17px;font-weight:700;color:${S.ink};line-height:1.3;letter-spacing:-0.01em;">${escapeHtml(m.title)}</p>
          <p style="margin:4px 0 0;font-family:${F};font-size:13px;font-weight:500;color:${S.body};">${escapeHtml(m.company)}</p>
          <p style="margin:8px 0 0;font-family:${F};font-size:11px;color:${S.faint};">${escapeHtml(m.location)}${posted}${comp}</p>
          ${tags ? `<div style="margin:14px 0 0;">${tags}</div>` : ""}
          ${why}
          ${warn}
          ${m.snippet ? `<p style="margin:14px 0 0;font-family:${F};font-size:12.5px;color:${S.body};line-height:1.65;max-width:65ch;">${escapeHtml(m.snippet)}</p>` : ""}
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 0;">
            <tr>
              <td>
                <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${S.accent}" style="border-radius:8px;padding:10px 16px;"><![endif]-->
                <a href="${escapeHtml(m.url)}" style="display:inline-block;font-family:${F};font-size:12px;font-weight:600;color:#ffffff;background:${S.accent};padding:10px 16px;border-radius:8px;text-decoration:none;mso-padding-alt:10px 16px;">View posting →</a>
                <!--[if mso]></td></tr></table><![endif]-->
              </td>
              <td style="padding-left:14px;"><a href="${escapeHtml(m.url)}" style="font-family:${F};font-size:12px;color:${S.muted};text-decoration:underline;">Details</a></td>
            </tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>`;
}

function listSection(matches: DigestMatch[]): string {
    if (!matches.length) return "";
    const rows = matches
        .map((m) => {
            const tags = m.matchedSkills.slice(0, 3).map(tag).join("");
            const flag = m.redFlags.length
                ? `<p style="margin:8px 0 0;font-family:${F};font-size:11px;color:${S.danger};line-height:1.5;">${escapeHtml(m.redFlags[0]!)}</p>`
                : "";
            const comp = m.compensation
                ? ` · ${escapeHtml(m.compensation)}`
                : "";
            return `
      <tr>
        <td style="padding:16px 0;border-top:1px solid ${S.subLine};vertical-align:top;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="vertical-align:top;width:42px;padding-right:12px;">
                <p style="margin:0;font-family:${F};font-size:13px;font-weight:700;color:${S.ink};letter-spacing:-0.01em;">${m.score.overall.toFixed(1)}</p>
                <p style="margin:1px 0 0;font-family:${F};font-size:9px;color:${S.faint};">/ 5</p>
              </td>
              <td style="vertical-align:top;">
                <p style="margin:0;font-family:${F};font-size:13px;font-weight:600;color:${S.ink};line-height:1.35;letter-spacing:-0.01em;"><a href="${escapeHtml(m.url)}" style="color:${S.ink};text-decoration:none;">${escapeHtml(m.title)}</a></p>
                <p style="margin:3px 0 0;font-family:${F};font-size:12px;color:${S.muted};">${escapeHtml(m.company)}</p>
                <p style="margin:6px 0 0;font-family:${F};font-size:10.5px;color:${S.faint};">${escapeHtml(m.location)} · ${escapeHtml(m.posted)}${comp}</p>
                ${tags ? `<div style="margin:10px 0 0;">${tags}</div>` : ""}
                ${flag}
              </td>
              <td style="vertical-align:top;text-align:right;white-space:nowrap;padding-left:12px;">
                ${verdictText(m.verdict, m.score.overall)}
                <p style="margin:10px 0 0;"><a href="${escapeHtml(m.url)}" style="font-family:${F};font-size:11px;font-weight:600;color:${S.ink};text-decoration:underline;">View</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
        })
        .join("");
    return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
    <tr><td>
      ${sectionTitle(`More matches · ${matches.length}`)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${rows}
      </table>
    </td></tr>
  </table>`;
}

function outreachSection(vm: DigestViewModel): string {
    if (!vm.peopleToContact.length) return "";
    const items = vm.peopleToContact
        .slice(0, 4)
        .map((c, i) => {
            const roles =
                c.roleCount > 1
                    ? `${c.roleCount} roles`
                    : escapeHtml(c.roles[0] || "");
            const links = c.peopleSearchUrls
                .slice(0, 3)
                .map(
                    (u) =>
                        `<a href="${escapeHtml(u.url)}" style="font-family:${F};font-size:11px;color:${S.muted};text-decoration:underline;">${escapeHtml(u.title)}</a>`,
                )
                .join(" · ");
            const top =
                i === 0
                    ? `border-top:1px solid ${S.subLine};`
                    : `border-top:1px solid ${S.subLine};`;
            return `<tr><td style="padding:14px 0;${top}">
      <p style="margin:0;font-family:${F};font-size:12px;font-weight:600;color:${S.ink};">${escapeHtml(c.company)}</p>
      <p style="margin:3px 0 8px;font-family:${F};font-size:11px;color:${S.muted};">${roles}</p>
      <p style="margin:0;font-family:${F};font-size:11px;color:${S.faint};">${links}</p>
    </td></tr>`;
        })
        .join("");
    return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
    <tr><td>
      ${sectionTitle("Outreach")}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${items}
      </table>
    </td></tr>
  </table>`;
}

function signalSection(vm: DigestViewModel): string {
    if (!vm.skillGap) return "";
    const g = vm.skillGap;
    if (
        [
            "software",
            "engineer",
            "development",
            "system",
            "platform",
            "data",
        ].includes(g.skill.toLowerCase())
    )
        return "";
    const tone = g.marketDemand === "High" ? S.success : S.warn;
    return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
    <tr><td>
      ${sectionTitle("Signal")}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${S.subLine};padding-top:14px;">
        <tr><td>
          <p style="margin:0;font-family:${F};font-size:12.5px;color:${S.body};line-height:1.6;max-width:65ch;"><span style="font-weight:700;color:${S.ink};">${escapeHtml(g.skill)}</span> appeared in ${g.frequency}% of matches <span style="color:${S.faint};">(${g.count} jobs)</span></p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 0;">
            <tr>
              <td style="padding-right:24px;"><p style="margin:0;font-family:${F};font-size:10px;color:${S.faint};letter-spacing:0.08em;text-transform:uppercase;">You</p><p style="margin:3px 0 0;font-family:${F};font-size:11px;font-weight:600;color:${S.ink};">${escapeHtml(g.currentLevel)}</p></td>
              <td><p style="margin:0;font-family:${F};font-size:10px;color:${S.faint};letter-spacing:0.08em;text-transform:uppercase;">Demand</p><p style="margin:3px 0 0;font-family:${F};font-size:11px;font-weight:700;color:${tone};">${escapeHtml(g.marketDemand)}</p></td>
            </tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>`;
}

function accelSection(vm: DigestViewModel): string {
    if (!vm.acceleratorResearch || !vm.acceleratorResearch.totalCompanies)
        return "";
    const blocks = vm.acceleratorResearch.accelerators
        .slice(0, 2)
        .map((acc) => {
            const rows = acc.companies
                .slice(0, 6)
                .map(
                    (c) => `
      <tr><td style="padding:12px 0;border-top:1px solid ${S.subLine};">
        <p style="margin:0;font-family:${F};font-size:12px;font-weight:600;color:${S.ink};"><a href="${escapeHtml(c.url)}" style="color:${S.ink};text-decoration:none;">${escapeHtml(c.name)}</a></p>
        <p style="margin:3px 0 0;font-family:${F};font-size:10.5px;color:${S.faint};">${escapeHtml((c.techStack || []).slice(0, 3).join(" · ") || "Not specified")}</p>
        <p style="margin:6px 0 0;"><a href="${escapeHtml(c.careersUrl)}" style="font-family:${F};font-size:10.5px;color:${S.muted};text-decoration:underline;">Careers →</a></p>
      </td></tr>`,
                )
                .join("");
            return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
      <tr><td style="padding:8px 0 6px;"><p style="margin:0;font-family:${F};font-size:11px;font-weight:600;color:${S.faint};">${escapeHtml(acc.name)} · ${escapeHtml(acc.batch)}</p></td></tr>
      ${rows}
    </table>`;
        })
        .join("");
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;"><tr><td>${sectionTitle(`Accelerators · ${vm.acceleratorResearch.totalCompanies} companies`)}${blocks}</td></tr></table>`;
}

function footer(vm: DigestViewModel): string {
    const unscored = vm.footer.unscoredCount
        ? `<p style="margin:8px 0 0;font-family:${F};font-size:11px;color:${S.faint};">${vm.footer.unscoredCount} more jobs not scored</p>`
        : "";
    return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;">
    <tr><td style="padding:16px 0 0;border-top:1px solid ${S.line};">
      <p style="margin:0;font-family:${F};font-size:11px;color:${S.faint};">JobOps · ${vm.footer.scanned} scanned · ${vm.footer.filtered} surfaced</p>
      ${unscored}
      <p style="margin:12px 0 0;font-family:${F};font-size:10px;color:${S.faint};line-height:1.5;max-width:65ch;">You get this because you enabled the daily digest. Preview never marks jobs as seen.</p>
    </td></tr>
  </table>`;
}

export function renderEmail(vm: DigestViewModel): string {
    const primary = vm.topMatches[0];
    const rest = vm.topMatches.slice(1);
    const sections = [
        header(vm),
        stats(vm),
        featured(primary),
        listSection(rest),
        accelSection(vm),
        outreachSection(vm),
        signalSection(vm),
        footer(vm),
    ]
        .filter(Boolean)
        .join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>JobOps · Daily briefing</title>
  <style>
    @media (prefers-color-scheme: dark) {
      body { background:#121214 !important; }
      table[style*="background:${S.bg}"] { background:#121214 !important; }
      td[style*="background:#ffffff"] { background:#1c1c1e !important; border-color:#2c2c2e !important; }
      p[style*="color:#111111"] { color:#f5f5f7 !important; }
      p[style*="color:#2b2b2e"] { color:#d6d6d8 !important; }
      p[style*="color:#6e6e73"], span[style*="color:#6e6e73"] { color:#a1a1a6 !important; }
      td[style*="border-top:1px solid #e8e8ed"], td[style*="border-top:1px solid #f0f0f3"] { border-color:#2c2c2e !important; }
      table[style*="border-top:1px solid #f0f0f3"] { border-color:#2c2c2e !important; }
      td[style*="background:#e8e8ed"] { background:#2c2c2e !important; }
      span[style*="background:#f2f2f5"] { background:#2c2c2e !important; border-color:#3a3a3c !important; color:#a1a1a6 !important; }
      /* score pills — pale light bg stays pale in Gmail's auto-invert, so force dark amber/green */
      span[style*="background:#fef3c7"] { background:#2d2413 !important; color:#fde68a !important; border-color:#854d0e !important; }
      span[style*="background:#dcfce7"] { background:#132e1f !important; color:#86efac !important; border-color:#166534 !important; }
      span[style*="color:#925400"] { color:#fde68a !important; }
      span[style*="color:#1a7f37"] { color:#86efac !important; }
      span[style*="color:#b42318"] { color:#fca5a5 !important; }
      a[style*="background:#111111"] { background:#f5f5f7 !important; color:#111111 !important; }
    }
    @media only screen and (max-width: 600px) {
      .pad { padding-left:16px !important; padding-right:16px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${S.bg};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${S.bg};">
    <tr><td style="padding:28px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;">
        <tr><td class="pad" style="padding:0 4px;">
          ${sections}
        </td></tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:16px auto 0;">
        <tr><td style="text-align:center;padding:0 4px;">
          <p style="margin:0;font-family:${F};font-size:10px;color:${S.faint};">JobOps · Built for Nalin · <a href="https://github.com/NalinDalal/JobOps" style="color:${S.faint};text-decoration:underline;">GitHub</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function renderText(vm: DigestViewModel): string {
    const L: string[] = [];
    L.push("JOBOPS — Daily briefing");
    L.push(vm.date.long);
    L.push("");
    L.push(
        `${vm.summary.totalScanned} scanned · ${vm.summary.freshCount} fresh · ${vm.summary.strongMatches} strong · ${vm.summary.worthReviewing} to review`,
    );
    L.push("");
    if (vm.topMatches[0]) {
        const m = vm.topMatches[0];
        L.push(`${(m.label || "Featured").toUpperCase()}`);
        L.push(
            `${m.score.overall.toFixed(1)}/5 ${m.verdict.toUpperCase()} — ${m.title} @ ${m.company}`,
        );
        L.push(
            `${m.location} · ${m.posted}${m.compensation ? ` · ${m.compensation}` : ""}`,
        );
        if (m.matchedSkills.length) L.push(m.matchedSkills.join(" · "));
        if (m.whyMatch.length) L.push(m.whyMatch.join(" · "));
        if (m.redFlags.length) L.push(`Watch: ${m.redFlags.join(" · ")}`);
        L.push(m.url);
        L.push("");
    }
    const rest = vm.topMatches.slice(1);
    if (rest.length) {
        L.push(`MORE MATCHES · ${rest.length}`);
        for (const m of rest) {
            L.push("");
            L.push(
                `${m.score.overall.toFixed(1)}/5 ${m.title} @ ${m.company} — ${m.verdict}`,
            );
            L.push(
                `${m.location} · ${m.posted}${m.compensation ? ` · ${m.compensation}` : ""}`,
            );
            if (m.matchedSkills.length) L.push(m.matchedSkills.join(" · "));
            L.push(m.url);
        }
        L.push("");
    }
    if (vm.peopleToContact.length) {
        L.push(`OUTREACH · ${vm.peopleToContact.length} companies`);
        for (const c of vm.peopleToContact) {
            L.push(
                `  ${c.company} — ${c.roleCount > 1 ? `${c.roleCount} roles` : c.roles[0] || ""}`,
            );
            L.push(
                `  ${c.peopleSearchUrls.map((u) => `${u.title}: ${u.url}`).join(" | ")}`,
            );
        }
        L.push("");
    }
    if (vm.acceleratorResearch && vm.acceleratorResearch.totalCompanies) {
        L.push(
            `ACCELERATORS · ${vm.acceleratorResearch.totalCompanies} companies`,
        );
        for (const acc of vm.acceleratorResearch.accelerators) {
            L.push(`  ${acc.name} (${acc.batch})`);
            for (const c of acc.companies.slice(0, 6))
                L.push(
                    `    - ${c.name} — ${(c.techStack || []).slice(0, 3).join(", ") || "N/A"} — ${c.careersUrl}`,
                );
        }
        L.push("");
    }
    if (
        vm.skillGap &&
        ![
            "software",
            "engineer",
            "development",
            "system",
            "platform",
            "data",
        ].includes(vm.skillGap.skill.toLowerCase())
    ) {
        L.push(
            `SIGNAL — ${vm.skillGap.skill} in ${vm.skillGap.frequency}% of matches (${vm.skillGap.count} jobs) — ${vm.skillGap.marketDemand} demand`,
        );
        L.push("");
    }
    L.push(`—`);
    L.push(
        `JobOps · ${vm.footer.scanned} scanned · ${vm.footer.filtered} surfaced${vm.footer.unscoredCount ? ` · ${vm.footer.unscoredCount} unscored` : ""}`,
    );
    return L.join("\n");
}
