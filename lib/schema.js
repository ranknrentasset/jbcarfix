// JSON-LD for each page.
// tenantMode false (now): Organization + Service with areaServed, plus FAQPage when a page has FAQs.
//   Never AutoRepair/LocalBusiness, never an address, map pin, rating, review or price.
// tenantMode true (only after a real workshop signs): AutoRepair using the real details in site.json "tenant".

function place(area, lang) {
  return { "@type": "Place", name: `${area.name[lang] || area.name.en}, Johor, Malaysia` };
}

export function buildJsonLd(page, { site, areas, services }) {
  const base = site.baseUrl.replace(/\/$/, "");
  const url = base + page.url;
  const lang = page.lang;
  const orgId = base + "/#org";
  const allAreas = site.areaOrder.map((k) => place(areas[k], lang));
  const graph = [];

  if (site.tenantMode) {
    const t = site.tenant || {};
    if (!t.name) throw new Error("tenantMode is true but site.json tenant.name is empty");
    const biz = { "@type": "AutoRepair", "@id": orgId, name: t.name, url: t.url || base + "/", areaServed: allAreas };
    if (t.telephone) biz.telephone = t.telephone;
    if (t.streetAddress && t.addressLocality) {
      biz.address = {
        "@type": "PostalAddress",
        streetAddress: t.streetAddress,
        postalCode: t.postalCode || undefined,
        addressLocality: t.addressLocality,
        addressCountry: "MY",
      };
    }
    graph.push(biz);
  } else {
    graph.push({
      "@type": "Organization",
      "@id": orgId,
      name: site.name,
      url: base + "/",
      description: site.strings[lang].footerLine,
      areaServed: allAreas,
    });
  }

  if (page.type === "service") {
    const s = services[page.key];
    graph.push({
      "@type": "Service",
      name: s.name[lang],
      serviceType: s.name.en,
      url,
      provider: { "@id": orgId },
      areaServed: allAreas,
    });
  } else if (page.type === "area") {
    graph.push({
      "@type": "Service",
      name: site.strings[lang].areaServiceName,
      url,
      provider: { "@id": orgId },
      areaServed: place(areas[page.key], lang),
    });
  } else if (page.type === "landing") {
    graph.push({
      "@type": "Service",
      name: site.strings[lang].areaServiceName,
      url,
      provider: { "@id": orgId },
      areaServed: allAreas,
    });
  }

  const faqs = (page.content && page.content.faqs) || [];
  if (faqs.length) {
    graph.push({
      "@type": "FAQPage",
      url,
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }

  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
}
