/**
 * lib/text.mjs — Text processing utilities
 */

export function stripHtml(html) {
    return (html || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
}

export function esc(s) {
    return stripHtml(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function slugify(str) {
    return (str || "")
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/[^a-z0-9]/g, "");
}

export function truncate(text, maxLen = 300) {
    const clean = stripHtml(text);
    if (clean.length <= maxLen) return clean;
    return clean.substring(0, maxLen).replace(/\s+\S*$/, "") + "…";
}

export function todayKey() {
    return new Date().toISOString().split("T")[0];
}
