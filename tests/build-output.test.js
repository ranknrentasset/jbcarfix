// Checks the built site. Runs after `npm run build` (npm test does that first),
// plus a throwaway build in a temp folder with fake "trial" and "tenant" workshops.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? htmlFiles(p) : p.endsWith(".html") ? [p] : [];
  });
}

// Everything that search engines or link previews read as data: JSON-LD, <title>, <meta>.
function machineReadable(html) {
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const meta = [...html.matchAll(/<meta\b[^>]*>/g)].map((m) => m[0]);
  const title = [...html.matchAll(/<title>([\s\S]*?)<\/title>/g)].map((m) => m[1]);
  return { ld, rest: meta.concat(title) };
}

function routingValues(routing) {
  return Object.values(routing.workshops).flatMap((w) => [w.workshop.name, w.phone, w.phone_display, w.whatsapp]).filter(Boolean);
}

function assertNoRoutingInData(siteDir, routing) {
  const values = routingValues(routing);
  assert.ok(values.length > 0, "expected workshops in routing.json");
  let ldCount = 0;
  for (const f of htmlFiles(siteDir)) {
    const { ld, rest } = machineReadable(fs.readFileSync(f, "utf8"));
    ldCount += ld.length;
    for (const blob of ld.concat(rest)) {
      for (const v of values) assert.ok(!blob.includes(v), `${path.relative(siteDir, f)}: "${v}" found in JSON-LD/meta`);
    }
  }
  assert.ok(ldCount > 0, "expected some JSON-LD in the build");
}

