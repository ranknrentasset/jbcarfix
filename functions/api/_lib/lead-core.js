// Pure validation for the lead form (no network). Shared by functions/api/lead.js and the tests.

export const MAX_BODY_BYTES = 8 * 1024;
export const HONEYPOT_FIELD = "website";
export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

function clean(v, max) {
  if (typeof v !== "string") return "";
  // Drop control characters, collapse spaces, trim, cap length.
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/[ \t]+/g, " ").trim().slice(0, max);
}

// Malaysian or Singapore number: keep digits (and a leading +), 9 to 15 digits.
export function normalisePhone(raw) {
  const s = clean(raw, 30);
  const digits = s.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 15) return null;
  if (!/^[+\d][\d\s().-]*$/.test(s)) return null;
  return (s.startsWith("+") ? "+" : "") + digits;
}

/**
 * @param {Record<string,string>} raw  form fields
 * @param {{areas:string[], services:string[]}} allowed
 * @returns {{kind:"silent"} | {kind:"invalid", errors:string[]} | {kind:"ok", lead:object}}
 */
export function validateLead(raw, allowed) {
  raw = raw && typeof raw === "object" ? raw : {};
  if (clean(raw[HONEYPOT_FIELD], 200)) return { kind: "silent" };

  const errors = [];
  const name = clean(raw.name, 80);
  if (name.length < 2) errors.push("name");
  const phone = normalisePhone(raw.phone);
  if (!phone) errors.push("phone");
  const area = clean(raw.area, 40);
  if (!(allowed.areas.includes(area) || area === "other")) errors.push("area");
  const service = clean(raw.service, 40);
  if (!(allowed.services.includes(service) || service === "other")) errors.push("service");
  const message = typeof raw.message === "string" ? raw.message.replace(/\u0000/g, "").trim().slice(0, 1000) : "";
  const consent = raw.consent === "yes" || raw.consent === "on" || raw.consent === true;
  if (!consent) errors.push("consent");
  const lang = raw.lang === "en" ? "en" : "ms";
  const page = /^\/[a-z0-9\-/]*$/i.test(raw.page || "") ? String(raw.page).slice(0, 120) : "";

  if (errors.length) return { kind: "invalid", errors };

  const utm = {};
  for (const k of UTM_KEYS) {
    const v = clean(raw[k], 100);
    if (v) utm[k] = v;
  }
  return { kind: "ok", lead: { name, phone, area, service, message, lang, page, utm } };
}
