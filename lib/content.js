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

const STATUSES = ["unassigned", "trial", "rented"];

// A workshop entry may only go live (trial/rented) once every value is real.
export function checkRoutingEntry(key, r) {
  if (!STATUSES.includes(r.status)) throw new Error(`routing.json entry "${key}": status must be one of ${STATUSES.join(", ")}`);
  if (r.status === "unassigned") return;
  const problems = [];
  if (!r.workshop_name || /TODO/i.test(r.workshop_name)) problems.push("workshop_name");
  if (!/^\+\d{9,15}$/.test(r.phone || "") || /^\+?60?0+$/.test(r.phone)) problems.push("phone");
  if (!/^\d{9,15}$/.test(r.whatsapp || "") || /^60?0+$/.test(r.whatsapp)) problems.push("whatsapp");
  if (!r.web3forms_key || /TODO/i.test(r.web3forms_key)) problems.push("web3forms_key");
  if (problems.length) throw new Error(`routing.json entry "${key}" is "${r.status}" but still has placeholder values: ${problems.join(", ")}`);
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
    title: (l === "ms" ? "Terima kasih" : "Thank you") + " | " + site.name,
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
  }
  for (const p of pages) {
    for (const u of Object.values(p.alternates)) {
      if (!seen.has(u)) throw new Error(`hreflang on ${p.url} points to missing page ${u}`);
    }
  }
  return pages;
}
