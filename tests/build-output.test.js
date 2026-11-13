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
  assert.ok(read("index.html").includes(`<p class="connect">${brand} ialah panduan bebas`), "brand filled into Malay footer line");
});

// A page with no workshop must not show buttons, a contact box, or wording that suggests a
// workshop is recommended or coming ("call us", "we'll find you a workshop", "coming soon"...).
const NO_WORKSHOP_HINTS = /coming soon|akan datang|tidak lama lagi|call us|call now|hubungi kami|we'll find|we will find|find you a (workshop|mechanic)|carikan (anda )?bengkel|will be listed|akan disenaraikan|recommended workshop|bengkel (yang )?disyorkan|contact a workshop|menghubungi bengkel|well-reviewed|ulasan baik|Call or WhatsApp|Hubungi atau WhatsApp|See workshops|Lihat bengkel/i;
function assertNoWorkshopHints(html, label) {
  assert.doesNotMatch(html, /tel:|wa\.me|<form|class="contact"|class="soon"|class="ws-|class="btn|class="actbar"|class="jump"|href="#contact"/, label);
  const visible = dec(html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " "));
  assert.doesNotMatch(visible, NO_WORKSHOP_HINTS, label);
}

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
    "tayar/index.html": routing.services.tayar, "en/car-aircon/index.html": routing.services["aircond-kereta"],
    "cat-kereta/index.html": ["ws-ahbao", "ws-gc-auto"], "en/car-body-paint/index.html": ["ws-ahbao", "ws-gc-auto"],
    "towing-kereta/index.html": ["ws-ty-towing", "ws-kone-towing"], "en/car-towing/index.html": ["ws-ty-towing", "ws-kone-towing"] };
  for (const [rel, ids] of Object.entries(expectPage)) assert.deepEqual(cards(read(rel)).map((c) => c.id), ids, rel);
  for (const rel of ["index.html", "en/index.html", "servis/index.html", "bateri/index.html", "mekanik-24-jam/index.html", "pakar-gearbox/index.html", "en/near-ksl/index.html"]) {
    const html = read(rel);
    assert.equal(cards(html).length, 0, rel);
    assertNoWorkshopHints(html, rel);
  }
});