const dec = (h) => h.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const read = (rel, dir = path.join(ROOT, "_site")) => fs.readFileSync(path.join(dir, rel), "utf8");
const cards = (html) => [...html.matchAll(/<article class="ws-card"([^>]*)>([\s\S]*?)<\/article>/g)].map((m) => ({ attrs: m[1], body: m[2], id: m[1].match(/data-ev-workshop-id="([^"]+)"/)[1] }));
const routing = JSON.parse(fs.readFileSync(path.join(ROOT, "src/_data/routing.json"), "utf8"));

test("no {{ ... }} left unfilled and brand appears", () => {
  for (const f of htmlFiles(path.join(ROOT, "_site"))) {
    const html = fs.readFileSync(f, "utf8");
    assert.ok(!/\{\{/.test(html), `${f} has an unfilled variable`);
  }
  const brand = JSON.parse(fs.readFileSync(path.join(ROOT, "src/_data/site.json"), "utf8")).brand;
  assert.ok(read("index.html").includes(`<p class="connect">${brand} membantu`), "brand filled into Malay hero line");
});

test("no GA4 tag when ga4_measurement_id is empty", () => {
  const site = JSON.parse(fs.readFileSync(path.join(ROOT, "src/_data/site.json"), "utf8"));
  assert.equal(site.ga4_measurement_id, "");
  for (const f of htmlFiles(path.join(ROOT, "_site"))) {
    assert.ok(!/googletagmanager|ga4\.js|gtag\(/.test(fs.readFileSync(f, "utf8")), `${f} has a GA tag`);
  }
});

test("built JSON-LD and meta tags contain no routing phone, WhatsApp or workshop name", () => {
  assertNoRoutingInData(path.join(ROOT, "_site"), routing);
});

test("each page shows exactly the workshops routing.json lists, one card each", () => {
  const expectPage = { "kulai/index.html": routing.areas.kulai, "en/kulai/index.html": routing.areas.kulai,
    "skudai/index.html": routing.areas.skudai, "larkin/index.html": routing.areas.larkin,
    "gelang-patah/index.html": routing.areas["gelang-patah"], "en/bukit-indah/index.html": routing.areas["bukit-indah"],
    "tayar/index.html": routing.services.tayar, "en/car-aircon/index.html": routing.services["aircond-kereta"] };
  for (const [rel, ids] of Object.entries(expectPage)) assert.deepEqual(cards(read(rel)).map((c) => c.id), ids, rel);
  for (const rel of ["index.html", "en/index.html", "servis/index.html", "bateri/index.html", "mekanik-24-jam/index.html", "pakar-gearbox/index.html", "cat-kereta/index.html", "towing-kereta/index.html", "en/near-ksl/index.html"]) {
    const html = read(rel);
    assert.equal(cards(html).length, 0, rel);
    assert.match(html, /class="soon"/, rel);
    assert.doesNotMatch(html, /tel:|wa\.me|<form/, rel);
  }
});

test("trial cards: name, coverage, hours, call always, WhatsApp only when set, no form", () => {
  for (const rel of ["en/kulai/index.html", "kulai/index.html", "larkin/index.html", "tayar/index.html", "en/car-aircon/index.html"]) {
    const html = read(rel);
    const lang = rel.startsWith("en/") ? "en" : "ms";
    assert.doesNotMatch(html, /<form/, rel);
    for (const c of cards(html)) {
      const w = routing.workshops[c.id];
      assert.ok(dec(c.body).includes(`<h3>${w.workshop.name}</h3>`), c.id);
      assert.ok(c.body.includes(w.workshop.coverage[lang]), c.id);
      assert.equal((c.body.match(/<dt>/g) || []).length, 7, `${c.id} hours`);
      assert.ok(c.body.includes(`href="tel:${w.phone}"`) && c.body.includes(w.phone_display), c.id);
      assert.equal(c.body.includes("wa.me/"), !!w.whatsapp, `${c.id} WhatsApp button`);
      if (w.whatsapp) assert.ok(c.body.includes(`https://wa.me/${w.whatsapp}?text=`), c.id);
      if (w.whatsapp_label) assert.ok(c.body.includes(w.whatsapp_label), c.id);
      assert.doesNotMatch(c.body, /<img\b/, c.id);
      assert.match(c.attrs, /data-ev-tenant-status="trial"/);
    }
  }
  assert.doesNotMatch(read("en/larkin/index.html"), /company line|phone-label/);
});

test("disclosure lines show once per page, trial wording only", () => {
  const en = dec(read("en/kulai/index.html"));
  const ms = read("kulai/index.html");
  assert.equal(en.split("JBCarFix is an independent guide and isn't affiliated with them.").length - 1, 1);
  assert.equal(en.split("Chosen from public Google reviews and, where known, years in business.").length - 1, 1);
  assert.equal(en.split("We aren't paid by the workshops we suggest.").length - 1, 1);
  assert.equal(ms.split("JBCarFix ialah panduan bebas dan tidak bergabung dengan bengkel ini.").length - 1, 1);
  assert.equal(ms.split("Kami tidak dibayar oleh bengkel yang kami cadangkan.").length - 1, 1);
  for (const f of htmlFiles(path.join(ROOT, "_site"))) assert.doesNotMatch(fs.readFileSync(f, "utf8"), /flat fee|yuran tetap/, f);
});

test("WhatsApp links are encoded correctly and the note quotes the pre-fill", () => {
  const en = read("en/kulai/index.html"), ms = read("kulai/index.html");
  assert.ok(en.includes('href="https://wa.me/60177773633?text=Hi%2C%20I%20found%20you%20on%20JBCarFix.&amp;utm_source='), "English wa.me link");
  assert.ok(ms.includes('href="https://wa.me/60177773633?text=Hai%2C%20saya%20jumpa%20anda%20di%20JBCarFix.&amp;utm_source='), "Malay wa.me link");
  for (const [html, lang] of [[en, "en"], [ms, "ms"]]) {
    const quoted = dec(html.match(/<p class="note">([^<]*)<\/p>/)[1]).match(/"([^"]*)"/)[1];
    const wa = dec(html.match(/href="(https:\/\/wa\.me\/[^"]+)"/)[1]);
    assert.equal(quoted, new URL(wa).searchParams.get("text"), lang);
  }
  // No WhatsApp on the page -> no note.
  assert.doesNotMatch(read("larkin/index.html"), /class="note"/);
});

// Clicks the built buttons in a mocked page and returns what reached gtag.
function clickAll(html, siteJs) {
  const calls = [], links = [];
  for (const c of cards(html)) {
    const dataset = Object.fromEntries([...c.attrs.matchAll(/data-ev-([a-z-]+)="([^"]*)"/g)].map((m) => ["ev" + m[1].replace(/(^|-)([a-z])/g, (x, d, ch) => ch.toUpperCase()), m[2]]));
    for (const ev of [...c.body.matchAll(/data-ev="([a-z_]+)"/g)].map((m) => m[1])) {
      const l = { getAttribute: () => ev, closest: () => ({ dataset }), addEventListener: (t, fn) => { l.fn = fn; } };
      links.push(l);
    }
  }
  const win = {
    gtag: (...a) => calls.push([a[0], a[1], { ...a[2] }]),
    location: { search: "", origin: "https://example.pages.dev" },
    localStorage: { getItem: () => null, setItem: () => {} },
    URLSearchParams,
    document: { querySelectorAll: (sel) => (sel.includes("a[data-ev]") ? links : []) },
  };
  win.window = win;
  vm.runInNewContext(siteJs, { ...win, window: win });
  links.forEach((l) => l.fn());
  return calls;
}

test("each card's buttons send GA events with that card's workshop_id", () => {
  const calls = clickAll(read("en/kulai/index.html"), read("assets/site.js"));
  const base = { area: "kulai", lang: "en", tenant_status: "trial", service: "area", page_path: "/en/kulai/" };
  assert.deepEqual(calls, [
    ["event", "click_call", { ...base, workshop_id: "ws-tyreplus-kulai" }],
    ["event", "click_whatsapp", { ...base, workshop_id: "ws-tyreplus-kulai" }],
    ["event", "click_call", { ...base, workshop_id: "ws-hankook-kulai" }],
  ]);
  const svc = clickAll(read("tayar/index.html"), read("assets/site.js"));
  assert.ok(svc.length && svc.every((c) => c[2].service === "tayar" && c[2].area === "all"));
});

test("tenant workshop and GA4 ID (throwaway build): form, logo, tenant line, gtag", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jbcf-"));
  for (const item of ["src", "lib", "public", "eleventy.config.js", "package.json"]) {
    fs.cpSync(path.join(ROOT, item), path.join(tmp, item), { recursive: true });
  }
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(tmp, "node_modules"));

  const rp = path.join(tmp, "src/_data/routing.json");
  const r = JSON.parse(fs.readFileSync(rp, "utf8"));
  const hours = r.workshops[r.areas.kulai[0]].hours;
  r.workshops["ws-test-tenant"] = { workshop_id: "ws-test-tenant", workshop: { name: "Test Tenant Workshop", area: "Skudai", coverage: { en: "Workshop in Testville", ms: "Bengkel di Testville" }, logo: "/assets/test-logo.png" },
    phone: "+60123456782", phone_display: "012-345 6782", whatsapp: "60123456782", web3forms_key: "test-key-2", tenant_status: "tenant", hours };
  r.areas.skudai = ["ws-test-tenant"];
  fs.writeFileSync(rp, JSON.stringify(r));
  const sp = path.join(tmp, "src/_data/site.json");
  const tmpSite = JSON.parse(fs.readFileSync(sp, "utf8"));
  tmpSite.ga4_measurement_id = "G-TEST12345";
  fs.writeFileSync(sp, JSON.stringify(tmpSite));

  execFileSync(process.execPath, [path.join(ROOT, "node_modules/@11ty/eleventy/cmd.cjs"), "--quiet"], { cwd: tmp, stdio: "pipe" });
  const out = path.join(tmp, "_site");
  assertNoRoutingInData(out, r);

  const skudaiEn = dec(read("en/skudai/index.html", out));
  assert.ok(skudaiEn.includes("Test Tenant Workshop pays JBCarFix a flat fee to be featured here. It doesn't change the price they quote you."));
  assert.ok(read("skudai/index.html", out).includes("Test Tenant Workshop membayar yuran tetap kepada JBCarFix untuk dipaparkan di sini. Ia tidak mengubah harga yang mereka sebut kepada anda."));
  assert.doesNotMatch(skudaiEn, /<li>[^<]*(independent guide|public Google reviews)/);
  assert.match(skudaiEn, /<img[^>]+test-logo\.png/);
  assert.match(skudaiEn, /name="access_key" value="test-key-2"/);
  assert.match(skudaiEn, /name="workshop_id" value="ws-test-tenant"/);
  assert.doesNotMatch(read("en/kulai/index.html", out), /<form/);

  // GA4: with an ID set, gtag.js loads async on every page and config runs with that ID.
  for (const f of htmlFiles(out)) {
    const html = fs.readFileSync(f, "utf8");
    assert.ok(html.includes('<script async src="https://www.googletagmanager.com/gtag/js?id=G-TEST12345"></script>'), `${f} lacks gtag.js`);
    assert.match(html, /<script src="\/assets\/ga4\.js\?v=[0-9a-f]+" data-ga4-id="G-TEST12345" defer><\/script>/);
  }
  const gaWin = { document: { currentScript: { getAttribute: (n) => (n === "data-ga4-id" ? "G-TEST12345" : null) } } };
  vm.runInNewContext(read("assets/ga4.js", out), { window: gaWin });
  assert.deepEqual(Array.from(gaWin.dataLayer[1]), ["config", "G-TEST12345"]);
  const calls = clickAll(read("en/skudai/index.html", out), read("assets/site.js", out));
  assert.deepEqual(calls.map((c) => [c[1], c[2].workshop_id, c[2].tenant_status]), [["click_call", "ws-test-tenant", "tenant"], ["click_whatsapp", "ws-test-tenant", "tenant"]]);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test("every listed workshop has a phone_display matching its tel: number", () => {
  for (const [id, w] of Object.entries(routing.workshops)) {
    assert.ok(w.phone_display, `${id} lacks phone_display`);
    assert.equal(w.phone_display.replace(/\D/g, "").replace(/^0/, "60"), w.phone.replace(/\D/g, ""), id);
  }
});

const sitemapUrls = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

test("thin-page guard: placeholder or coming-soon pages are noindex,follow, out of the sitemap, no hreflang", () => {
  const site = path.join(ROOT, "_site");
  assert.deepEqual(sitemapUrls(read("sitemap.xml")), [], "every page is still placeholder copy, so the sitemap is empty");
  for (const f of htmlFiles(site)) {
    const html = fs.readFileSync(f, "utf8");
    assert.match(html, /<meta name="robots" content="noindex,follow">/, f);
    assert.doesNotMatch(html, /<link rel="alternate" hreflang=/, f);
  }
});

test("thin-page guard lifts once copy is real and workshops are listed (throwaway build)", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jbcf-"));
  for (const item of ["src", "lib", "public", "eleventy.config.js", "package.json"]) {
    fs.cpSync(path.join(ROOT, item), path.join(tmp, item), { recursive: true });
  }
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(tmp, "node_modules"));
  const realCopy = (label, lang) => ({
    title: `${label} ${lang} title | {{ brand }}`, description: `${label} ${lang} description.`, h1: `${label} ${lang} heading`,
    intro: `${label} ${lang} intro text written for this page.`, blocks: [{ id: "one", heading: `${label} ${lang} block`, body: `${label} ${lang} block body.` }],
    faqs: [{ q: `${label} ${lang} question?`, a: `${label} ${lang} answer.` }],
  });
  const setCopy = (rel, label, langs) => {
    const p = path.join(tmp, "src/_data", rel);
    const d = JSON.parse(fs.readFileSync(p, "utf8"));
    d.status = "ready";
    for (const l of langs) d[l] = realCopy(label, l);
    fs.writeFileSync(p, JSON.stringify(d));
  };
  setCopy("areas/kulai.json", "Kulai", ["ms", "en"]);   // real copy + workshops -> indexable pair
  setCopy("areas/skudai.json", "Skudai", ["en"]);       // Malay still DRAFT -> only English indexable, no hreflang pair
  setCopy("areas/larkin.json", "Larkin", ["ms", "en"]); // real copy but no workshops -> stays noindex
  setCopy("services/tayar.json", "Tyres", ["ms", "en"]);
  const rp = path.join(tmp, "src/_data/routing.json");
  const r = JSON.parse(fs.readFileSync(rp, "utf8"));
  r.areas.larkin = [];
  fs.writeFileSync(rp, JSON.stringify(r));

  execFileSync(process.execPath, [path.join(ROOT, "node_modules/@11ty/eleventy/cmd.cjs"), "--quiet"], { cwd: tmp, stdio: "pipe" });
  const out = path.join(tmp, "_site");
  const B = "https://jbcarfix.com";
  const xml = read("sitemap.xml", out);
  assert.deepEqual(sitemapUrls(xml).sort(), [`${B}/en/kulai/`, `${B}/en/skudai/`, `${B}/en/tyres/`, `${B}/kulai/`, `${B}/tayar/`].sort());

  const entry = (u) => xml.split("<url>").find((x) => x.includes(`<loc>${B}${u}</loc>`));
  assert.match(entry("/kulai/"), /hreflang="ms" href="https:\/\/jbcarfix\.com\/kulai\/"/);
  assert.match(entry("/kulai/"), /hreflang="en" href="https:\/\/jbcarfix\.com\/en\/kulai\/"/);
  assert.match(entry("/kulai/"), /hreflang="x-default" href="https:\/\/jbcarfix\.com\/kulai\/"/);
  assert.doesNotMatch(entry("/en/skudai/"), /xhtml:link/, "partner excluded -> no hreflang pair in the sitemap");

  const kulai = read("en/kulai/index.html", out);
  assert.doesNotMatch(kulai, /name="robots"/);
  assert.match(kulai, /<link rel="alternate" hreflang="ms" href="https:\/\/jbcarfix\.com\/kulai\/">/);
  const skudaiEn = read("en/skudai/index.html", out);
  assert.doesNotMatch(skudaiEn, /name="robots"/);
  assert.doesNotMatch(skudaiEn, /<link rel="alternate" hreflang=/);
  assert.match(read("skudai/index.html", out), /<meta name="robots" content="noindex,follow">/);
  assert.match(read("larkin/index.html", out), /<meta name="robots" content="noindex,follow">/);
  assert.match(read("index.html", out), /<meta name="robots" content="noindex,follow">/, "home: no workshops yet");

  fs.rmSync(tmp, { recursive: true, force: true });
});
