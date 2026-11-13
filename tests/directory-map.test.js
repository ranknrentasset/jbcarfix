// Home workshop list, Directions buttons and the tap-to-open map. Runs on the built site
// (npm test builds first).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "_site");
const routing = JSON.parse(fs.readFileSync(path.join(ROOT, "src/_data/routing.json"), "utf8"));
const read = (rel) => fs.readFileSync(path.join(SITE, rel), "utf8");
const dec = (h) => h.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? htmlFiles(p) : p.endsWith(".html") ? [p] : [];
  });
}
const PAGES = htmlFiles(SITE).map((f) => ({ rel: path.relative(SITE, f), html: fs.readFileSync(f, "utf8") }));

// Workshop cards on area/service pages and entries in the home list.
const CARD = /<article class="(ws-card|dir-card)"([^>]*)>([\s\S]*?)<\/article>/g;
const allCards = (html) => [...html.matchAll(CARD)].map((m) => ({ kind: m[1], attrs: m[2], body: m[3], id: m[2].match(/data-ev-workshop-id="([^"]+)"/)[1] }));
const attr = (attrs, name) => (attrs.match(new RegExp(` ${name}="([^"]*)"`)) || [])[1];

const listed = () => {
  const ids = new Set();
  for (const l of Object.values(routing.areas)) l.forEach((id) => ids.add(id));
  for (const [k, l] of Object.entries(routing.services)) l.forEach((id) => { const w = routing.workshops[id]; if (!w.services || w.services.includes(k)) ids.add(id); });
  return ids;
};

test("map: Leaflet and tiles are not referenced by any page; map.js only where there are pins", () => {
  for (const { rel, html } of PAGES) {
    assert.doesNotMatch(html, /<script[^>]+leaflet|<link[^>]+leaflet|tile\.openstreetmap\.org/, `${rel}: map files referenced before a tap`);
    const pins = /data-lat="/.test(html);
    assert.equal(/<script src="\/assets\/map\.js\?v=[0-9a-f]+" defer><\/script>/.test(html), pins, `${rel}: map.js only with pins`);
    assert.equal(/data-map-btn/.test(html), pins, `${rel}: map button only with pins`);
  }
  for (const rel of ["index.html", "en/index.html", "kulai/index.html", "en/car-towing/index.html", "tayar/index.html"]) {
    assert.match(read(rel), /data-map-btn/, `${rel} has the map button`);
  }
});

test("map: no pin, map or Directions on pages with no workshops (home list aside)", () => {
  for (const rel of ["servis/index.html", "en/car-servicing/index.html", "bateri/index.html", "mekanik-24-jam/index.html", "pakar-gearbox/index.html", "en/near-ksl/index.html", "404.html"]) {
    if (!fs.existsSync(path.join(SITE, rel))) continue;
    const html = read(rel);
    assert.doesNotMatch(html, /data-lat=|data-map-btn|class="map|google\.com\/maps|click_directions/, rel);
  }
});

// Minimal DOM stand-in: records what map.js adds to <head>.
function mapHarness() {
  const added = [], listeners = {};
  const el = (tag) => ({ tagName: tag, setAttribute() {}, appendChild() {}, addEventListener() {} });
  const btn = {
    attrs: { "aria-controls": "ws-map", "aria-expanded": "false", "data-js": "/assets/leaflet/leaflet.js?v=1", "data-css": "/assets/leaflet/leaflet.css?v=1", "data-show": "Show map", "data-hide": "Hide map", "data-dir-label": "Directions" },
    getAttribute(n) { return this.attrs[n]; },
    setAttribute(n, v) { this.attrs[n] = v; },
    addEventListener(t, fn) { listeners[t] = fn; },
    closest: () => null,
    querySelector: () => ({ textContent: "" }),
  };
  const document = {
    head: { appendChild: (n) => added.push(n) },
    querySelector: (s) => (s === "[data-map-btn]" ? btn : null),
    querySelectorAll: () => [],
    getElementById: () => ({ hidden: true }),
    createElement: el,
    addEventListener() {},
  };
  return { added, listeners, window: { document } };
}

test("map: map.js adds the Leaflet files only after the button is tapped", () => {
  const h = mapHarness();
  vm.runInNewContext(read("assets/map.js"), { window: h.window });
  assert.equal(h.added.length, 0, "nothing loaded on page load");
  assert.equal(typeof h.listeners.click, "function");
  h.listeners.click();
  assert.deepEqual(h.added.map((n) => [n.tagName, n.src || n.href]), [["link", "/assets/leaflet/leaflet.css?v=1"], ["script", "/assets/leaflet/leaflet.js?v=1"]]);
  const css = fs.readFileSync(path.join(SITE, "assets/leaflet/leaflet.css"), "utf8");
  assert.ok(css.length > 1000 && fs.existsSync(path.join(SITE, "assets/leaflet/leaflet.js")), "Leaflet is self-hosted");
  assert.match(fs.readFileSync(path.join(SITE, "assets/leaflet/LICENSE.txt"), "utf8"), /BSD 2-Clause|Redistribution and use/);
});

test("CSP: the only new host is the OpenStreetMap tile server, for images only", () => {
  const csp = fs.readFileSync(path.join(ROOT, "public/_headers"), "utf8").match(/Content-Security-Policy: (.*)/)[1];
  const dir = Object.fromEntries(csp.split(";").map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
  assert.deepEqual(dir["img-src"], ["'self'", "data:", "https://tile.openstreetmap.org"]);
  for (const k of ["script-src", "style-src", "connect-src", "default-src"]) assert.ok(!dir[k].some((v) => /openstreetmap|leaflet|unpkg|\*\.tile/.test(v)), k);
  assert.deepEqual(dir["style-src"], ["'self'"]);
});

test("pins: each workshop has a full location from its listing, or none; pins match routing.json", () => {
  for (const [id, w] of Object.entries(routing.workshops)) {
    if (w.location == null) continue;
    const l = w.location;
    assert.ok(l.address && Number.isFinite(l.lat) && Number.isFinite(l.lng), `${id}: location needs address, lat and lng`);
    assert.ok(l.lat > 1.2 && l.lat < 2.1 && l.lng > 103.3 && l.lng < 104.3, `${id}: location outside Johor Bahru`);
  }
  assert.equal(routing.workshops["ws-mega-car-paint"].location, undefined, "the backup has no location");
  let pins = 0;
  for (const { rel, html } of PAGES) {
    for (const c of allCards(html)) {
      const w = routing.workshops[c.id], lat = attr(c.attrs, "data-lat"), lng = attr(c.attrs, "data-lng");
      if (!w.location) { assert.equal(lat, undefined, `${rel} ${c.id}: pin without a location`); continue; }
      assert.equal(Number(lat), w.location.lat, `${rel} ${c.id}`);
      assert.equal(Number(lng), w.location.lng, `${rel} ${c.id}`);
      pins++;
    }
    assert.equal((html.match(/data-lat="/g) || []).length, allCards(html).filter((c) => attr(c.attrs, "data-lat")).length, `${rel}: pins only on cards`);
  }
  assert.ok(pins > 0);
});

// The source notes live outside the repo (private). When they are on this computer,
// every pinned workshop must have an entry with the same coordinates.
const SOURCES = process.env.JBCF_GEO_SOURCES || path.join(ROOT, "..", "private", "jbcarfix", "geo-sources.md");
test("pins: every pinned workshop has a source entry (private notes, when present)", { skip: !fs.existsSync(SOURCES) && "private geo-sources.md not on this computer" }, () => {
  const md = fs.readFileSync(SOURCES, "utf8");
  const sections = Object.fromEntries(md.split(/^## /m).slice(1).map((s) => [s.split("\n")[0].trim(), s]));
  for (const [id, w] of Object.entries(routing.workshops)) {
    if (!w.location) continue;
    const sec = sections[id];
    assert.ok(sec, `${id}: no entry in geo-sources.md`);
    assert.match(sec, /Listing URL: https:\/\/www\.google\.com\/maps\/place\//, `${id}: listing URL`);
    const m = sec.match(/Pin: (-?[\d.]+), (-?[\d.]+)/);
    assert.ok(m, `${id}: pin line`);
    assert.equal(Number(m[1]), w.location.lat, `${id} lat`);
    assert.equal(Number(m[2]), w.location.lng, `${id} lng`);
    assert.ok(sec.includes(w.location.address), `${id}: address matches the listing`);
  }
});

const DIR_LINK = /<a [^>]*href="https:\/\/www\.google\.com\/maps\/dir\/[^"]*"[^>]*>/g;

test("Directions links: inside a card with all tracking parameters, tagged click_directions, to the listing's name and address", () => {
  let n = 0;
  for (const { rel, html } of PAGES) {
    const inCards = allCards(html).reduce((k, c) => k + (c.body.match(DIR_LINK) || []).length, 0);
    assert.equal((html.match(DIR_LINK) || []).length, inCards, `${rel}: Directions link outside a card`);
    for (const c of allCards(html)) {
      const w = routing.workshops[c.id];
      const links = c.body.match(DIR_LINK) || [];
      assert.equal(links.length, w.location ? 1 : 0, `${rel} ${c.id}: one Directions link when the location is known`);
      for (const a of links) {
        assert.match(a, /data-ev="click_directions"/, `${rel} ${c.id}`);
        assert.match(a, /rel="noopener"/);
        const url = new URL(dec(a.match(/href="([^"]+)"/)[1]));
        assert.equal(url.searchParams.get("api"), "1");
        assert.equal(url.searchParams.get("destination"), `${w.workshop.name}, ${w.location.address}`, `${rel} ${c.id}`);
        n++;
      }
      for (const p of ["area", "lang", "workshop-id", "tenant-status", "service", "page-path"]) assert.ok(attr(c.attrs, `data-ev-${p}`), `${rel} ${c.id}: data-ev-${p}`);
      assert.equal(attr(c.attrs, "data-ev-page-path"), "/" + rel.replace(/index\.html$/, ""), `${rel} ${c.id}: page_path`);
    }
  }
  assert.ok(n > 0);
});

// Clicks every tracked link in the built page through site.js and returns what reached gtag.
function clicks(html) {
  const calls = [], links = [];
  for (const c of allCards(html)) {
    const dataset = Object.fromEntries([...c.attrs.matchAll(/data-ev-([a-z-]+)="([^"]*)"/g)].map((m) => ["ev" + m[1].replace(/(^|-)([a-z])/g, (x, d, ch) => ch.toUpperCase()), m[2]]));
    for (const ev of [...c.body.matchAll(/data-ev="([a-z_]+)"/g)].map((m) => m[1])) {
      const l = { getAttribute: () => ev, closest: () => ({ dataset }), addEventListener: (t, fn) => { l.fn = fn; } };
      links.push(l);
    }
  }
  const win = { gtag: (...a) => calls.push([a[1], { ...a[2] }]), location: { search: "" }, localStorage: { getItem: () => null, setItem() {} }, URLSearchParams,
    document: { querySelectorAll: (sel) => (sel.includes(".dir-card a[data-ev]") && sel.includes(".ws-card a[data-ev]") ? links : []) } };
  vm.runInNewContext(read("assets/site.js"), { ...win, window: win });
  links.forEach((l) => l.fn());
  return calls;
}

test("Directions sends click_directions with area, service, workshop_id, tenant_status, lang and page_path", () => {
  const svc = clicks(read("en/car-towing/index.html")).filter((c) => c[0] === "click_directions");
  assert.deepEqual(svc.map((c) => c[1].workshop_id), ["ws-ty-towing", "ws-kone-towing"]);
  for (const [, p] of svc) assert.deepEqual(Object.keys(p).sort(), ["area", "lang", "page_path", "service", "tenant_status", "workshop_id"]);
  assert.deepEqual(svc[0][1], { area: "all", lang: "en", page_path: "/en/car-towing/", service: "towing-kereta", tenant_status: "trial", workshop_id: "ws-ty-towing" });
  const home = clicks(read("index.html"));
  assert.ok(home.length > 0 && home.every((c) => c[0] === "click_directions"), "home list: Directions only");
  const tyre = home.find((c) => c[1].workshop_id === "ws-tyreplus-kulai")[1];
  assert.deepEqual(tyre, { area: "kulai", lang: "ms", page_path: "/", service: "area", tenant_status: "trial", workshop_id: "ws-tyreplus-kulai" });
  const hawk = home.find((c) => c[1].workshop_id === "ws-hawk-tebrau")[1];
  assert.deepEqual(hawk, { area: "all", lang: "ms", page_path: "/", service: "tayar", tenant_status: "trial", workshop_id: "ws-hawk-tebrau" });
  // Call and WhatsApp tracking is unchanged.
  const kulai = clicks(read("kulai/index.html")).map((c) => c[0]);
  assert.deepEqual(kulai, ["click_call", "click_whatsapp", "click_directions", "click_call", "click_directions"]);
});

test("home list: every workshop that a page lists, once, never the backup; no call or WhatsApp buttons", () => {
  const want = listed();
  assert.ok(!want.has("ws-mega-car-paint"));
  for (const [rel, lang] of [["index.html", "ms"], ["en/index.html", "en"]]) {
    const html = read(rel);
    const cs = allCards(html).filter((c) => c.kind === "dir-card");
    assert.deepEqual(new Set(cs.map((c) => c.id)), want, rel);
    assert.equal(cs.length, want.size, `${rel}: each workshop once`);
    assert.doesNotMatch(html, /ws-mega-car-paint|Mega Car Paint/, rel);
    assert.doesNotMatch(html, /tel:|wa\.me/, `${rel}: calls stay on the page that lists the workshop`);
    const more = lang === "ms" ? "Maklumat lanjut" : "More info";
    for (const c of cs) {
      const m = c.body.match(/<a class="act" href="([^"]+)"/);
      if (m) {
        const href = m[1];
        assert.ok(read(href.replace(/^\//, "") + "index.html").includes(`data-ev-workshop-id="${c.id}"`), `${rel} ${c.id}: ${href} lists it`);
        assert.doesNotMatch(read(href.replace(/^\//, "") + "index.html"), /name="robots"/, `${rel} ${c.id}: More info links only to an indexable page`);
      } else {
        assert.ok(c.body.includes(`<span>${more}</span>`), `${rel} ${c.id}: More info stays as words when its page is held back`);
      }
      assert.ok(dec(c.body).includes(`<h3>${routing.workshops[c.id].workshop.name}</h3>`));
      assert.ok(c.body.includes(routing.workshops[c.id].workshop.coverage[lang]));
    }
    // Filter buttons only for services/areas that have an entry.
    for (const f of [...html.matchAll(/data-filter="([^"]+)"/g)].map((m) => m[1])) {
      assert.ok(cs.some((c) => (" " + attr(c.attrs, "data-f") + " ").includes(" " + f + " ")), `${rel}: filter ${f} matches nothing`);
    }
  }
});

test("home search: one link per service and area page, in the page's language", () => {
  const site = JSON.parse(fs.readFileSync(path.join(ROOT, "src/_data/site.json"), "utf8"));
  for (const [rel, pre] of [["index.html", ""], ["en/index.html", "/en"]]) {
    const html = read(rel);
    assert.match(html, /<input id="finder-q" type="search"/);
    assert.match(html, /<script src="\/assets\/finder\.js\?v=[0-9a-f]+" defer><\/script>/);
    const list = html.match(/<ul class="finder-list"[^>]*>([\s\S]*?)<\/ul>/)[1];
    const items = [...list.matchAll(/<li data-k="[^"]*">([\s\S]*?)<\/li>/g)].map((m) => m[1]);
    assert.equal(items.length, site.serviceOrder.length + site.areaOrder.length, `${rel}: one result per service and area`);
    for (const it of items) {
      const h = (it.match(/href="([^"]+)"/) || [])[1];
      assert.match(it, /<span>[^<]+<\/span>/, `${rel}: result keeps its words`);
      if (h) assert.ok(h.startsWith(pre + "/") && fs.existsSync(path.join(SITE, h, "index.html")), `${rel}: ${h}`);
    }
  }
  for (const { rel, html } of PAGES) if (!/^(en\/)?index\.html$/.test(rel)) assert.doesNotMatch(html, /finder\.js|data-finder/, rel);
});

test("no ratings, review counts, badges or best/cheapest/24-hour claims in workshop cards or the home list", () => {
  const BANNED = /★|☆|⭐|\b\d(?:[.,]\d)?\s*(?:\/\s*5|stars?|bintang)\b|\b\d+\s*(?:reviews|ulasan|penilaian)\b|\(\d+\)|\bverified\b|disahkan|terverifikasi|top[- ]rated|\btop\s+\d|#1|🥇|aggregateRating|ratingValue|reviewCount|\bbest\b|terbaik|cheapest|termurah|paling murah|open 24|buka 24/i;
  for (const { rel, html } of PAGES) {
    assert.doesNotMatch(html, /aggregateRating|ratingValue|reviewCount|"@type":"Review"/, `${rel}: rating data`);
    for (const c of allCards(html)) {
      const text = dec(c.body.replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<[^>]+>/g, " "));
      assert.doesNotMatch(text, BANNED, `${rel} ${c.id}`);
    }
    const ui = html.match(/<section class="sec dir"[\s\S]*?<\/section>|<div class="finder"[\s\S]*?<\/nav>\s*<nav[\s\S]*?<\/nav>/g) || [];
    for (const part of ui) assert.doesNotMatch(dec(part.replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<[^>]+>/g, " ")), BANNED, `${rel}: list or search`);
  }
});

test("workshop addresses and coordinates stay out of JSON-LD and meta tags", () => {
  const values = Object.values(routing.workshops).filter((w) => w.location).flatMap((w) => [w.location.address, String(w.location.lat), String(w.location.lng)]);
  for (const { rel, html } of PAGES) {
    const blobs = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1])
      .concat([...html.matchAll(/<meta\b[^>]*>/g)].map((m) => m[0]), [...html.matchAll(/<title>([\s\S]*?)<\/title>/g)].map((m) => m[1]));
    for (const b of blobs) for (const v of values) assert.ok(!dec(b).includes(v), `${rel}: "${v}" in JSON-LD/meta`);
  }
});
