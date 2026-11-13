import test from "node:test";
import assert from "node:assert/strict";
import { compareAreas } from "../lib/similarity.js";

const text = "Drivers here often deal with heavy lorry traffic on the main trunk road and long waits at the junction near the market every morning.";
const mk = (slug, name, intro, status = "draft") => ({ slug, status, name: { ms: name, en: name }, en: { intro, blocks: [], faqs: [] }, ms: { intro: "", blocks: [], faqs: [] } });

test("name-swapped copies fail", () => {
  const areas = { a: mk("alpha", "Alpha", `In Alpha, ${text}`), b: mk("beta", "Beta", `In Beta, ${text}`) };
  const r = compareAreas(areas, ["en"], 0.4);
  assert.equal(r.failures.length, 1);
});

test("different text passes and placeholders are skipped", () => {
  const areas = {
    a: mk("alpha", "Alpha", text),
    b: mk("beta", "Beta", "Most calls from this side of town are about flat batteries after cars sit unused over the long school holidays."),
    c: mk("gamma", "Gamma", text, "placeholder"),
  };
  const r = compareAreas(areas, ["en"], 0.4);
  assert.equal(r.failures.length, 0);
  assert.deepEqual(r.skipped, ["gamma"]);
});
