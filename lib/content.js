// Loads the content data files and builds the full list of pages (URL, language,
// hreflang alternates, routing). Used by Eleventy (src/_data/pages.js) and by scripts.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = path.join(ROOT, "src", "_data");

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function loadDir(dir, keyField) {
  const out = {};
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
    const rec = readJson(path.join(dir, f));
    const key = rec[keyField] || path.basename(f, ".json");
    out[key] = rec;
  }
  return out;
}

export function loadContent(dataDir = DATA_DIR) {
  return {
    site: readJson(path.join(dataDir, "site.json")),
    routing: readJson(path.join(dataDir, "routing.json")),
    home: readJson(path.join(dataDir, "home.json")),
    privacy: readJson(path.join(dataDir, "privacy.json")),
    disclosures: readJson(path.join(dataDir, "disclosures.json")),
    areas: loadDir(path.join(dataDir, "areas"), "slug"),
    services: loadDir(path.join(dataDir, "services"), "key"),
    landings: loadDir(path.join(dataDir, "landings"), "key"),
  };
}

const prefix = (lang) => (lang === "ms" ? "" : "/" + lang);

function ordered(map, order, label) {
  const keys = order.filter((k) => {
    if (!map[k]) throw new Error(`site.json ${label} lists "${k}" but no data file exists for it`);
    return true;
  });
  for (const k of Object.keys(map)) {
    if (!keys.includes(k)) throw new Error(`Data file "${k}" is missing from site.json ${label}`);
  }
  return keys.map((k) => map[k]);
}

export const TENANT_STATUSES = ["trial", "tenant"];

// A map pin and a Directions button need the workshop's location from its public
// Google Maps listing (address plus that listing's own coordinates).
export function hasPin(w) {
  const l = w && w.location;
  return !!(l && l.address && Number.isFinite(l.lat) && Number.isFinite(l.lng));
}

// Every workshop that some area or service page lists (respecting service restrictions).
export function listedWorkshopIds(routing) {
  const ids = new Set();
  for (const list of Object.values(routing.areas || {})) for (const id of list) ids.add(id);
  for (const [k, list] of Object.entries(routing.services || {})) {
    for (const id of list) { const w = routing.workshops[id]; if (!w || !w.services || w.services.includes(k)) ids.add(id); }
  }
  return [...ids];
}
const isPlaceholderPhone = (v) => /^\+?60?0+$/.test(v);

// A workshop listed on a page must have real details. Trial workshops never carry a
// logo or photo, and never a form (the form needs a tenant's own web3forms_key).
export function checkWorkshop(key, w) {
  const problems = [];
  if (!TENANT_STATUSES.includes(w.tenant_status)) throw new Error(`routing.json workshop "${key}": tenant_status must be one of ${TENANT_STATUSES.join(", ")}`);
  if (!w.workshop || typeof w.workshop !== "object") throw new Error(`routing.json workshop "${key}": missing "workshop" object (name, area, coverage)`);
  if (w.tenant_status === "trial" && (w.logo || w.photo || w.workshop.logo || w.workshop.photo)) throw new Error(`routing.json workshop "${key}" is "trial": remove logo/photo (only allowed for a tenant)`);
  if (w.workshop_id !== key || !/^[a-z0-9-]{2,40}$/.test(key) || /^todo/.test(key)) problems.push("workshop_id");
  if (!w.workshop.name || /TODO/i.test(w.workshop.name)) problems.push("workshop.name");
  if (!w.workshop.area || /TODO/i.test(w.workshop.area)) problems.push("workshop.area");
  const cov = w.workshop.coverage || {};
  if (!cov.en || !cov.ms || /TODO/i.test(cov.en + cov.ms)) problems.push("workshop.coverage");
  if (!/^\+\d{9,15}$/.test(w.phone || "") || isPlaceholderPhone(w.phone)) problems.push("phone");
  if (!w.phone_display || w.phone_display.replace(/\D/g, "").replace(/^0/, "60") !== w.phone.replace(/\D/g, "")) problems.push("phone_display");
  if (w.whatsapp != null && (!/^\d{9,15}$/.test(w.whatsapp) || isPlaceholderPhone(w.whatsapp))) problems.push("whatsapp");
  for (const l of ["en", "ms"]) {
    const h = (w.hours || {})[l];
    // Either 7 daily lines, or an empty list (hours not shown).
    if (!Array.isArray(h) || (h.length !== 0 && h.length !== 7) || h.some((d) => !d.day || !d.text)) problems.push(`hours.${l}`);
  }
  if (w.tenant_status === "tenant" && w.web3forms_key != null && /TODO/i.test(w.web3forms_key)) problems.push("web3forms_key");
  // Optional location from the public Google Maps listing. When present it must be complete
  // and inside the Johor Bahru region; a workshop without one simply gets no pin or Directions button.
  if (w.location != null) {
    const l = w.location;
    if (!l.address || /TODO/i.test(l.address) || !Number.isFinite(l.lat) || !Number.isFinite(l.lng) ||
      l.lat < 1.2 || l.lat > 2.1 || l.lng < 103.3 || l.lng > 104.3) problems.push("location");
  }
  if (problems.length) throw new Error(`routing.json workshop "${key}" has missing or placeholder values: ${problems.join(", ")}`);
}

