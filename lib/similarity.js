// Text similarity used by scripts/check-unique.mjs.

export function mainText(area, lang) {
  const c = area[lang] || {};
  const parts = [c.intro, ...(c.blocks || []).flatMap((b) => [b.heading, b.body]), ...(c.faqs || []).flatMap((f) => [f.q, f.a])];
  return parts.filter(Boolean).join(" ");
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Lower-case, mask the area's own names, strip punctuation, split into words.
export function tokens(text, names) {
  let t = String(text).toLowerCase();
  for (const n of names.filter(Boolean).sort((a, b) => b.length - a.length)) {
    t = t.replace(new RegExp(escapeRe(n.toLowerCase()), "g"), " areaname ");
  }
  return t.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
}

export function shingles(words, n = 3) {
  const set = new Set();
  if (words.length < n) { if (words.length) set.add(words.join(" ")); return set; }
  for (let i = 0; i <= words.length - n; i++) set.add(words.slice(i, i + n).join(" "));
  return set;
}

// Share of the smaller page's 3-word phrases that also appear in the other page.
export function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let common = 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const s of small) if (big.has(s)) common++;
  return common / small.size;
}

export function compareAreas(areas, langs, threshold) {
  const real = Object.values(areas).filter((a) => a.status !== "placeholder");
  const skipped = Object.values(areas).filter((a) => a.status === "placeholder").map((a) => a.slug);
  const results = [];
  for (const lang of langs) {
    const prepared = real.map((a) => {
      const names = [a.name.ms, a.name.en, a.slug.replace(/-/g, " "), ...(a.aliases || [])];
      return { slug: a.slug, sh: shingles(tokens(mainText(a, lang), names)) };
    });
    for (let i = 0; i < prepared.length; i++) {
      for (let j = i + 1; j < prepared.length; j++) {
        results.push({ lang, a: prepared[i].slug, b: prepared[j].slug, score: similarity(prepared[i].sh, prepared[j].sh) });
      }
    }
  }
  return { results, skipped, failures: results.filter((r) => r.score > threshold) };
}
