// Link guard: a link to one of our own pages that fails the thin-page guard becomes plain
// words (the <a> is removed). Applies everywhere except the language switch.
// Also the approved intro above the home workshop list.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { linkify, guardLinks } from "../eleventy.config.js";
import { buildPages } from "../lib/content.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "_site");
const dec = (h) => h.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? htmlFiles(p) : p.endsWith(".html") ? [p] : [];
  });
}
const anchors = (html) => [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({ attrs: m[1], inner: m[2], href: (m[1].match(/\shref="([^"]*)"/) || [])[1] }));
const words = (html) => dec(html.replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));

const HOME_LIST = {
  en: "Here are well-reviewed local car workshops and towing operators across Johor Bahru. Tap More info for each listing's details, or Directions to find it. JBCarFix is an independent guide and isn't affiliated with them. Chosen from public Google ratings and reviews and, where known, years in business. We aren't paid by the businesses we suggest.",
  ms: "Berikut ialah bengkel kereta dan pengendali tunda tempatan di seluruh Johor Bahru yang mendapat ulasan baik. Tekan Maklumat lanjut untuk butiran setiap senarai, atau Arah untuk ke sana. JBCarFix ialah panduan bebas dan tidak bergabung dengan mereka. Dipilih berdasarkan penilaian dan ulasan Google awam dan, jika diketahui, tempoh beroperasi. Kami tidak dibayar oleh perniagaan yang kami cadangkan.",
};
const listIntro = (html) => dec((html.match(/<p class="dir-intro">([^<]*)<\/p>/) || [])[1] || "");

test("home list intro: the approved wording, once, above the list", () => {
  for (const [rel, l] of [["index.html", "ms"], ["en/index.html", "en"]]) {
    const html = fs.readFileSync(path.join(SITE, rel), "utf8");
    assert.equal(listIntro(html), HOME_LIST[l], rel);
    assert.equal(html.split('class="dir-intro"').length - 1, 1, rel);
    assert.ok(html.indexOf('class="dir-intro"') < html.indexOf('class="dir-card"'), rel);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(SITE, "index.html"), "utf8"), /bergabung dengan bengkel-bengkel ini/);
});

test("linkify: only [words](/internal/path/) becomes a link; everything else stays escaped text", () => {
  assert.equal(linkify("See [Kulai](/kulai/) & more"), 'See <a href="/kulai/">Kulai</a> &amp; more');
  assert.equal(linkify("[x](https://example.com/) [y](//example.com/)"), "[x](https://example.com/) [y](//example.com/)");
  assert.equal(linkify('<script>alert("x")</script>'), "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  assert.equal(linkify("It's fine"), "It&#39;s fine", "same escaping as the template engine");
});

test("guardLinks: removes only the <a> around links to held-back pages; keeps the language switch", () => {
  const blocked = new Set(["/larkin/", "/en/larkin/"]);
  const html = '<p>Go to <a href="/larkin/#map">Larkin <b>now</b></a> or <a href="/kulai/">Kulai</a>.</p><a class="lang" hreflang="en" lang="en" href="/en/larkin/">English</a><a href="https://wa.me/1">W</a><a href="#contact">J</a>';
  assert.equal(guardLinks(html, blocked), '<p>Go to Larkin <b>now</b> or <a href="/kulai/">Kulai</a>.</p><a class="lang" hreflang="en" lang="en" href="/en/larkin/">English</a><a href="https://wa.me/1">W</a><a href="#contact">J</a>');
});

test("built site: no link to a held-back page anywhere, words kept, language switch untouched", () => {
  const blocked = new Set(buildPages().filter((p) => p.thin).map((p) => p.url));
  assert.ok(blocked.size > 0, "every page is still placeholder copy");
  for (const f of htmlFiles(SITE)) {
    const html = fs.readFileSync(f, "utf8"), rel = path.relative(SITE, f);
    for (const a of anchors(html)) {
      if (!a.href || !a.href.startsWith("/")) continue;
      if (/\sclass="lang"/.test(a.attrs)) continue;
      assert.ok(!blocked.has(a.href.split(/[?#]/)[0]), `${rel}: link to held-back ${a.href}`);
    }
    if (/class="hero"/.test(html) && !/404/.test(rel)) assert.match(html, /<a class="lang" hreflang="(en|ms)" lang="(en|ms)" href="\/[^"]*">/, `${rel}: language switch kept`);
  }
  const home = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
  const foot = words(home.match(/<footer[\s\S]*<\/footer>/)[0]);
  for (const w of ["Tayar", "Towing kereta", "Kulai", "Larkin", "Notis privasi"]) assert.ok(foot.includes(w), `footer keeps "${w}"`);
  assert.match(home, /<a href="\/privasi\/">Notis privasi<\/a>/, "privacy link is not under the content guard");
});

test("link guard with some real pages (throwaway build): body copy, chips, search, nav, footer, breadcrumb", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jbcf-"));
  for (const item of ["src", "lib", "public", "eleventy.config.js", "package.json"]) fs.cpSync(path.join(ROOT, item), path.join(tmp, item), { recursive: true });
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(tmp, "node_modules"));
  const real = (label, lang, extra = {}) => ({ title: `${label} ${lang} title | {{ brand }}`, description: `${label} ${lang} description.`, h1: `${label} ${lang} heading`,
    intro: `${label} ${lang} intro.`, blocks: [{ id: "one", heading: `${label} ${lang} block`, body: `${label} ${lang} block body.` }], faqs: [{ q: `${label} ${lang} question?`, a: `${label} ${lang} answer.` }], ...extra });
  const setCopy = (rel, label, extra = {}) => {
    const p = path.join(tmp, "src/_data", rel), d = JSON.parse(fs.readFileSync(p, "utf8"));
    d.status = "ready";
    for (const l of ["ms", "en"]) d[l] = real(label, l, extra[l] || {});
    fs.writeFileSync(p, JSON.stringify(d));
  };
  const pre = (l) => (l === "ms" ? "" : "/en");
  setCopy("home.json", "Home", Object.fromEntries(["ms", "en"].map((l) => [l, {
    blocks: [{ id: "one", heading: "Links", body: `Try [Kulai town](${pre(l)}/kulai/) or [Larkin town](${pre(l)}/larkin/).` }],
    faqs: [{ q: "Battery?", a: `See [the battery page](${pre(l)}/${l === "ms" ? "bateri" : "car-battery"}/).` }],
  }])));
  setCopy("areas/kulai.json", "Kulai", { ms: { intro: "Back [to home](/)." }, en: { intro: "Back [to home](/en/)." } });
  execFileSync(process.execPath, [path.join(ROOT, "node_modules/@11ty/eleventy/cmd.cjs"), "--quiet"], { cwd: tmp, stdio: "pipe" });
  const out = path.join(tmp, "_site"), read = (rel) => fs.readFileSync(path.join(out, rel), "utf8");

  for (const [rel, l] of [["index.html", "ms"], ["en/index.html", "en"]]) {
    const html = read(rel), p = pre(l);
    const kulaiName = "Kulai", larkinHref = `${p}/larkin/`;
    // Body copy: link to a real page stays, link to a held-back page becomes its words.
    assert.ok(html.includes(`<a href="${p}/kulai/">Kulai town</a>`), `${rel} body link to an indexable page`);
    assert.ok(html.includes("Larkin town") && !html.includes(`href="${larkinHref}"`), `${rel} body link to a held-back page is plain words`);
    assert.ok(words(html).includes("See the battery page."), `${rel} FAQ link words kept`);
    assert.doesNotMatch(html, /href="\/(en\/)?(bateri|car-battery)\/"/, `${rel} FAQ link removed`);
    // Hero chips and search results.
    const quick = html.match(/<nav class="quick" aria-label="[^"]*">\s*<ul class="qchips">[\s\S]*?<\/nav>\s*<nav class="quick"[\s\S]*?<\/nav>/)[0];
    assert.match(quick, new RegExp(`<a class="qchip" href="${p}/kulai/">`), `${rel} chip to Kulai`);
    assert.ok(!quick.includes(larkinHref) && words(quick).includes("Larkin"), `${rel} Larkin chip is words only`);
    const search = html.match(/<ul class="finder-list"[\s\S]*?<\/ul>/)[0];
    assert.ok(search.includes(`href="${p}/kulai/"`) && !search.includes(larkinHref) && words(search).includes("Larkin"), `${rel} search results`);
    // Header, footer.
    assert.match(html, new RegExp(`<a class="brand" href="${p}/">`), `${rel} brand link to the real home page`);
    const foot = html.match(/<footer[\s\S]*<\/footer>/)[0];
    assert.ok(foot.includes(`<a href="${p}/kulai/">${kulaiName}</a>`), `${rel} footer link to Kulai`);
    assert.ok(foot.includes(`<li>Larkin</li>`) && !foot.includes(larkinHref), `${rel} footer Larkin is words only`);
    assert.ok(!/href="(\/en)?\/(tayar|tyres)\/"/.test(foot) && words(foot).includes(l === "ms" ? "Tayar" : "Tyres"), `${rel} footer service words kept`);
  }
  // A real page's breadcrumb and body link back to the real home page; nav on a held-back page.
  const kulai = read("kulai/index.html");
  assert.match(kulai, /<li><a href="\/">Utama<\/a><\/li>/);
  assert.ok(kulai.includes('Back <a href="/">to home</a>.'));
  const larkin = read("larkin/index.html");
  assert.match(larkin, /<a class="brand" href="\/">/);
  assert.match(larkin, /<a class="lang" hreflang="en" lang="en" href="\/en\/larkin\/">/, "language switch kept even though /en/larkin/ is held back");
  assert.doesNotMatch(larkin, /<a href="\/larkin\/"|<a href="\/skudai\/"/, "held-back pages not linked from their own page or nearby chips");
  assert.match(read("en/kulai/index.html"), /<link rel="alternate" hreflang="ms" href="https:\/\/jbcarfix\.com\/kulai\/">/, "hreflang unchanged");
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("home list intro drops the not-paid sentence once any listed workshop is a tenant (throwaway build)", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jbcf-"));
  for (const item of ["src", "lib", "public", "eleventy.config.js", "package.json"]) fs.cpSync(path.join(ROOT, item), path.join(tmp, item), { recursive: true });
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(tmp, "node_modules"));
  const rp = path.join(tmp, "src/_data/routing.json"), r = JSON.parse(fs.readFileSync(rp, "utf8"));
  r.workshops["ws-hankook-kulai"].tenant_status = "tenant";
  fs.writeFileSync(rp, JSON.stringify(r));
  execFileSync(process.execPath, [path.join(ROOT, "node_modules/@11ty/eleventy/cmd.cjs"), "--quiet"], { cwd: tmp, stdio: "pipe" });
  for (const [rel, l] of [["index.html", "ms"], ["en/index.html", "en"]]) {
    const got = listIntro(fs.readFileSync(path.join(tmp, "_site", rel), "utf8"));
    assert.equal(got, HOME_LIST[l].replace(l === "ms" ? " Kami tidak dibayar oleh perniagaan yang kami cadangkan." : " We aren't paid by the businesses we suggest.", ""), rel);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
});
