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

export const TENANT_STATUSES = ["unassigned", "trial", "tenant"];

// A workshop entry may only go live (trial/tenant) once every value is real.
export function checkRoutingEntry(key, r) {
  if (!TENANT_STATUSES.includes(r.tenant_status)) throw new Error(`routing.json entry "${key}": tenant_status must be one of ${TENANT_STATUSES.join(", ")}`);
  if (!r.workshop || typeof r.workshop !== "object") throw new Error(`routing.json entry "${key}": missing "workshop" object (name, area, coverage)`);
  if (r.tenant_status === "unassigned") return;
  if (r.tenant_status === "trial" && (r.logo || r.photo || r.workshop.logo || r.workshop.photo)) throw new Error(`routing.json entry "${key}" is "trial": remove logo/photo (only allowed for a tenant)`);
  const problems = [];
  if (!/^[a-z0-9-]{2,40}$/.test(r.workshop_id || "") || /^todo/.test(r.workshop_id)) problems.push("workshop_id");
  if (!r.workshop.name || /TODO/i.test(r.workshop.name)) problems.push("workshop.name");
  if (!r.workshop.area || /TODO/i.test(r.workshop.area)) problems.push("workshop.area");
  if (!/^\+\d{9,15}$/.test(r.phone || "") || /^\+?60?0+$/.test(r.phone)) problems.push("phone");
  if (!/^\d{9,15}$/.test(r.whatsapp || "") || /^60?0+$/.test(r.whatsapp)) problems.push("whatsapp");
  if (!r.web3forms_key || /TODO/i.test(r.web3forms_key)) problems.push("web3forms_key");
  if (problems.length) throw new Error(`routing.json entry "${key}" is "${r.tenant_status}" but still has placeholder values: ${problems.join(", ")}`);
}

// Disclosure lines must have real wording before any page with a workshop goes live.
export function checkDisclosures(status, d, langs) {
  if (status === "unassigned") return;
  const lines = (status === "trial" ? [d.independence, d.selectionMethod, d.paidBy.trial] : [d.paidBy.tenant]);
  for (const line of lines) for (const l of langs) {
    if (!line || !line[l] || /TODO/i.test(line[l])) throw new Error(`disclosures.json still has TODO wording needed for "${status}" pages (${l})`);
  }
}

export function buildPages(c = loadContent()) {
  const { site } = c;
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
    }
  };

  const both = (slugFor) => Object.fromEntries(langs.map((l) => [l, slugFor(l)]));

  add({ type: "home", key: "home", record: c.home, routingKey: c.routing.default, sitemap: true },
    both((l) => prefix(l) + "/"));

  for (const s of ordered(c.services, site.serviceOrder, "serviceOrder")) {
    add({ type: "service", key: s.key, record: s, routingKey: c.routing.default, sitemap: true },
      both((l) => `${prefix(l)}/${s.slug[l]}/`));
  }

  for (const a of ordered(c.areas, site.areaOrder, "areaOrder")) {
    add({ type: "area", key: a.slug, record: a, routingKey: c.routing.areas[a.slug] || c.routing.default, sitemap: true },
      both((l) => `${prefix(l)}/${a.slug}/`));
  }

  for (const p of ordered(c.landings, site.landingOrder, "landingOrder")) {
    const urls = Object.fromEntries(p.langs.map((l) => [l, `${prefix(l)}/${p.slug[l]}/`]));
    add({ type: "landing", key: p.key, record: p, routingKey: c.routing.areas[p.routing] || c.routing.default, sitemap: true }, urls);
  }

  const thanksRecord = Object.fromEntries(langs.map((l) => [l, {
    title: (l === "ms" ? "Terima kasih" : "Thank you") + " | {{ brand }}",
    description: "",
    h1: l === "ms" ? "Terima kasih" : "Thank you",
    intro: site.strings[l].thanksBody,
  }]));
  add({ type: "thanks", key: "thanks", record: thanksRecord, routingKey: c.routing.default, sitemap: false, noindex: true },
    both((l) => site.thanks[l]));

  // Privacy notice: noindex while it is still a placeholder.
  add({ type: "privacy", key: "privacy", record: c.privacy, routingKey: c.routing.default, sitemap: c.privacy.status !== "placeholder", noindex: c.privacy.status === "placeholder" },
    both((l) => site.privacy[l]));

  // Sanity checks: unique URLs, every alternate points to a generated page.
  const seen = new Set();
  for (const p of pages) {
    if (seen.has(p.url)) throw new Error(`Duplicate URL ${p.url}`);
    seen.add(p.url);
    const r = c.routing.entries[p.routingKey];
    if (!r) throw new Error(`routing.json has no entry "${p.routingKey}" (page ${p.url})`);
    checkRoutingEntry(p.routingKey, r);
    if (["home", "service", "area", "landing"].includes(p.type)) checkDisclosures(r.tenant_status, c.disclosures, [p.lang]);
  }
  for (const p of pages) {
    for (const u of Object.values(p.alternates)) {
      if (!seen.has(u)) throw new Error(`hreflang on ${p.url} points to missing page ${u}`);
    }
  }
  return pages;
}
