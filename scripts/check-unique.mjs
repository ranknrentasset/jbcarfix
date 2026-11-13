#!/usr/bin/env node
// Compares the main text of every area page (per language) and fails if any two
// are more than 40% alike. Each area's own name is masked first, so a copy with
// only the town name swapped still counts as a copy.
// Areas with status "placeholder" are reported but never fail the check.
//
// Usage: npm run check:unique            (threshold 0.40)
//        node scripts/check-unique.mjs --threshold 0.35 --data path/to/_data
import path from "node:path";
import { loadContent, DATA_DIR } from "../lib/content.js";
import { compareAreas } from "../lib/similarity.js";

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const threshold = Number(opt("--threshold", "0.40"));
const dataDir = path.resolve(opt("--data", DATA_DIR));

const { site, areas } = loadContent(dataDir);
const { results, skipped, failures } = compareAreas(areas, site.languages, threshold);

console.log(`Uniqueness check: ${Object.keys(areas).length} area files, threshold ${(threshold * 100).toFixed(0)}%`);
if (skipped.length) console.log(`Skipped (status "placeholder", not compared): ${skipped.join(", ")}`);
for (const r of results) {
  const flag = r.score > threshold ? "FAIL" : "ok  ";
  console.log(`  ${flag} [${r.lang}] ${r.a} vs ${r.b}: ${(r.score * 100).toFixed(1)}% similar`);
}
if (!results.length) console.log("  Nothing to compare yet (fewer than two areas have real text).");
if (failures.length) {
  console.error(`\n${failures.length} pair(s) are too similar. Rewrite one page in each pair with its own local details.`);
  process.exit(1);
}
console.log("\nPASS");
