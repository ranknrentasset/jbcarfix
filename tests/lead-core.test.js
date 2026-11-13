import test from "node:test";
import assert from "node:assert/strict";
import { validateLead, normalisePhone } from "../functions/api/_lib/lead-core.js";

const allowed = { areas: ["kulai", "skudai"], services: ["tayar", "bateri"] };
const good = { name: "Test User", phone: "012-345 6789", area: "kulai", service: "tayar", consent: "yes", lang: "en", page: "/en/kulai/", utm_source: "test", utm_campaign: "kulai" };

test("valid lead passes and keeps UTMs", () => {
  const r = validateLead(good, allowed);
  assert.equal(r.kind, "ok");
  assert.equal(r.lead.phone, "0123456789");
  assert.deepEqual(r.lead.utm, { utm_source: "test", utm_campaign: "kulai" });
});

test("honeypot filled is dropped silently", () => {
  assert.equal(validateLead({ ...good, website: "http://spam" }, allowed).kind, "silent");
});

test("missing consent, bad phone, unknown area are rejected", () => {
  const r = validateLead({ ...good, consent: "", phone: "abc", area: "nowhere" }, allowed);
  assert.equal(r.kind, "invalid");
  assert.deepEqual(r.errors.sort(), ["area", "consent", "phone"]);
});

test("phone normalising", () => {
  assert.equal(normalisePhone("+60 12-345 6789"), "+60123456789");
  assert.equal(normalisePhone("123"), null);
});