test("pages with no workshop carry no buttons and no wording that hints at a workshop", () => {
  const site = path.join(ROOT, "_site");
  let checked = 0;
  for (const f of htmlFiles(site)) {
    const html = fs.readFileSync(f, "utf8");
    if (cards(html).length || !/class="hero"/.test(html) || /privasi|privacy|terima-kasih|thank-you/.test(f)) continue;
    assertNoWorkshopHints(html, f);
    checked++;
  }
  assert.equal(checked, 12, "no-workshop pages: home x2, battery x2, servicing x2, 24-hour x2, gearbox x2, near KSL, 404");
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

const INTRO = {
  en: "Here are well-reviewed local workshops for this area. Call or WhatsApp them directly. JBCarFix is an independent guide and isn't affiliated with them. Chosen from public Google reviews and, where known, years in business. We aren't paid by the workshops we suggest.",
  ms: "Berikut ialah bengkel tempatan yang mendapat ulasan baik di kawasan ini. Hubungi atau WhatsApp mereka terus. JBCarFix ialah panduan bebas dan tidak bergabung dengan bengkel-bengkel ini. Dipilih berdasarkan ulasan Google awam dan, jika diketahui, tempoh beroperasi. Kami tidak dibayar oleh bengkel yang kami cadangkan.",
};
const LEAD = { en: INTRO.en.split(" JBCarFix")[0], ms: INTRO.ms.split(" JBCarFix")[0] };
const introOf = (html) => dec((html.match(/<p class="ws-intro">([^<]*)<\/p>/) || [])[1] || "");

test("trial pages show the plural intro once, before the cards, and no per-card lines", () => {
  for (const [rel, lang] of [["en/kulai/index.html", "en"], ["kulai/index.html", "ms"], ["tayar/index.html", "ms"], ["en/car-aircon/index.html", "en"]]) {
    const html = read(rel);
    assert.equal(introOf(html), INTRO[lang], rel);
    assert.equal(html.split('class="ws-intro"').length - 1, 1, rel);
    assert.ok(html.indexOf('class="ws-intro"') < html.indexOf('class="ws-card"'), rel);
    assert.doesNotMatch(html, /class="ws-disclosure"/, rel);
    assert.equal(dec(html).split("We aren't paid by").length + dec(html).split("Kami tidak dibayar").length - 2, 1, rel);
  }
  for (const f of htmlFiles(path.join(ROOT, "_site"))) assert.doesNotMatch(fs.readFileSync(f, "utf8"), /flat fee|yuran tetap/, f);
});

test("site-wide lines and structured data use the approved guide wording", () => {
  const en = dec(read("en/index.html")), ms = dec(read("index.html"));
  const ORG = {
    en: "JBCarFix is an independent guide to car workshops in Johor Bahru. We're not a workshop. Prices, timing and any warranty come from the workshop itself. Each page says whether a listed workshop pays us.",
    ms: "JBCarFix ialah panduan bebas bengkel kereta di Johor Bahru. Kami bukan bengkel. Harga, masa siap dan jaminan kerja ditentukan oleh bengkel itu sendiri. Setiap halaman menyatakan sama ada bengkel yang disenaraikan membayar kami.",
  };
  for (const [html, l, top] of [[en, "en", "An independent guide to local car workshops in Johor Bahru."], [ms, "ms", "Panduan bebas bengkel kereta tempatan di Johor Bahru."]]) {
    assert.ok(html.includes(`<p class="connect">${top}</p>`), `${l} top line`);
    assert.ok(html.includes(`<p class="connect">${ORG[l]}</p>`), `${l} footer`);
    assert.ok(html.includes(`"description":"${ORG[l]}"`), `${l} Organization description`);
  }
  assert.ok(read("en/kulai/index.html").includes('"name":"Guide to local car workshops in Johor Bahru"'));
  assert.ok(read("kulai/index.html").includes('"name":"Panduan bengkel kereta tempatan di Johor Bahru"'));
  for (const f of htmlFiles(path.join(ROOT, "_site"))) assert.doesNotMatch(fs.readFileSync(f, "utf8"), /connects drivers|menghubungkan pemandu|Connecting drivers/i, f);
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
  r.areas.skudai = ["ws-test-tenant", "ws-acs-skudai"]; // mixed: one tenant card, one trial card
  r.areas.larkin = ["ws-test-tenant"];                   // tenant only
  fs.writeFileSync(rp, JSON.stringify(r));
  const sp = path.join(tmp, "src/_data/site.json");
  const tmpSite = JSON.parse(fs.readFileSync(sp, "utf8"));
  tmpSite.ga4_measurement_id = "G-TEST12345";
  fs.writeFileSync(sp, JSON.stringify(tmpSite));

  execFileSync(process.execPath, [path.join(ROOT, "node_modules/@11ty/eleventy/cmd.cjs"), "--quiet"], { cwd: tmp, stdio: "pipe" });
  const out = path.join(tmp, "_site");
  assertNoRoutingInData(out, r);

  const skudaiEn = dec(read("en/skudai/index.html", out));
  const TENANT = { en: "JBCarFix is a car workshop guide. Test Tenant Workshop pays JBCarFix a flat fee to be featured here. It doesn't change the price they quote you.",
    ms: "JBCarFix ialah panduan bengkel kereta. Test Tenant Workshop membayar yuran tetap kepada JBCarFix untuk dipaparkan di sini. Ia tidak mengubah harga yang mereka sebut kepada anda." };
  const CLAIMS = { en: INTRO.en.slice(LEAD.en.length + 1), ms: INTRO.ms.slice(LEAD.ms.length + 1) };
  for (const [rel, lang] of [["en/skudai/index.html", "en"], ["skudai/index.html", "ms"]]) {
    const html = read(rel, out);
    assert.equal(introOf(html), LEAD[lang], `${rel}: mixed page shares only the first two sentences`);
    const cs = cards(html);
    const tenantCard = dec(cs.find((c) => c.id === "ws-test-tenant").body), trialCard = dec(cs.find((c) => c.id === "ws-acs-skudai").body);
    assert.ok(tenantCard.includes(`<p class="ws-disclosure">${TENANT[lang]}</p>`), `${rel} tenant card line`);
    assert.ok(!tenantCard.includes(CLAIMS[lang].split(".")[0]), `${rel}: tenant card has no independence or not-paid claim`);
    const TRIAL = { en: "JBCarFix isn't affiliated with ACS Car Aircond Service. Chosen from public Google reviews and, where known, years in business. ACS Car Aircond Service doesn't pay us.",
      ms: "JBCarFix tidak bergabung dengan ACS Car Aircond Service. Dipilih berdasarkan ulasan Google awam dan, jika diketahui, tempoh beroperasi. ACS Car Aircond Service tidak membayar kami." };
    assert.ok(trialCard.includes(`<p class="ws-disclosure">${TRIAL[lang].replaceAll("ACS Car Aircond Service", r.workshops["ws-acs-skudai"].workshop.name)}</p>`), `${rel} singular trial card line`);
    assert.ok(!trialCard.includes("flat fee") && !trialCard.includes("yuran tetap"), rel);
    assert.ok(!dec(html).includes(CLAIMS[lang]), `${rel}: the plural trial sentences are not on a mixed page`);
  }
  const larkinEn = read("en/larkin/index.html", out);
  assert.equal(introOf(larkinEn), LEAD.en, "tenant-only page: first two sentences only");
  assert.ok(dec(larkinEn).includes(TENANT.en));
  assert.doesNotMatch(dec(larkinEn), /aren't paid|independent guide and isn't affiliated/);
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
  assert.deepEqual(calls.filter((c) => c[2].workshop_id === "ws-test-tenant").map((c) => [c[1], c[2].tenant_status]), [["click_call", "tenant"], ["click_whatsapp", "tenant"]]);
  assert.ok(calls.some((c) => c[2].workshop_id === "ws-acs-skudai" && c[2].tenant_status === "trial"));

  fs.rmSync(tmp, { recursive: true, force: true });
});

test("every listed workshop has a phone_display matching its tel: number", () => {
  for (const [id, w] of Object.entries(routing.workshops)) {
    assert.ok(w.phone_display, `${id} lacks phone_display`);
    assert.equal(w.phone_display.replace(/\D/g, "").replace(/^0/, "60"), w.phone.replace(/\D/g, ""), id);
  }
});

const sitemapUrls = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

test("thin-page guard: placeholder pages are noindex,follow, out of the sitemap, no hreflang", () => {
  const site = path.join(ROOT, "_site");
  assert.deepEqual(sitemapUrls(read("sitemap.xml")), [], "every page is still placeholder copy, so the sitemap is empty");
  // The hold list is empty, so body-and-paint and towing stay hidden only through the placeholder rule.
  for (const rel of ["cat-kereta/index.html", "en/car-body-paint/index.html", "towing-kereta/index.html", "en/car-towing/index.html"]) {
    assert.match(read(rel), /<meta name="robots" content="noindex,follow">/, rel);
    assert.ok(cards(read(rel)).length === 2, `${rel} lists its workshops but stays hidden: copy is placeholder`);
  }
  for (const f of htmlFiles(site)) {
    const html = fs.readFileSync(f, "utf8");
    assert.match(html, /<meta name="robots" content="noindex,follow">/, f);
    assert.doesNotMatch(html, /<link rel="alternate" hreflang=/, f);
  }
});

test("thin-page guard lifts once copy is real, with or without workshops; held pages stay hidden (throwaway build)", () => {
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
  setCopy("areas/larkin.json", "Larkin", ["ms", "en"]); // real copy, no workshops -> indexable, no contact box
  setCopy("home.json", "Home", ["ms", "en"]);           // real copy, no workshops -> indexable
  setCopy("services/tayar.json", "Tyres", ["ms", "en"]);
  setCopy("services/cat-kereta.json", "Paint", ["ms", "en"]);    // on the hold list -> stays hidden
  setCopy("services/towing-kereta.json", "Towing", ["ms", "en"]); // on the hold list -> stays hidden
  const rp = path.join(tmp, "src/_data/routing.json");
  const r = JSON.parse(fs.readFileSync(rp, "utf8"));
  r.areas.larkin = [];
  fs.writeFileSync(rp, JSON.stringify(r));
  const sp = path.join(tmp, "src/_data/site.json");
  const tmpSite = JSON.parse(fs.readFileSync(sp, "utf8"));
  tmpSite.indexHold = ["cat-kereta", "car-body-paint", "towing-kereta", "car-towing"]; // fixture hold list
  fs.writeFileSync(sp, JSON.stringify(tmpSite));

  execFileSync(process.execPath, [path.join(ROOT, "node_modules/@11ty/eleventy/cmd.cjs"), "--quiet"], { cwd: tmp, stdio: "pipe" });
  const out = path.join(tmp, "_site");
  const B = "https://jbcarfix.com";
  const xml = read("sitemap.xml", out);
  assert.deepEqual(sitemapUrls(xml).sort(), [`${B}/`, `${B}/en/`, `${B}/en/kulai/`, `${B}/en/larkin/`, `${B}/en/skudai/`, `${B}/en/tyres/`, `${B}/kulai/`, `${B}/larkin/`, `${B}/tayar/`].sort());

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
  for (const rel of ["index.html", "en/index.html", "larkin/index.html", "en/larkin/index.html"]) {
    const html = read(rel, out);
    assert.doesNotMatch(html, /name="robots"/, `${rel}: real copy, no workshop -> indexable`);
    assert.match(html, /<link rel="alternate" hreflang="x-default"/, rel);
    assertNoWorkshopHints(html, rel);
  }
  for (const rel of ["cat-kereta/index.html", "en/car-body-paint/index.html", "towing-kereta/index.html", "en/car-towing/index.html"]) {
    const html = read(rel, out);
    assert.match(html, /<meta name="robots" content="noindex,follow">/, `${rel} is on the hold list`);
    assert.doesNotMatch(html, /<link rel="alternate" hreflang=/, rel);
  }

  fs.rmSync(tmp, { recursive: true, force: true });
});

// Towing cards may not mention the operator's own workshop, claim services, arrival-time
// promises or "no hidden fees". Checked on the towing pages and on any routing entry listed there.
const TOWING_BANNED = /20\s*[-–—]\s*30\s*(min|minit)|no hidden (fees?|charges?)|tiada caj tersembunyi|\bclaims?\b|tuntutan|own workshop|our workshop|bengkel (kami|sendiri)|bengkel milik/i;

test("towing cards: banned phrases are caught", () => {
  for (const bad of ["Arrives in 20-30 min", "Tiba dalam 20–30 minit", "No hidden fees", "Tiada caj tersembunyi", "Insurance claim help", "Bantuan tuntutan insurans", "Towed to our own workshop", "Ke bengkel kami"]) {
    assert.match(bad, TOWING_BANNED, bad);
  }
  assert.doesNotMatch("Workshop in Taman Mutiara Rini, Skudai. Open 24 hours.", TOWING_BANNED);
});

test("towing cards carry no banned phrases", () => {
  for (const id of routing.services["towing-kereta"] || []) {
    const w = routing.workshops[id];
    assert.doesNotMatch(JSON.stringify({ name: w.workshop.name, coverage: w.workshop.coverage, labels: [w.phone_label, w.whatsapp_label] }), TOWING_BANNED, id);
  }
  for (const rel of ["towing-kereta/index.html", "en/car-towing/index.html"]) {
    for (const c of cards(read(rel))) assert.doesNotMatch(dec(c.body.replace(/<[^>]+>/g, " ")), TOWING_BANNED, `${rel} ${c.id}`);
  }
});

test("towing note shows only on towing cards (throwaway build with a fixture towing workshop)", () => {
  const NOTE = { en: "Ask for the full price before the tow starts, and agree on which workshop your car goes to.",
    ms: "Minta harga penuh sebelum kereta ditunda, dan tetapkan bengkel mana kereta anda akan dihantar." };
  for (const [rel, lang] of [["towing-kereta/index.html", "ms"], ["en/car-towing/index.html", "en"]]) {
    const cs = cards(read(rel));
    assert.deepEqual(cs.map((c) => c.id), ["ws-ty-towing", "ws-kone-towing"], rel);
    for (const c of cs) assert.ok(dec(c.body).includes(`<p class="ws-towing">${NOTE[lang]}</p>`), `${rel} ${c.id}`);
  }
  for (const f of htmlFiles(path.join(ROOT, "_site"))) {
    if (/towing-kereta|car-towing/.test(f)) continue;
    const html = dec(fs.readFileSync(f, "utf8"));
    assert.ok(!html.includes(NOTE.en) && !html.includes(NOTE.ms), `${f}: towing note outside the towing pages`);
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jbcf-"));
  for (const item of ["src", "lib", "public", "eleventy.config.js", "package.json"]) {
    fs.cpSync(path.join(ROOT, item), path.join(tmp, item), { recursive: true });
  }
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(tmp, "node_modules"));
  const rp = path.join(tmp, "src/_data/routing.json");
  const r = JSON.parse(fs.readFileSync(rp, "utf8"));
  const hours = r.workshops[r.areas.kulai[0]].hours;
  r.workshops["ws-test-tow"] = { workshop_id: "ws-test-tow", workshop: { name: "Test Tow", area: "Skudai", coverage: { en: "Towing around Testville", ms: "Tunda sekitar Testville" } },
    phone: "+60123456783", phone_display: "012-345 6783", whatsapp: null, tenant_status: "trial", hours, services: ["towing-kereta"] };
  r.services["towing-kereta"] = ["ws-test-tow"]; // replaces the real towing list in this throwaway build
  r.areas.skudai = ["ws-test-tow", "ws-acs-skudai"]; // a towing workshop on an area page: no note there
  fs.writeFileSync(rp, JSON.stringify(r));
  execFileSync(process.execPath, [path.join(ROOT, "node_modules/@11ty/eleventy/cmd.cjs"), "--quiet"], { cwd: tmp, stdio: "pipe" });
  const out = path.join(tmp, "_site");
  for (const [rel, lang] of [["towing-kereta/index.html", "ms"], ["en/car-towing/index.html", "en"]]) {
    const cs = cards(read(rel, out));
    assert.deepEqual(cs.map((c) => c.id), ["ws-test-tow"], rel);
    assert.ok(dec(cs[0].body).includes(`<p class="ws-towing">${NOTE[lang]}</p>`), rel);
    assert.doesNotMatch(dec(cs[0].body.replace(/<[^>]+>/g, " ")), TOWING_BANNED, rel);
  }
  for (const f of htmlFiles(out)) {
    if (/towing-kereta|car-towing/.test(f)) continue;
    assert.doesNotMatch(fs.readFileSync(f, "utf8"), /class="ws-towing"/, f);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("body-and-paint and towing cards: call/WhatsApp as listed, no hours box, no 24-hour, arrival, price, cross-border or insurance wording", () => {
  const FORBIDDEN = /24[- ]?(hour|jam)|arriv|tiba dalam|\bminit\b|\bmins?\b|RM\s?\d|price from|harga dari|murah|cheap|singapore|singapura|cross[- ]border|rentas sempadan|insuran|insurance/i;
  for (const rel of ["cat-kereta/index.html", "en/car-body-paint/index.html", "towing-kereta/index.html", "en/car-towing/index.html"]) {
    for (const c of cards(read(rel))) {
      const w = routing.workshops[c.id];
      assert.equal(w.tenant_status, "trial", c.id);
      assert.ok(c.body.includes(`href="tel:${w.phone}"`) && c.body.includes(w.phone_display), c.id);
      assert.equal(c.body.includes("wa.me/"), c.id === "ws-ty-towing", `${c.id} WhatsApp`);
      assert.doesNotMatch(c.body, /class="hours"/, c.id);
      assert.doesNotMatch(dec(c.body.replace(/<[^>]+>/g, " ")).replace("full price", ""), FORBIDDEN, `${rel} ${c.id}`);
    }
  }
  assert.ok(read("en/car-towing/index.html").includes('href="https://wa.me/60167990517?text='));
});

test("the backup body-and-paint workshop is stored but rendered nowhere", () => {
  assert.ok(routing.workshops["ws-mega-car-paint"], "stored in routing.json");
  for (const ids of [...Object.values(routing.areas), ...Object.values(routing.services)]) assert.ok(!ids.includes("ws-mega-car-paint"));
  for (const f of htmlFiles(path.join(ROOT, "_site"))) {
    const html = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(html, /ws-mega-car-paint|Mega Car Paint|019-779 0613|60197790613/, f);
  }
});

test("[WITH-WORKSHOPS] copy shows only on pages with workshops; markers never reach the page (throwaway build)", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jbcf-"));
  for (const item of ["src", "lib", "public", "eleventy.config.js", "package.json"]) {
    fs.cpSync(path.join(ROOT, item), path.join(tmp, item), { recursive: true });
  }
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(tmp, "node_modules"));
  const mark = (rel) => {
    const p = path.join(tmp, "src/_data", rel);
    const d = JSON.parse(fs.readFileSync(p, "utf8"));
    for (const l of ["ms", "en"]) {
      d[l].intro = `Always shown ${l}.[WITH-WORKSHOPS] Pick one of the workshops below ${l}.[/WITH-WORKSHOPS] Also always ${l}.`;
      d[l].blocks = [{ id: "always", heading: `Kept ${l}`, body: `Kept body ${l}.` },
        { id: "ww", heading: `Workshop tips ${l}`, body: `[WITH-WORKSHOPS]Only with workshops ${l}.[/WITH-WORKSHOPS]` }];
    }
    fs.writeFileSync(p, JSON.stringify(d));
  };
  mark("areas/kulai.json");   // has workshops
  mark("home.json");           // no workshops
  execFileSync(process.execPath, [path.join(ROOT, "node_modules/@11ty/eleventy/cmd.cjs"), "--quiet"], { cwd: tmp, stdio: "pipe" });
  const out = path.join(tmp, "_site");
  for (const f of htmlFiles(out)) assert.doesNotMatch(fs.readFileSync(f, "utf8"), /WITH-WORKSHOPS/, f);
  for (const [rel, l] of [["kulai/index.html", "ms"], ["en/kulai/index.html", "en"]]) {
    const html = dec(read(rel, out));
    assert.ok(html.includes(`Always shown ${l}. Pick one of the workshops below ${l}. Also always ${l}.`), rel);
    assert.ok(html.includes(`Only with workshops ${l}.`) && html.includes(`Workshop tips ${l}`), rel);
  }
  for (const [rel, l] of [["index.html", "ms"], ["en/index.html", "en"]]) {
    const html = dec(read(rel, out));
    assert.ok(html.includes(`Always shown ${l}. Also always ${l}.`), rel);
    assert.ok(!html.includes(`Pick one of the workshops below`) && !html.includes("Only with workshops") && !html.includes("Workshop tips"), rel);
    assert.ok(html.includes(`Kept body ${l}.`), rel);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("design: the mobile action bar and hero jump link only point to the cards; tracked links stay inside the cards", () => {
  for (const rel of ["kulai/index.html", "en/car-towing/index.html", "tayar/index.html"]) {
    const html = read(rel);
    const bar = html.match(/<div class="actbar">([\s\S]*?)<\/div>/);
    assert.ok(bar, `${rel} has the action bar`);
    assert.match(bar[1], /<a href="#contact">/);
    assert.doesNotMatch(bar[1], /tel:|wa\.me|data-ev/, `${rel}: bar adds no untracked call or WhatsApp link`);
    assert.match(html, /<a class="jump" href="#contact">/);
    // Every call/WhatsApp link on the page sits inside a card that carries the GA parameters.
    const all = (html.match(/href="(tel:|https:\/\/wa\.me\/)/g) || []).length;
    const inCards = cards(html).reduce((n, c) => n + (c.body.match(/href="(tel:|https:\/\/wa\.me\/)/g) || []).length, 0);
    assert.equal(all, inCards, rel);
    for (const c of cards(html)) {
      for (const a of c.body.match(/<a [^>]*href="(?:tel:|https:\/\/wa\.me\/)[^>]*>/g) || []) assert.match(a, /data-ev="click_(call|whatsapp)"/, `${rel} ${c.id}`);
      // The pre-fill note sits right under the WhatsApp button, only on cards that have one.
      const hasWa = c.body.includes("wa.me/");
      assert.equal(/<p class="note">/.test(c.body), hasWa, `${rel} ${c.id} note`);
      if (hasWa) assert.ok(c.body.indexOf('class="note"') > c.body.indexOf("wa.me/"), `${rel} ${c.id} note under WhatsApp`);
    }
  }
});

test("design: self-hosted font, no third-party hosts, small CSS, no inline styles or scripts", () => {
  const css = read("assets/site.css");
  assert.ok(Buffer.byteLength(css) < 25 * 1024, `site.css is ${Buffer.byteLength(css)} bytes`);
  assert.match(css, /@font-face\{[^}]*url\(\/assets\/fonts\/plus-jakarta-sans-var\.v1\.woff2\)[^}]*font-display:swap/);
  assert.match(css, /prefers-color-scheme:dark/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.ok(fs.existsSync(path.join(ROOT, "_site/assets/fonts/plus-jakarta-sans-var.v1.woff2")));
  assert.doesNotMatch(css, /https?:\/\//, "no external URLs in CSS");
  for (const f of htmlFiles(path.join(ROOT, "_site"))) {
    const html = fs.readFileSync(f, "utf8");
    assert.match(html, /<link rel="preload" href="\/assets\/fonts\/plus-jakarta-sans-var\.v1\.woff2" as="font" type="font\/woff2" crossorigin>/, f);
    assert.doesNotMatch(html, /\sstyle="|<style\b/, `${f}: inline style would break the CSP`);
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (/type="application\/ld\+json"/.test(m[1])) continue;
      assert.match(m[1], /\ssrc="/, `${f}: inline script would break the CSP`);
    }
    assert.doesNotMatch(html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, ""), /(src|href)="https?:\/\/(?!jbcarfix\.com|wa\.me|www\.googletagmanager\.com|api\.web3forms\.com)/, `${f}: third-party asset`);
  }
});
