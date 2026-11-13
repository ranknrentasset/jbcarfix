import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { checkWorkshop, checkDisclosures, workshopsFor } from "../lib/content.js";

const ctx = {};
vm.runInNewContext(fs.readFileSync(new URL("../src/assets/site.js", import.meta.url), "utf8"), { globalThis: ctx });
const { validateLead, normalisePhone, eventParams } = ctx.JBCF;
const good = { name: "Test User", phone: "012-345 6789", consent: true, access_key: "abc-123" };

const hours = { en: Array.from({ length: 7 }, (_, i) => ({ day: "D" + i, text: "9:00 AM–6:00 PM" })), ms: Array.from({ length: 7 }, (_, i) => ({ day: "H" + i, text: "9:00 AM–6:00 PM" })) };
const real = { workshop_id: "ws-real", workshop: { name: "Real Workshop", area: "Kulai", coverage: { en: "Workshop in X", ms: "Bengkel di X" } }, phone: "+60123456789", phone_display: "012-345 6789", whatsapp: null, hours, tenant_status: "trial" };

test("valid lead passes", () => assert.equal(validateLead(good).length, 0));

test("missing consent, bad phone, short name are caught", () => {
  assert.deepEqual([...validateLead({ ...good, name: "A", phone: "abc", consent: false })].sort(), ["consent", "name", "phone"]);
});

test("placeholder Web3Forms key is refused", () => {
  assert.deepEqual([...validateLead({ ...good, access_key: "TODO-public-access-key" })], ["access_key"]);
});

test("phone normalising", () => {
  assert.equal(normalisePhone("+60 12-345 6789"), "+60123456789");
  assert.equal(normalisePhone("123"), null);
});

test("workshops with placeholder or missing values are refused", () => {
  assert.doesNotThrow(() => checkWorkshop("ws-real", real));
  assert.doesNotThrow(() => checkWorkshop("ws-real", { ...real, whatsapp: "60123456789", whatsapp_label: "Company WhatsApp" }));
  assert.throws(() => checkWorkshop("ws-real", { ...real, phone: "+60000000000" }), /phone/);
  assert.throws(() => checkWorkshop("ws-real", { ...real, phone_display: undefined }), /phone_display/);
  assert.throws(() => checkWorkshop("ws-real", { ...real, phone_display: "012-345 0000" }), /phone_display/);
  assert.throws(() => checkWorkshop("ws-real", { ...real, workshop: { ...real.workshop, name: "TODO-workshop-name" } }), /workshop.name/);
  assert.throws(() => checkWorkshop("ws-real", { ...real, workshop: { ...real.workshop, coverage: { en: "Workshop in X" } } }), /coverage/);
  assert.throws(() => checkWorkshop("ws-real", { ...real, hours: { en: hours.en } }), /hours.ms/);
  assert.throws(() => checkWorkshop("ws-other", real), /workshop_id/);
});

test("tenant_status only accepts trial or tenant", () => {
  assert.throws(() => checkWorkshop("ws-real", { ...real, tenant_status: "rented" }));
  assert.throws(() => checkWorkshop("ws-real", { ...real, tenant_status: "unassigned" }));
});

test("service restriction keeps a workshop off other service pages", () => {
  const routing = { workshops: { a: { services: ["tayar"] }, b: {} }, services: { tayar: ["a", "b"], servis: ["a", "b"] }, areas: { kulai: ["a"] } };
  assert.deepEqual(workshopsFor(routing, "service", "tayar"), ["a", "b"]);
  assert.deepEqual(workshopsFor(routing, "service", "servis"), ["b"]);
  assert.deepEqual(workshopsFor(routing, "area", "kulai"), ["a"]);
  assert.deepEqual(workshopsFor(routing, "home", "home"), []);
});

test("analytics event parameters", () => {
  const p = eventParams({ evArea: "kulai", evLang: "ms", evWorkshopId: "ws-x", evTenantStatus: "trial", evService: "area", evPagePath: "/kulai/" });
  assert.deepEqual({ ...p }, { area: "kulai", lang: "ms", workshop_id: "ws-x", tenant_status: "trial", service: "area", page_path: "/kulai/" });
});

test("trial workshops may not carry a logo or photo", () => {
  assert.throws(() => checkWorkshop("ws-real", { ...real, workshop: { ...real.workshop, logo: "/x.png" }, tenant_status: "trial" }));
  assert.doesNotThrow(() => checkWorkshop("ws-real", { ...real, workshop: { ...real.workshop, logo: "/x.png" }, tenant_status: "tenant" }));
});

test("TODO disclosure wording blocks trial/tenant pages", () => {
  const d = { trialIntro: { lead: { ms: "Real" }, trialClaims: { ms: "TODO" } }, tenantCard: { ms: "Real" } };
  assert.doesNotThrow(() => checkDisclosures("unassigned", d, ["ms"]));
  assert.throws(() => checkDisclosures("trial", d, ["ms"]));
  assert.doesNotThrow(() => checkDisclosures("tenant", d, ["ms"]));
  assert.throws(() => checkDisclosures("tenant", { ...d, tenantCard: { ms: "TODO" } }, ["ms"]));
});

test("approved disclosure wording is in place", () => {
  const d = JSON.parse(fs.readFileSync(new URL("../src/_data/disclosures.json", import.meta.url), "utf8"));
  for (const line of [d.trialIntro.lead, d.trialIntro.trialClaims, d.tenantCard]) {
    for (const l of ["ms", "en"]) assert.ok(line[l] && !/TODO/.test(line[l]), JSON.stringify(line));
  }
  assert.match(d.tenantCard.en, /\{\{ workshop\.name \}\} pays \{\{ brand \}\} a flat fee/);
  assert.match(d.tenantCard.ms, /\{\{ workshop\.name \}\} membayar yuran tetap kepada \{\{ brand \}\}/);
});

test("indexHold starts with the body-and-paint and towing pages in both languages", () => {
  const site = JSON.parse(fs.readFileSync(new URL("../src/_data/site.json", import.meta.url), "utf8"));
  assert.deepEqual([...site.indexHold].sort(), ["car-body-paint", "car-towing", "cat-kereta", "towing-kereta"]);
});