// Thin-page guard. A content page stays out of Google (noindex,follow, no sitemap entry)
// while its copy is still placeholder/DRAFT, or while it is on the manual hold list
// (site.json "indexHold", matched on the last part of the URL). A page with real copy
// is indexable even when it lists no workshop; such a page simply shows no contact box.
const DRAFT_MARK = /\bDRAFT\b/;
export function copyIsPlaceholder(record, lang) {
  if (!record || record.status === "placeholder") return true;
  const c = record[lang] || {};
  const texts = [c.title, c.description, c.h1, c.intro, ...(c.blocks || []).flatMap((b) => [b.heading, b.body]), ...(c.faqs || []).flatMap((f) => [f.q, f.a])];
  return texts.some((t) => !t || DRAFT_MARK.test(t));
}

// Workshop IDs shown on a page: area list, or the service's list (respecting each
// workshop's optional services restriction). No list = the "unassigned" default.
export function workshopsFor(routing, type, key) {
  let ids = [];
  if (type === "area" || type === "landing") ids = (routing.areas || {})[key] || [];
  else if (type === "service") {
    ids = ((routing.services || {})[key] || []).filter((id) => {
      const w = routing.workshops[id];
      return !w || !w.services || w.services.includes(key);
    });
  }
  return ids;
}


// Optional per-page trial intro (record.trialIntro[lang]). A missing or blank
// value keeps the shared intro from disclosures.json: lead only when the page
// has a tenant card, lead + trialClaims when every card is trial.
export function trialIntroText(record, lang, disclosures, hasTenant) {
  const raw = record?.trialIntro?.[lang];
  const override = typeof raw === "string" ? raw.trim() : "";
  if (override) return override;
  const lead = disclosures.trialIntro.lead[lang];
  const claims = disclosures.trialIntro.trialClaims[lang];
  return hasTenant ? lead : `${lead} ${claims}`;
}

// Disclosure lines must have real wording before any page with a workshop goes live.
export function checkDisclosures(status, d, langs) {
  if (!status || status === "unassigned") return;
  const lines = status === "trial" ? [d.trialIntro?.lead, d.trialIntro?.trialClaims] : [d.trialIntro?.lead, d.tenantCard, d.trialCard]; // a tenant can share a page with trial cards
  for (const line of lines) for (const l of langs) {
    if (!line || !line[l] || /TODO/i.test(line[l])) throw new Error(`disclosures.json still has TODO wording needed for "${status}" pages (${l})`);
  }
}

// Imported copy may wrap text in [WITH-WORKSHOPS] ... [/WITH-WORKSHOPS]. That text is shown
// only when the page lists at least one workshop; the markers themselves never reach the page.
// A block or FAQ left empty after removal is dropped.
const WW_BLOCK = /\s*\[WITH-WORKSHOPS\][\s\S]*?\[\/WITH-WORKSHOPS\]/g;
const WW_TAG = /\[\/?WITH-WORKSHOPS\]/g;
export function applyWorkshopMarkers(value, hasWorkshops) {
  if (typeof value === "string") {
    return hasWorkshops ? value.replace(WW_TAG, "") : value.replace(WW_BLOCK, "").trim();
  }
  if (Array.isArray(value)) {
    return value.map((v) => applyWorkshopMarkers(v, hasWorkshops))
      .filter((v) => !(v && typeof v === "object" && !Array.isArray(v) &&
        (("body" in v && !v.body) || ("q" in v && (!v.q || !v.a)))));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, applyWorkshopMarkers(v, hasWorkshops)]));
  }
  return value;
}

