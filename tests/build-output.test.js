// Checks the built site. Runs after `npm run build` (npm test does that first),
// plus a throwaway build in a temp folder with fake "trial" and "tenant" workshops.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
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
  return Object.values(routing.entries).flatMap((e) => [e.workshop.name, e.phone, e.whatsapp]).filter(Boolean);
}

function assertNoRoutingInData(siteDir, routing) {
  const values = routingValues(routing);
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

test("no {{ ... }} left unfilled and brand appears", () => {
  for (const f of htmlFiles(path.join(ROOT, "_site"))) {
    const html = fs.readFileSync(f, "utf8");
    assert.ok(!/\{\{/.test(html), `${f} has an unfilled variable`);
  }
  const brand = JSON.parse(fs.readFileSync(path.join(ROOT, "src/_data/site.json"), "utf8")).brand;
  const home = fs.readFileSync(path.join(ROOT, "_site/index.html"), "utf8");
  assert.ok(home.includes(`<p class="connect">${brand} membantu`), "brand filled into Malay hero line");
});

test("built JSON-LD and meta tags contain no routing phone, WhatsApp or workshop name", () => {
  const routing = JSON.parse(fs.readFileSync(path.join(ROOT, "src/_data/routing.json"), "utf8"));
  assertNoRoutingInData(path.join(ROOT, "_site"), routing);
});

test("trial and tenant workshops: visible text only, disclosures, no trial logo", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jbcf-"));
  for (const item of ["src", "lib", "public", "eleventy.config.js", "package.json"]) {
    fs.cpSync(path.join(ROOT, item), path.join(tmp, item), { recursive: true });
  }
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(tmp, "node_modules"));

  const rp = path.join(tmp, "src/_data/routing.json");
  const routing = JSON.parse(fs.readFileSync(rp, "utf8"));
  Object.assign(routing.entries.kulai, { workshop_id: "ws-test-trial", workshop: { name: "Test Trial Workshop", area: "Kulai", coverage: [] }, phone: "+60123456781", whatsapp: "60123456781", web3forms_key: "test-key-1", tenant_status: "trial" });
  Object.assign(routing.entries.skudai, { workshop_id: "ws-test-tenant", workshop: { name: "Test Tenant Workshop", area: "Skudai", coverage: [], logo: "/assets/test-logo.png" }, phone: "+60123456782", whatsapp: "60123456782", web3forms_key: "test-key-2", tenant_status: "tenant" });
  fs.writeFileSync(rp, JSON.stringify(routing));
  const dp = path.join(tmp, "src/_data/disclosures.json");
  fs.writeFileSync(dp, JSON.stringify({
    independence: { ms: "TEST-independence", en: "TEST-independence" },
    selectionMethod: { ms: "TEST-selection", en: "TEST-selection" },
    paidBy: { trial: { ms: "TEST-paid-trial", en: "TEST-paid-trial" }, tenant: { ms: "TEST-paid-tenant", en: "TEST-paid-tenant" } },
  }));

  execFileSync(process.execPath, [path.join(ROOT, "node_modules/@11ty/eleventy/cmd.cjs"), "--quiet"], { cwd: tmp, stdio: "pipe" });
  const out = path.join(tmp, "_site");

  assertNoRoutingInData(out, routing);

  const kulai = fs.readFileSync(path.join(out, "en/kulai/index.html"), "utf8");
  assert.match(kulai, /Your enquiry goes to Test Trial Workshop, a local workshop in Kulai\./);
  assert.match(kulai, /TEST-independence/);
  assert.match(kulai, /TEST-selection/);
  assert.match(kulai, /TEST-paid-trial/);
  assert.doesNotMatch(kulai, /TEST-paid-tenant/);
  assert.doesNotMatch(kulai, /<img\b/);
  assert.match(kulai, /data-ev-workshop-id="ws-test-trial"/);
  assert.match(kulai, /data-ev-service="area"/);
  assert.match(kulai, /name="access_key" value="test-key-1"/);
  assert.match(kulai, /data-ev-tenant-status="trial"/);
  assert.ok(kulai.includes('href="https://wa.me/60123456781?text=Hi%2C%20I%20found%20you%20on%20JBCarFix&amp;utm_source='), "English wa.me link");
  const kulaiMs = fs.readFileSync(path.join(out, "kulai/index.html"), "utf8");
  assert.ok(kulaiMs.includes('href="https://wa.me/60123456781?text=Hi%2C%20saya%20jumpa%20anda%20di%20JBCarFix&amp;utm_source='), "Malay wa.me link");
  assert.match(kulaiMs, /Pertanyaan anda dihantar kepada Test Trial Workshop, sebuah bengkel tempatan di Kulai\./);

  const skudai = fs.readFileSync(path.join(out, "skudai/index.html"), "utf8");
  assert.match(skudai, /data-ev-service="area"/);
  assert.match(skudai, /TEST-paid-tenant/);
  assert.doesNotMatch(skudai, /TEST-independence/);
  assert.match(skudai, /<img[^>]+test-logo\.png/);

  // Unassigned areas still show no buttons or form.
  const larkin = fs.readFileSync(path.join(out, "larkin/index.html"), "utf8");
  assert.doesNotMatch(larkin, /<form|tel:|wa\.me/);

  fs.rmSync(tmp, { recursive: true, force: true });
});
