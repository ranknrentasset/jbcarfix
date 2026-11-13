/**
 * Cloudflare Pages Function: POST /api/lead
 * Validates the lead form on the server, drops bots (honeypot), keeps UTM tags,
 * and forwards the lead to Web3Forms using the WEB3FORMS_KEY environment variable
 * (set in the Cloudflare dashboard; never committed).
 * Preview (*.pages.dev / localhost) without a key: returns a stub and sends nothing.
 */
import site from "../../src/_data/site.json";
import { MAX_BODY_BYTES, validateLead } from "./_lib/lead-core.js";

const PROD_HOSTS = new Set(["jbcarfix.com", "www.jbcarfix.com"]);
const ALLOWED = { areas: site.areaOrder.concat(site.landingOrder), services: site.serviceOrder };
const BASE_HEADERS = { "cache-control": "no-store", "x-robots-tag": "noindex" };

function isPreviewHost(h) {
  return h.endsWith(".pages.dev") || h === "localhost" || h === "127.0.0.1";
}

function hostAllowed(request) {
  const origin = request.headers.get("Origin") || request.headers.get("Referer") || "";
  if (!origin) return true; // some privacy tools strip both; validation still applies
  try {
    const h = new URL(origin).hostname;
    return PROD_HOSTS.has(h) || isPreviewHost(h);
  } catch (e) {
    return false;
  }
}

function wantsJson(request) {
  return (request.headers.get("Accept") || "").includes("application/json");
}

function reply(request, status, body, lang) {
  if (wantsJson(request)) {
    return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, "content-type": "application/json; charset=utf-8" } });
  }
  if (body.ok) {
    return new Response(null, { status: 303, headers: { ...BASE_HEADERS, location: site.thanks[lang] || site.thanks.ms } });
  }
  const s = site.strings[lang] || site.strings.ms;
  const html = `<!doctype html><html lang="${s.htmlLang}"><meta charset="utf-8"><meta name="robots" content="noindex"><title>${site.name}</title><p>${s.formError}</p><p><a href="javascript:history.back()">&larr;</a></p></html>`;
  return new Response(html, { status, headers: { ...BASE_HEADERS, "content-type": "text/html; charset=utf-8" } });
}

async function parseBody(request) {
  const ct = (request.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) return await request.json();
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    const fd = await request.formData();
    const obj = {};
    fd.forEach((v, k) => { if (typeof v === "string") obj[k] = v; });
    return obj;
  }
  return {};
}

export async function onRequestPost(context) {
  const { request } = context;
  const env = context.env || {};
  const host = new URL(request.url).hostname;

  if (!hostAllowed(request)) return reply(request, 403, { ok: false, error: "origin" }, "ms");
  const cl = Number(request.headers.get("content-length") || 0);
  if (cl > MAX_BODY_BYTES) return reply(request, 413, { ok: false, error: "too_large" }, "ms");

  let raw;
  try { raw = await parseBody(request); } catch (e) { return reply(request, 400, { ok: false, error: "validation" }, "ms"); }
  const lang = raw && raw.lang === "en" ? "en" : "ms";

  const result = validateLead(raw, ALLOWED);
  if (result.kind === "silent") return reply(request, 200, { ok: true }, lang); // bot: pretend success, send nothing
  if (result.kind === "invalid") return reply(request, 400, { ok: false, error: "validation", fields: result.errors }, lang);
  const lead = result.lead;

  if (!env.WEB3FORMS_KEY) {
    if (isPreviewHost(host)) return reply(request, 200, { ok: true, stub: true, note: "Preview: WEB3FORMS_KEY not set, nothing was sent." }, lang);
    console.error("lead: WEB3FORMS_KEY is not set");
    return reply(request, 503, { ok: false, error: "config" }, lang);
  }

  const payload = {
    access_key: env.WEB3FORMS_KEY,
    subject: `New lead: ${lead.area} / ${lead.service}`,
    from_name: `${site.name} website`,
    name: lead.name,
    phone: lead.phone,
    area: lead.area,
    service: lead.service,
    message: lead.message || "-",
    language: lead.lang,
    page: lead.page,
    ...lead.utm,
  };

  try {
    const r = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.success) {
      console.error("lead: Web3Forms rejected the submission, status " + r.status);
      return reply(request, 502, { ok: false, error: "upstream" }, lang);
    }
  } catch (e) {
    console.error("lead: Web3Forms request failed");
    return reply(request, 502, { ok: false, error: "upstream" }, lang);
  }
  return reply(request, 200, { ok: true }, lang);
}

export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return new Response(JSON.stringify({ ok: false, error: "method" }), {
    status: 405,
    headers: { ...BASE_HEADERS, "content-type": "application/json; charset=utf-8", allow: "POST" },
  });
}
