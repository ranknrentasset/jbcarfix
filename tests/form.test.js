import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { checkRoutingEntry } from "../lib/content.js";

const ctx = {};
vm.runInNewContext(fs.readFileSync(new URL("../src/assets/site.js", import.meta.url), "utf8"), { globalThis: ctx });
const { validateLead, normalisePhone } = ctx.JBCF;
const good = { name: "Test User", phone: "012-345 6789", consent: true, access_key: "abc-123" };

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
  const ph = { workshop_name: "TODO-workshop-name", phone: "+60000000000", whatsapp: "60000000000", web3forms_key: "TODO-public-access-key" };
  assert.doesNotThrow(() => checkRoutingEntry("x", { ...ph, status: "unassigned" }));
  assert.throws(() => checkRoutingEntry("x", { ...ph, status: "trial" }));
  assert.doesNotThrow(() => checkRoutingEntry("x", { workshop_name: "Real Workshop", phone: "+60123456789", whatsapp: "60123456789", web3forms_key: "abc-123", status: "rented" }));
});
