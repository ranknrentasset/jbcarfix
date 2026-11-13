import crypto from "node:crypto";
import fs from "node:fs";
import { buildJsonLd } from "./lib/schema.js";
import { hasPin, buildPages } from "./lib/content.js";

const site = JSON.parse(fs.readFileSync("src/_data/site.json", "utf8"));

// Replaces {{ brand }}, {{ workshop.name }}, {{ workshop.area }} written inside data-file text.
export function fillVars(text, vars) {
  return String(text).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key) => {
    const v = key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), vars);
    return v == null ? m : String(v);
  });
}

// The note under the WhatsApp button, quoting the exact pre-fill text from i18n.json.
export function underButtonNote(i18n, lang, brand) {
  const prefill = fillVars(i18n.whatsappText[lang], { brand });
  return fillVars(i18n.underButtonNote[lang], { brand, whatsappText: prefill });
}

// wa.me link: https://wa.me/<number>?text=<urlencoded>, then the area's UTM tags.
export function waLink(number, text, utm) {
  let url = `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
  if (utm) url += "&" + new URLSearchParams(utm).toString();
  return url;
}

export function directionsUrl(w) {
  if (!hasPin(w)) return "";
  return "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(`${w.workshop.name}, ${w.location.address}`);
}

// Workshops for the home list, in page order (areas first, then services). Only
// workshops that an area or service page lists; a stored backup is never included.
// Each entry carries the same analytics area/service its own page sends, the page
// to link to, and the area/service keys used by the filter chips.
export function directoryEntries(routing, areas, services, siteData = site) {
  const byId = new Map();
  const get = (id) => {
    if (!byId.has(id)) byId.set(id, { id, w: routing.workshops[id], area: null, services: [] });
    return byId.get(id);
  };
  for (const a of siteData.areaOrder) for (const id of (routing.areas || {})[a] || []) { const e = get(id); if (!e.area) e.area = a; }
  for (const k of siteData.serviceOrder) {
    for (const id of (routing.services || {})[k] || []) {
      const w = routing.workshops[id];
      if (w && w.services && !w.services.includes(k)) continue;
      get(id).services.push(k);
    }
  }
  const out = [];
  for (const e of byId.values()) {
    if (!e.w) continue;
    // Area chip: the area page that lists it, else the area the workshop is in (by name).
    const located = e.area || siteData.areaOrder.find((a) => areas[a] && [areas[a].name.en, areas[a].name.ms].includes(e.w.workshop.area)) || null;
    const page = e.area ? { type: "area", key: e.area } : { type: "service", key: e.services[0] };
    const moreInfo = {};
    for (const lang of siteData.languages || ["ms", "en"]) {
      const pre = lang === "ms" ? "" : "/" + lang;
      moreInfo[lang] = page.type === "area" ? `${pre}/${page.key}/` : `${pre}/${services[page.key].slug[lang]}/`;
    }
    out.push({
      ...e,
      filterArea: located,
      evArea: e.area || "all",
      evService: e.area ? "area" : e.services[0],
      page,
      moreInfo,
    });
  }
  return out;
}

// Body copy is escaped like any other text. Allowed markup in copy: an internal link
// written [words](/path/), **bold**, and bullet or numbered lists. External links stay as text.
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function linkify(text) {
  const esc = String(text ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
  return esc.replace(/\[([^\]\n]+)\]\((\/(?!\/)[^\s)]*)\)/g, (m, words, href) => `<a href="${href}">${words}</a>`);
}

export function markupInline(text) {
  return linkify(text).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

export function markup(text) {
  const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let para = [];
  let list = null;
  const flushPara = () => {
    if (!para.length) return;
    out.push(`<p>${markupInline(para.join(" "))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    out.push(`<${list.type}>` + list.items.map((i) => `<li>${markupInline(i)}</li>`).join("") + `</${list.type}>`);
    list = null;
  };
  for (const line of lines) {
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const num = line.match(/^\s*\d+\.\s+(.*)$/);
    if (bullet) {
      flushPara();
      if (!list || list.type !== "ul") { flushList(); list = { type: "ul", items: [] }; }
      list.items.push(bullet[1]);
    } else if (num) {
      flushPara();
      if (!list || list.type !== "ol") { flushList(); list = { type: "ol", items: [] }; }
      list.items.push(num[1]);
    } else if (/^\s*$/.test(line)) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return out.join("");
}

// Link guard. A link to one of our own pages that is kept out of Google by the thin-page
// guard (placeholder copy or on the hold list) is turned back into plain text: the <a> goes,
// its words stay. Applies to every link on every page (body copy, chips, search, nav, footer),
// except the language switch, which keeps working as before.
export function guardLinks(html, blocked) {
  return html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/g, (m, attrs, inner) => {
    if (/\sclass="lang"/.test(attrs)) return m;
    const h = attrs.match(/\shref="([^"]*)"/);
    if (!h || !h[1].startsWith("/") || h[1].startsWith("//")) return m;
    return blocked.has(h[1].split(/[?#]/)[0]) ? inner : m;
  });
}

export default function (eleventyConfig) {
  // {{ brand }} in templates, from site.json.
  eleventyConfig.addGlobalData("brand", site.brand);
  eleventyConfig.addFilter("underButtonNote", (i18n, lang) => underButtonNote(i18n, lang, site.brand));
  eleventyConfig.addFilter("fill", (text, vars) => fillVars(text, { brand: site.brand, ...(vars || {}) }));

  // Files Cloudflare Pages reads from the output folder.
  eleventyConfig.addPassthroughCopy({ public: "/" });
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });

  // Absolute URL from a site path, using the single baseUrl in site.json.
  eleventyConfig.addFilter("absUrl", (p, site) => site.baseUrl.replace(/\/$/, "") + p);

  // Short content hash for cache-busting CSS/JS (lets us cache /assets/ for a year).
  const hashes = {};
  eleventyConfig.addFilter("assetHash", (p) => {
    if (!hashes[p]) {
      const buf = fs.readFileSync("src" + p);
      hashes[p] = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 10);
    }
    return `${p}?v=${hashes[p]}`;
  });
  eleventyConfig.on("eleventy.before", () => { for (const k of Object.keys(hashes)) delete hashes[k]; });

  // Workshop objects for a page's list of workshop IDs.
  eleventyConfig.addFilter("resolveWorkshops", (ids, routing) => (ids || []).map((id) => routing.workshops[id]));

  // (Nunjucks' selectattr can't compare values, so these do it explicitly.)
  eleventyConfig.addFilter("byStatus", (list, status) => (list || []).filter((w) => w.tenant_status === status));
  eleventyConfig.addFilter("withWhatsapp", (list) => (list || []).filter((w) => !!w.whatsapp));

  eleventyConfig.addFilter("jsonLd", (page, data) => buildJsonLd(page, data));

  // Directions button: Google Maps directions to the name and address shown on the
  // workshop's public Google Maps listing (routing.json "location"). No location, no button.
  eleventyConfig.addFilter("directionsUrl", (w) => directionsUrl(w));
  eleventyConfig.addFilter("hasPin", (w) => hasPin(w));

  // Home page workshop list: every workshop that some area or service page lists.
  eleventyConfig.addFilter("directory", (routing, areas, services) => directoryEntries(routing, areas, services, site));
  eleventyConfig.addFilter("dirTenant", (list) => (list || []).some((e) => e.w.tenant_status === "tenant"));
  eleventyConfig.addFilter("linkify", (text) => linkify(text));
  eleventyConfig.addFilter("markupInline", (text) => markupInline(text));
  eleventyConfig.addFilter("markup", (text) => markup(text));
  eleventyConfig.addFilter("dirHas", (list, kind, key) => (list || []).some((e) => (kind === "svc" ? e.services.includes(key) : e.filterArea === key)));
  eleventyConfig.addGlobalData("thinUrls", () => buildPages().filter((p) => p.thin).map((p) => p.url));
  eleventyConfig.addFilter("dirHasMoreInfo", (list, lang, thin) => (list || []).some((e) => e.moreInfo && !thin.includes(e.moreInfo[lang])));

  // WhatsApp link: pre-filled text from i18n.json (brand filled in) plus the area's UTM tags.
  eleventyConfig.addFilter("waLink", (entry, text, campaign, lang, routing) =>
    waLink(entry.whatsapp, fillVars(text, { brand: site.brand }), {
      utm_source: routing.utm.source,
      utm_medium: routing.utm.medium,
      utm_campaign: campaign,
      utm_content: lang,
    }));

  // Fill {{ brand }} left in data-file text, and stop the build if any {{ ... }} is left unfilled.
  const escHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  eleventyConfig.addTransform("fill-brand", function (content) {
    const out = this.page.outputPath || "";
    if (!/\.(html|xml|txt)$/.test(out)) return content;
    const filled = content.replace(/\{\{\s*brand\s*\}\}/g, out.endsWith(".html") ? escHtml(site.brand) : site.brand);
    const left = filled.match(/\{\{[^}]*\}\}/);
    if (left) throw new Error(`${out}: unfilled template variable ${left[0]}`);
    if (/\[\/?WITH-WORKSHOPS\]/.test(filled)) throw new Error(`${out}: a [WITH-WORKSHOPS] marker reached the page`);
    return filled;
  });

  // URLs of pages that fail the thin-page guard, worked out fresh for each build.
  let blocked = new Set();
  eleventyConfig.on("eleventy.before", () => { blocked = new Set(buildPages().filter((p) => p.thin).map((p) => p.url)); });
  eleventyConfig.addTransform("link-guard", function (content) {
    if (!(this.page.outputPath || "").endsWith(".html")) return content;
    return guardLinks(content, blocked);
  });

  // Lazy-load every image that doesn't say otherwise.
  eleventyConfig.addTransform("lazy-images", function (content) {
    if (!(this.page.outputPath || "").endsWith(".html")) return content;
    return content.replace(/<img\b(?![^>]*\bloading=)([^>]*)>/gi, '<img loading="lazy" decoding="async"$1>');
  });

  return {
    dir: { input: "src", includes: "_includes", data: "_data", output: "_site" },
    templateFormats: ["njk"],
    htmlTemplateEngine: "njk",
  };
}
