import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { checkRoutingEntry, checkDisclosures } from "../lib/content.js";

const ctx = {};
vm.runInNewContext(fs.readFileSync(new URL("../src/assets/site.js", import.meta.url), "utf8"), { globalThis: ctx });
const { validateLead, normalisePhone, eventParams } = ctx.JBCF;
const good = { name: "Test User", phone: "012-345 6789", consent: true, access_key: "abc-123" };

const placeholder = { workshop_id: "todo-ws-x", workshop: { name: "TODO-workshop-name", area: "Kulai", coverage: [] }, phone: "+60000000000", whatsapp: "60000000000", web3forms_key: "TODO-public-access-key" };
const real = { workshop_id: "ws-real", workshop: { name: "Real Workshop", area: "Kulai", coverage: [] }, phone: "+60123456789", whatsapp: "60123456789", web3forms_key: "abc-123" };

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

test("routing entries with placeholder values cannot go live", () => {
  assert.doesNotThrow(() => checkRoutingEntry("x", { ...placeholder, tenant_status: "unassigned" }));
  assert.throws(() => checkRoutingEntry("x", { ...placeholder, tenant_status: "trial" }), /workshop_id, workshop.name/);
  assert.doesNotThrow(() => checkRoutingEntry("x", { ...real, tenant_status: "tenant" }));
});

test("tenant_status only accepts unassigned, trial or tenant", () => {
  assert.throws(() => checkRoutingEntry("x", { ...real, tenant_status: "rented" }));
  assert.throws(() => checkRoutingEntry("x", { ...real, status: "trial" }));
});

test("analytics event parameters", () => {
  const p = eventParams({ evArea: "kulai", evLang: "ms", evWorkshopId: "ws-x", evTenantStatus: "trial", evService: "area", evPagePath: "/kulai/" });
  assert.deepEqual({ ...p }, { area: "kulai", lang: "ms", workshop_id: "ws-x", tenant_status: "trial", service: "area", page_path: "/kulai/" });
});

test("trial workshops may not carry a logo or photo", () => {
  assert.throws(() => checkRoutingEntry("x", { ...real, workshop: { ...real.workshop, logo: "/x.png" }, tenant_status: "trial" }));
  assert.doesNotThrow(() => checkRoutingEntry("x", { ...real, workshop: { ...real.workshop, logo: "/x.png" }, tenant_status: "tenant" }));
});

test("TODO disclosure wording blocks trial/tenant pages", () => {
  const d = { independence: { ms: "TODO" }, selectionMethod: { ms: "TODO" }, paidBy: { trial: { ms: "TODO" }, tenant: { ms: "Real" } } };
  assert.doesNotThrow(() => checkDisclosures("unassigned", d, ["ms"]));
  assert.throws(() => checkDisclosures("trial", d, ["ms"]));
  assert.doesNotThrow(() => checkDisclosures("tenant", d, ["ms"]));
});

test("approved disclosure wording is in place", () => {
  const d = JSON.parse(fs.readFileSync(new URL("../src/_data/disclosures.json", import.meta.url), "utf8"));
  for (const line of [d.independence, d.selectionMethod, d.paidBy.trial, d.paidBy.tenant]) {
    for (const l of ["ms", "en"]) assert.ok(line[l] && !/TODO/.test(line[l]), JSON.stringify(line));
  }
  assert.match(d.paidBy.tenant.en, /\{\{ workshop\.name \}\}/);
});
