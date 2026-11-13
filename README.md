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
    privacy.json     Privacy notice text (placeholder for now)
    areas/           One file per area (kulai.json, skudai.json, ...)
    services/        One file per service (tayar.json, bateri.json, ...)
    landings/        Special pages, such as near-ksl.json (English only)
    pages.js         Builds the list of pages from the files above (no need to edit)
  _includes/         Page layouts (how pages look). These hold no page text of their own.
  assets/            site.css (styles) and site.js (form checks + UTM capture)
  page.njk, 404.njk, sitemap.njk, robots.njk
public/
  _headers           Security and caching rules for Cloudflare, and "hide previews from Google"
  favicon.svg
lib/                 Small helpers: page list, schema (structured data), similarity check
scripts/
  check-unique.mjs   The "no copy-paste area pages" check
tests/               Automatic tests for the form checks, routing safety and the similarity check
```

## Pages right now

| Malay | English |
|---|---|
| `/` | `/en/` |
| `/tayar/` | `/en/tyres/` |
| `/bateri/` | `/en/car-battery/` |
| `/servis/` | `/en/car-servicing/` |
| `/mekanik-24-jam/` | `/en/24-hour-mechanic/` |
| `/aircond-kereta/` | `/en/car-aircon/` |
| `/pakar-gearbox/` | `/en/gearbox-repair/` |
| `/kulai/` | `/en/kulai/` |
| `/gelang-patah/` | `/en/gelang-patah/` |
| `/bukit-indah/` | `/en/bukit-indah/` |
| `/skudai/` | `/en/skudai/` |
| `/larkin/` | `/en/larkin/` |
| (none) | `/en/near-ksl/` |
| `/privasi/` | `/en/privacy/` (placeholder, hidden from Google for now) |

Every page tells Google about its other-language twin (hreflang) and its own main address (canonical). `sitemap.xml` and `robots.txt` are made automatically.

## How to add an area

1. Copy any file in `src/_data/areas/`, for example `kulai.json`, and name it after the new area, like `senai.json`.
2. Inside, set `slug` to `senai` and fill in `name`.
3. Write **new text for every field** in both `ms` and `en`: intro, sections, FAQs and the WhatsApp message. Never copy another area's text and only change the town name.
4. Add the area to `areaOrder` in `src/_data/site.json`.
5. In `src/_data/routing.json`, copy an existing placeholder entry under `entries` with the area's slug as its name (status `unassigned`), and add `"senai": "senai"` under `areas`.
6. Change `status` from `placeholder` to `draft` once real text is in.
7. Run `npm run check:unique`. It fails if two area pages share more than about 40% of their text.

The build stops with a clear message if something doesn't line up, for example an area listed in `site.json` that has no file.

## How contact routing works

Leads never go to the site owner. Each area sends calls, WhatsApp messages and form leads to **its own workshop**, set in `src/_data/routing.json`:

- `entries` holds one entry per area (`kulai`, `skudai`, ...) plus an `unassigned` default for pages that aren't tied to one area (home, services, near KSL).
- Each entry has `workshop_name`, `phone`, `whatsapp`, `web3forms_key` (that workshop's own key, so form leads go straight to its email) and `status` (`unassigned`, `trial` or `rented`).
- `areas` says which entry each area uses.

**Right now every entry is `unassigned`, with placeholder values.** So no page shows a call button, WhatsApp button or form. Pages show a neutral "coming soon" note instead, which means no lead can go to nobody.

When a workshop agrees to take an area:

1. Fill in that area's entry with its real name, numbers and Web3Forms key.
2. Set `status` to `trial` or `rented`.
3. Open a pull request. Nothing changes on the site until you merge it.

The area page then shows "Your enquiry goes to {workshop}, a local workshop in {area}" next to the buttons. The build refuses to publish an entry marked `trial` or `rented` that still has TODO or all-zero values.

Each WhatsApp button is a `wa.me` link with the area's own pre-filled message, a short reference (like `[ref: kulai-ms]`) and UTM tags, so the workshop can tell which page a chat came from.

## The contact form

The visitor's browser sends the form **straight to Web3Forms** (`https://api.web3forms.com/submit`), which emails it to the workshop whose key is on that page. There is no server code. That's why it works on Web3Forms' free plan.

- The Web3Forms access key is public by design. It only tells Web3Forms which inbox gets the email, so it's fine for it to sit in the page.
- The browser checks the name, phone and consent before sending: HTML rules plus a small script in `src/assets/site.js`.
- A hidden `botcheck` box catches bots.
- The UTM tags the visitor arrived with are sent along, together with a per-area subject line and the workshop name.
- Afterwards the visitor lands on the thank-you page (`/terima-kasih/` or `/en/thank-you/`), with or without JavaScript.
- The consent line links to the privacy notice.

## Decisions made

- **The form posts straight from the browser to Web3Forms, on the free plan.** Web3Forms' free plan doesn't accept posts sent from a server, so there is no server function. The public access key sits in `routing.json`, one per workshop.
- **The English servicing page is `/en/car-servicing/`** (the Malay page stays `/servis/`). The team chose this wording for clearer English.

## Still needed before launch

- [ ] Web3Forms access key(s), from Muhammad's own Web3Forms sign-up (one per workshop inbox)
- [ ] The brand name (the site shows "JBCarFix" for now)
- [ ] Real page text, once it has been checked and cleared
- [ ] Real phone and WhatsApp numbers for each workshop
- [ ] The privacy notice text. Then remove its noindex rules in `public/_headers` and set `status` in `privacy.json`

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

- No secrets in the code. (The Web3Forms access key is public by design.)
- No tracking scripts, no web fonts and no CSS frameworks, which keeps pages fast.
- Preview links on `*.pages.dev` are hidden from search engines. jbcarfix.com is not.
- `main` is protected: changes arrive only by pull request, and only you merge.
