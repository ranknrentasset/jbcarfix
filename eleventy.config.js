import crypto from "node:crypto";
import fs from "node:fs";
import { buildJsonLd } from "./lib/schema.js";

const site = JSON.parse(fs.readFileSync("src/_data/site.json", "utf8"));

// Replaces {{ brand }}, {{ workshop.name }}, {{ workshop.area }} written inside data-file text.
export function fillVars(text, vars) {
  return String(text).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key) => {
    const v = key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), vars);
    return v == null ? m : String(v);
  });
}

// wa.me link: https://wa.me/<number>?text=<urlencoded>, then the area's UTM tags.
export function waLink(number, text, utm) {
  let url = `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
  if (utm) url += "&" + new URLSearchParams(utm).toString();
  return url;
}

export default function (eleventyConfig) {
  // {{ brand }} in templates, from site.json.
  eleventyConfig.addGlobalData("brand", site.brand);
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

  eleventyConfig.addFilter("jsonLd", (page, data) => buildJsonLd(page, data));

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
    return filled;
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
