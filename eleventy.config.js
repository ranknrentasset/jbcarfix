import crypto from "node:crypto";
import fs from "node:fs";
import { buildJsonLd } from "./lib/schema.js";

export default function (eleventyConfig) {
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

  // WhatsApp link with the area's prefilled text and UTM tags.
  eleventyConfig.addFilter("waLink", (entry, text, campaign, lang, routing) => {
    const q = new URLSearchParams({
      text,
      utm_source: routing.utm.source,
      utm_medium: routing.utm.medium,
      utm_campaign: campaign,
      utm_content: lang,
    });
    return `https://wa.me/${entry.whatsapp}?${q.toString()}`;
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
