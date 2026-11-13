# jbcarfix.com

The website for jbcarfix.com. It's a simple, fast site in two languages:
**Malay** at the main address (`/`) and **English** under `/en/`.

The site presents itself as a service that **connects drivers with local car workshops** in Johor Bahru. It is not a workshop.

> **Nothing goes live until you merge a pull request.** All work happens on side branches. Each pull request can get a private preview link (on `*.pages.dev`, hidden from Google). Only when you merge into `main` does Cloudflare publish it to jbcarfix.com.

All page text is currently placeholder, marked **"DRAFT – content pending"**.

## How it works, in one paragraph

The pages are built by a free tool called [Eleventy](https://www.11ty.dev/). Each area and each service has its own small text file holding that page's words. Eleventy pours those words into shared page layouts and produces plain web pages. Cloudflare Pages then hosts those pages for free.

## Folder layout

```
src/
  _data/
    site.json        Main settings: web address, brand name, the tenantMode switch, button and form wording
    routing.json     Which phone / WhatsApp number each area uses
    home.json        Home page text (Malay + English)
    areas/           One file per area (kulai.json, skudai.json, ...)
    services/        One file per service (tayar.json, bateri.json, ...)
    landings/        Special pages, such as near-ksl.json (English only)
    pages.js         Builds the list of pages from the files above (no need to edit)
  _includes/         Page layouts (how pages look). These hold no page text of their own.
  assets/            site.css (styles) and site.js (form helper)
  page.njk, 404.njk, sitemap.njk, robots.njk
public/
  _headers           Security and caching rules for Cloudflare, and "hide previews from Google"
  _routes.json       Tells Cloudflare only /api/ runs code
  favicon.svg
functions/
  api/lead.js        Receives the contact form and forwards it by email (Web3Forms)
lib/                 Small helpers: page list, schema (structured data), similarity check
scripts/
  check-unique.mjs   The "no copy-paste area pages" check
tests/               Automatic tests for the form checks and the similarity check
```

## Pages right now

| Malay | English |
|---|---|
| `/` | `/en/` |
| `/tayar/` | `/en/tyres/` |
| `/bateri/` | `/en/car-battery/` |
| `/servis/` | `/en/car-service/` |
| `/mekanik-24-jam/` | `/en/24-hour-mechanic/` |
| `/aircond-kereta/` | `/en/car-aircon/` |
| `/pakar-gearbox/` | `/en/gearbox-repair/` |
| `/kulai/` | `/en/kulai/` |
| `/gelang-patah/` | `/en/gelang-patah/` |
| `/bukit-indah/` | `/en/bukit-indah/` |
| `/skudai/` | `/en/skudai/` |
| `/larkin/` | `/en/larkin/` |
| (none) | `/en/near-ksl/` |

Every page tells Google about its other-language twin (hreflang) and its own main address (canonical). `sitemap.xml` and `robots.txt` are made automatically.

## How to add an area

1. Copy any file in `src/_data/areas/`, for example `kulai.json`, and name it after the new area, like `senai.json`.
2. Inside, set `slug` to `senai` and fill in `name`.
3. Write **new text for every field** in both `ms` and `en`: intro, sections, FAQs and the WhatsApp message. Never copy another area's text and only change the town name.
4. Add the area to `areaOrder` in `src/_data/site.json`.
5. Add the area to `areas` in `src/_data/routing.json` (use `"owner"` for now).
6. Change `status` from `placeholder` to `draft` once real text is in.
7. Run `npm run check:unique`. It fails if two area pages share more than about 40% of their text.

The build stops with a clear message if something doesn't line up, for example an area listed in `site.json` that has no file.

## How contact routing works

`src/_data/routing.json` decides who gets the calls and WhatsApp messages:

- `entries` lists the people or businesses who can receive leads. Today there is one: `owner` (you). Its numbers are **fake placeholders** (`+60 00-000 0000`) marked TODO, so swap in the real launch number before going live.
- `areas` maps each area to an entry. Every area points to `owner` for now.
- When a workshop agrees to take an area's leads, add an entry for that workshop and change that area's value. That's a one-line change, and you approve it in a pull request.

Each WhatsApp button is a `wa.me` link with the area's own pre-filled message, a short reference (like `[ref: kulai-ms]`) and UTM tags, so you can tell which page a chat came from.

## The contact form

The form posts to `/api/lead`, a small Cloudflare function in `functions/api/lead.js`. It:

- checks name, phone, area, service and consent on the server
- quietly drops bots using a hidden "honeypot" field
- keeps the UTM tags the visitor arrived with
- forwards the lead to your email through Web3Forms

The Web3Forms key is **not** in this code. It goes into Cloudflare as a setting called `WEB3FORMS_KEY`. On preview links without that setting, the form answers "OK (preview)" and sends nothing.

## Structured data (schema)

While no workshop has signed, every page says the site is an **Organization** that offers a **Service** in the JB areas, plus FAQs where a page has them. It never claims to be a workshop and never includes a street address, map pin, ratings, reviews or prices.

When a workshop signs, put its real details under `tenant` in `site.json` and change `"tenantMode": false` to `true`.

## Commands (for whoever builds the site)

You need Node.js 18 or newer.

```
npm install            # first time only
npm start              # local preview at http://localhost:8080
npm run build          # build the site into _site/
npm run check:unique   # area pages must not be copies of each other
npm test               # automatic tests
```

Cloudflare Pages settings when connected: build command `npm run build`, output folder `_site`.

## Rules this repo follows

- No secrets in the code. Keys live in Cloudflare settings.
- No tracking scripts, no web fonts and no CSS frameworks, which keeps pages fast.
- Preview links on `*.pages.dev` are hidden from search engines. jbcarfix.com is not.
- `main` is protected: changes arrive only by pull request, and only you merge.