// Imported copy may wrap paid-by wording in [IF-TENANT] ... [/IF-TENANT][ELSE] ... [/ELSE].
// The tenant branch shows only when a relevant workshop (or, on the home page, any listed
// workshop) is a tenant; otherwise the ELSE branch is used. Markers never reach the page.
const TENANT_BLOCK = /\[IF-TENANT\]([\s\S]*?)\[\/IF-TENANT\](?:\[ELSE\]([\s\S]*?)\[\/ELSE\])?/g;
const TENANT_TAG = /\[\/?IF-TENANT\]|\[\/?ELSE\]/g;
export function applyTenantMarkers(value, hasTenant) {
  if (typeof value === "string") {
    const out = value.replace(TENANT_BLOCK, (_, yes, no) => (hasTenant ? yes : (no || "")).replace(/^\s+|\s+$/g, ""));
    if (TENANT_TAG.test(out)) throw new Error("unbalanced [IF-TENANT] / [ELSE] markers in page copy");
    return out;
  }
  if (Array.isArray(value)) {
    return value.map((v) => applyTenantMarkers(v, hasTenant))
      .filter((v) => !(v && typeof v === "object" && !Array.isArray(v) &&
        (("body" in v && !v.body) || ("q" in v && (!v.q || !v.a)))));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, applyTenantMarkers(v, hasTenant)]));
  }
  return value;
}

// Fill {{ workshop.name }}, {{ workshop.area }} and {{ workshop.coverage }} from the page's
// listed workshops. Several workshops are joined clearly. If the page lists none, the
// placeholders are removed and any block or FAQ left empty is dropped. Leftover raw
// placeholders must never reach the page.
const WORKSHOP_VAR = /\{\{\s*workshop\.(\w+)\s*\}\}/g;
const RAW_PLACEHOLDER = /\[\s*(?:WORKSHOP(?:\s+NAME)?|AREA|Nama bengkel|kawasan|Workshop name)\s*\]/i;

function workshopFillVars(ids, routing, lang) {
  const list = (ids || []).map((id) => routing.workshops[id]).filter(Boolean);
  if (!list.length) return null;
  const join = (pick) => {
    const parts = list.map(pick).filter(Boolean);
    if (parts.length <= 1) return parts[0] || "";
    return parts.join(". ") + ".";
  };
  return {
    workshop: {
      name: join((w) => w.workshop.name),
      area: join((w) => w.workshop.area),
      coverage: list.length === 1
        ? list[0].workshop.coverage[lang]
        : list.map((w) => `${w.workshop.name}: ${w.workshop.coverage[lang]}`).join(". ") + ".",
    },
  };
}

function applyWorkshopVars(value, vars) {
  if (typeof value === "string") {
    if (!vars) return value.replace(WORKSHOP_VAR, "").replace(/\n{3,}/g, "\n\n").trim();
    return value.replace(WORKSHOP_VAR, (m, key) => {
      const v = vars.workshop[key];
      if (v == null || v === "") throw new Error(`unfilled workshop placeholder ${m}`);
      return String(v);
    });
  }
  if (Array.isArray(value)) {
    return value.map((v) => applyWorkshopVars(v, vars))
      .filter((v) => !(v && typeof v === "object" && !Array.isArray(v) &&
        (("body" in v && !v.body) || ("q" in v && (!v.q || !v.a)))));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, applyWorkshopVars(v, vars)]));
  }
  return value;
}

