import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { waLink, fillVars, underButtonNote } from "../eleventy.config.js";

const i18n = JSON.parse(fs.readFileSync(new URL("../src/_data/i18n.json", import.meta.url), "utf8"));
const site = JSON.parse(fs.readFileSync(new URL("../src/_data/site.json", import.meta.url), "utf8"));

test("i18n holds the WhatsApp texts with {{ brand }}", () => {
  assert.equal(i18n.whatsappText.ms, "Hai, saya jumpa anda di {{ brand }}.");
  assert.equal(i18n.whatsappText.en, "Hi, I found you on {{ brand }}.");
});

test("Malay wa.me link is encoded correctly", () => {
  const url = waLink("60123456789", fillVars(i18n.whatsappText.ms, { brand: "JBCarFix" }));
  assert.equal(url, "https://wa.me/60123456789?text=Hai%2C%20saya%20jumpa%20anda%20di%20JBCarFix.");
  assert.equal(new URL(url).searchParams.get("text"), "Hai, saya jumpa anda di JBCarFix.");
});

test("English wa.me link is encoded correctly", () => {
  const url = waLink("60123456789", fillVars(i18n.whatsappText.en, { brand: "JBCarFix" }));
  assert.equal(url, "https://wa.me/60123456789?text=Hi%2C%20I%20found%20you%20on%20JBCarFix.");
  assert.equal(new URL(url).searchParams.get("text"), "Hi, I found you on JBCarFix.");
});

test("brand with special characters is still encoded safely, UTMs come after the text", () => {
  const url = waLink("60123456789", fillVars(i18n.whatsappText.en, { brand: "A&B Car" }), { utm_source: "jbcarfix", utm_campaign: "kulai" });
  assert.ok(url.startsWith("https://wa.me/60123456789?text=Hi%2C%20I%20found%20you%20on%20A%26B%20Car.&utm_source="));
  assert.equal(new URL(url).searchParams.get("text"), "Hi, I found you on A&B Car.");
  assert.equal(new URL(url).searchParams.get("utm_campaign"), "kulai");
});

test("site.json brand is set", () => assert.ok(site.brand));

test("under-button note quotes exactly the WhatsApp pre-fill, in both languages", () => {
  for (const lang of ["ms", "en"]) {
    const note = underButtonNote(i18n, lang, "JBCarFix");
    const quoted = note.match(/"([^"]*)"/)[1];
    const prefill = fillVars(i18n.whatsappText[lang], { brand: "JBCarFix" });
    assert.equal(quoted, prefill, lang);
    assert.equal(new URL(waLink("60123456789", prefill)).searchParams.get("text"), quoted, lang);
    assert.ok(!/TODO|\{\{/.test(note), lang);
  }
  assert.equal(underButtonNote(i18n, "en", "JBCarFix"), 'WhatsApp opens with "Hi, I found you on JBCarFix." already typed. You can edit it before you send.');
  assert.equal(underButtonNote(i18n, "ms", "JBCarFix"), 'WhatsApp akan dibuka dengan mesej "Hai, saya jumpa anda di JBCarFix." yang sudah ditaip. Anda boleh mengubahnya sebelum menghantar.');
});