function assertNoRawPlaceholders(value, label) {
  const walk = (v) => {
    if (typeof v === "string") {
      if (RAW_PLACEHOLDER.test(v) || WORKSHOP_VAR.test(v)) {
        throw new Error(`${label}: unassigned workshop placeholder reached the page copy`);
      }
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(value);
}

export function refineCopy(content, { hasWorkshops, hasTenant, workshopIds, routing, lang, label }) {
  let out = applyWorkshopMarkers(content, hasWorkshops);
  out = applyTenantMarkers(out, hasTenant);
  out = applyWorkshopVars(out, workshopFillVars(workshopIds, routing, lang));
  assertNoRawPlaceholders(out, label || "page");
  return out;
}

const CONTENT_TYPES = ["home", "service", "area", "landing"];

const lastSegment = (url) => url.split("/").filter(Boolean).pop() || "";

export function applyThinGuard(pages, indexHold = []) {
  for (const p of pages) {
    if (!CONTENT_TYPES.includes(p.type)) continue;
    p.held = indexHold.includes(lastSegment(p.url));
    p.thin = p.held || copyIsPlaceholder(p.record, p.lang);
    if (p.thin) { p.noindex = true; p.sitemap = false; }
  }
  // hreflang only links pages that are all indexable; if either language is excluded,
  // the pair is dropped (in the HTML head and in the sitemap).
  const byUrl = new Map(pages.map((p) => [p.url, p]));
  for (const p of pages) {
    const group = Object.values(p.alternates).map((u) => byUrl.get(u));
    p.hreflang = group.every((g) => g && !g.noindex) ? p.alternates : null;
  }
  return pages;
}

export function buildPages(c = loadContent()) {
  const { site } = c;
  if (site.ga4_measurement_id && !/^G-[A-Z0-9]{4,20}$/.test(site.ga4_measurement_id)) {
    throw new Error(`site.json ga4_measurement_id "${site.ga4_measurement_id}" doesn't look like a GA4 ID (G-XXXXXXX)`);
  }
  const langs = site.languages;
  const pages = [];

  const add = (base, urls) => {
    for (const lang of Object.keys(urls)) {
      pages.push({
        ...base,
        lang,
        url: urls[lang],
        alternates: urls,
        content: base.record[lang],
      });
      const pg = pages[pages.length - 1];
      pg.eventService = base.type === "service" ? base.key : base.type === "home" ? "home" : "area";
      pg.eventArea = base.type === "area" || base.type === "landing" ? base.key : "all";
      pg.workshops = workshopsFor(c.routing, base.type, base.routingArea || base.key);
      // Home has no contact cards of its own; paid-by wording in its body still follows
      // whether any workshop in the home list is a tenant.
      const listed = base.type === "home" ? listedWorkshopIds(c.routing) : pg.workshops;
      const hasTenant = listed.some((id) => c.routing.workshops[id]?.tenant_status === "tenant");
      pg.content = refineCopy(base.record[lang], {
        hasWorkshops: pg.workshops.length > 0,
        hasTenant,
        workshopIds: pg.workshops,
        routing: c.routing,
        lang,
        label: urls[lang],
      });
      pg.trialIntro = trialIntroText(base.record, lang, c.disclosures, hasTenant);
      // Pages that load the (tap-to-open) map: the home list, or a page whose cards have a location.
      const pinIds = base.type === "home" ? listedWorkshopIds(c.routing) : pg.workshops;
      pg.hasPins = pinIds.some((id) => hasPin(c.routing.workshops[id]));
    }
  };

  const both = (slugFor) => Object.fromEntries(langs.map((l) => [l, slugFor(l)]));

  add({ type: "home", key: "home", record: c.home, sitemap: true },
    both((l) => prefix(l) + "/"));

  for (const s of ordered(c.services, site.serviceOrder, "serviceOrder")) {
    add({ type: "service", key: s.key, record: s, sitemap: true },
      both((l) => `${prefix(l)}/${s.slug[l]}/`));
  }

  for (const a of ordered(c.areas, site.areaOrder, "areaOrder")) {
    add({ type: "area", key: a.slug, record: a, sitemap: true },
      both((l) => `${prefix(l)}/${a.slug}/`));
  }

  for (const p of ordered(c.landings, site.landingOrder, "landingOrder")) {
    const urls = Object.fromEntries(p.langs.map((l) => [l, `${prefix(l)}/${p.slug[l]}/`]));
    add({ type: "landing", key: p.key, record: p, routingArea: p.routing, sitemap: true }, urls);
  }

  const thanksRecord = Object.fromEntries(langs.map((l) => [l, {
    title: (l === "ms" ? "Terima kasih" : "Thank you") + " | {{ brand }}",
    description: "",
    h1: l === "ms" ? "Terima kasih" : "Thank you",
    intro: site.strings[l].thanksBody,
  }]));
  add({ type: "thanks", key: "thanks", record: thanksRecord, sitemap: false, noindex: true },
    both((l) => site.thanks[l]));

  // Privacy notice: noindex while it is still a placeholder.
  add({ type: "privacy", key: "privacy", record: c.privacy, sitemap: c.privacy.status !== "placeholder", noindex: c.privacy.status === "placeholder" },
    both((l) => site.privacy[l]));

  // Sanity checks: unique URLs, every alternate points to a generated page.
  for (const [id, w] of Object.entries(c.routing.workshops || {})) checkWorkshop(id, w);
  applyThinGuard(pages, site.indexHold || []);
  const seen = new Set();
  for (const p of pages) {
    if (seen.has(p.url)) throw new Error(`Duplicate URL ${p.url}`);
    seen.add(p.url);
    if (p.workshops.length > 2) throw new Error(`${p.url} lists ${p.workshops.length} workshops; the limit is 2`);
    for (const id of p.workshops) {
      if (!c.routing.workshops[id]) throw new Error(`routing.json lists workshop "${id}" for ${p.url} but it isn't in "workshops"`);
    }
    for (const status of new Set(p.workshops.map((id) => c.routing.workshops[id].tenant_status))) {
      checkDisclosures(status, c.disclosures, [p.lang]);
    }
    const override = typeof p.record?.trialIntro?.[p.lang] === "string" ? p.record.trialIntro[p.lang].trim() : "";
    if (p.workshops.length && override && /TODO/i.test(override)) {
      throw new Error(`${p.url}: trialIntro override still has TODO wording`);
    }
  }
  for (const p of pages) {
    for (const u of Object.values(p.alternates)) {
      if (!seen.has(u)) throw new Error(`hreflang on ${p.url} points to missing page ${u}`);
    }
  }
  return pages;
}
