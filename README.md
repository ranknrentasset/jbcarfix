# jbcarfix.com

The website for jbcarfix.com. It's a simple, fast site in two languages:
**Malay** at the main address (`/`) and **English** under `/en/`.

The site is **an independent guide to local car workshops** in Johor Bahru. It is not a workshop.

> **Nothing goes live until you merge a pull request.** All work happens on side branches. Each pull request can get a private preview link (on `*.pages.dev`, hidden from Google). Only when you merge into `main` does Cloudflare publish it to jbcarfix.com.

All page text is currently placeholder, marked **"DRAFT – content pending"**.

## How it works, in one paragraph

The pages are built by a free tool called [Eleventy](https://www.11ty.dev/). Each area and each service has its own small text file holding that page's words. Eleventy pours those words into shared page layouts and produces plain web pages. Cloudflare Pages then hosts those pages for free.

## Folder layout

```
src/
  _data/
    site.json        Main settings: web address, brand, the tenantMode switch, button and form wording
    i18n.json        Short shared strings, such as the WhatsApp pre-filled message
    disclosures.json The disclosure lines shown next to a workshop's contact buttons
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
| `/cat-kereta/` | `/en/car-body-paint/` |
| `/towing-kereta/` | `/en/car-towing/` |
| `/kulai/` | `/en/kulai/` |
| `/gelang-patah/` | `/en/gelang-patah/` |
| `/bukit-indah/` | `/en/bukit-indah/` |
| `/skudai/` | `/en/skudai/` |
| `/larkin/` | `/en/larkin/` |
| (none) | `/en/near-ksl/` |
| `/privasi/` | `/en/privacy/` (placeholder, hidden from Google for now) |

`sitemap.xml` and `robots.txt` are made automatically.

### Thin-page guard (automatic noindex)

A page stays hidden from Google while **either** of these is true:
- its copy is still placeholder (`status: "placeholder"`, or any text still marked DRAFT);
- it is on the manual hold list, `indexHold` in `site.json`. That list matches the last part of the URL (for example `cat-kereta` or `car-body-paint`). It is empty for now. The body-and-paint and towing pages are still hidden because their copy is placeholder.

A hidden page gets `<meta name="robots" content="noindex,follow">` and is left out of `sitemap.xml`. If either language of a page is hidden, the hreflang pair between the two languages is dropped, both in the page head and in the sitemap. The guard lifts by itself once a page has real copy, **even if it lists no workshop**.

A page with no workshop shows no contact box at all: no buttons, no "coming soon" note, and nothing that suggests a workshop. A test fails if wording like that appears.

**Right now every page is hidden**, because all the copy is still placeholder, so the sitemap is empty.

## How to add an area

1. Copy any file in `src/_data/areas/`, for example `kulai.json`, and name it after the new area, like `senai.json`.
2. Inside, set `slug` to `senai` and fill in `name`.
3. Write **new text for every field** in both `ms` and `en`: intro, sections, FAQs and the WhatsApp message. Never copy another area's text and only change the town name.
4. Add the area to `areaOrder` in `src/_data/site.json`.
5. In `src/_data/routing.json`, add `"senai": []` under `areas`. The page shows no contact box until workshops are added.
6. Change `status` from `placeholder` to `draft` once real text is in.
7. Run `npm run check:unique`. It fails if two area pages share more than about 40% of their text.

The build stops with a clear message if something doesn't line up, for example an area listed in `site.json` that has no file.

## How contact routing works

Leads never go to the site owner. Calls and WhatsApp messages go straight to the workshops listed in `src/_data/routing.json`:

- `workshops` holds each workshop once, under its `workshop_id`.
- `areas` lists the workshops shown on each area page, up to 2.
- `services` optionally lists JB-wide workshops for a service page, up to 2.
- A page with no list shows no contact box at all. That's the `unassigned` default.

Each workshop has:
- `workshop_id`: a short, permanent ID, sent with analytics events
- `workshop`: `name`, `area` and `coverage` (the line under the name, in `en` and `ms`)
- `phone`: in `+60…` form, for the Call link. `phone_display` is the number exactly as shown, and `phone_label` (optional) is a short note shown next to it.
- `whatsapp` (optional, `null` = call only) and `whatsapp_label` (optional button text)
- `hours`: one line per day in `en` and `ms`, from the workshop's Google Maps listing
- `tenant_status`: `trial` or `tenant`
- `services` (optional): limits the workshop to those services. `general` means general repair and servicing. A limited workshop is skipped on other service pages.

**Who shows where now (trial):**

| Page | Workshops |
|---|---|
| Kulai | Tyreplus - Overseas Tyre Services Centre; Hankook Masters - Car Pit Stop Kulai |
| Gelang Patah | Kuga Auto Workshop; Fateh Tyre & Auto - Hoof Nexen |
| Bukit Indah | Jag Tech Auto Service; Overseas Tyre And Services |
| Skudai | ACS CAR SERVICE - Skudai; KAR Auto Service Center |
| Larkin | TIPTOP Garage Workshop; Petronas AutoExpert by Prestige Contitech - Larkin |
| Aircond (JB-wide) | Fresh Air Car Aircond Service; ACS CAR SERVICE - Skudai |
| Tyres (JB-wide) | Continental Syarikat Lim Chin Hin; Hawk Tyre Service Sdn Bhd - Tebrau |

Every other page has no contact box yet: home, servicing, battery, 24-hour mechanic, gearbox, body paint, towing and near KSL.

Each workshop gets its own card with:
- its name, coverage line and opening hours
- a Call button
- a WhatsApp button, only if it has one

Each card sends its own analytics events with its own `workshop_id`. The intro line appears once per page. Trial workshops never get a form or a logo; the form only appears for a `tenant` that has its own `web3forms_key`.

The build refuses a workshop with missing or placeholder details, a page with more than 2 workshops, or a trial workshop with a logo or photo. Workshop names and numbers appear **only in visible text and buttons**, never in the page's structured data or meta tags. A test checks this on every build.

To change who shows on a page, edit `routing.json` and open a pull request. Nothing changes on the site until you merge it.

The disclosure wording (approved wording) comes from `disclosures.json`:

- **All cards trial:** one intro above the cards: "Here are well-reviewed local workshops for this area. Call or WhatsApp them directly. {{ brand }} is an independent guide and isn't affiliated with them. Chosen from public Google reviews and, where known, years in business. We aren't paid by the workshops we suggest."
- **Any tenant card on the page:** the shared intro is only the first two sentences. Each tenant card gets "{{ brand }} is a car workshop guide. {{ workshop.name }} pays {{ brand }} a flat fee to be featured here. It doesn't change the price they quote you." Each trial card gets its own line: "{{ brand }} isn't affiliated with {{ workshop.name }}. Chosen from public Google reviews and, where known, years in business. {{ workshop.name }} doesn't pay us."
- **No workshop:** nothing.

Towing cards must not mention the operator's own workshop, claim services, "20–30 min" / "20–30 minit" or "no hidden fees" / "tiada caj tersembunyi". A test checks the towing pages and any workshop listed for towing.
- **when any card has WhatsApp:** a note from `i18n.json` that quotes the WhatsApp pre-fill.

### Brand and WhatsApp text

Write `{{ brand }}` anywhere in the data files, and the build fills in `brand` from `site.json`. The build stops if any `{{ ... }}` is left unfilled.

The WhatsApp button opens `wa.me/<number>?text=<message>` with the area's UTM tags after it. The message comes from `i18n.json`:
- Malay: "Hai, saya jumpa anda di {{ brand }}."
- English: "Hi, I found you on {{ brand }}."

## The contact form

**The form only appears for a `tenant` workshop that has its own `web3forms_key`. Trial pages have Call and WhatsApp buttons only.**

The visitor's browser sends the form **straight to Web3Forms** (`https://api.web3forms.com/submit`), which emails it to the workshop whose key is on that page. There is no server code. That's why it works on Web3Forms' free plan.

- The Web3Forms access key is public by design. It only tells Web3Forms which inbox gets the email, so it's fine for it to sit in the page.
- The browser checks the name, phone and consent before sending: HTML rules plus a small script in `src/assets/site.js`.
- A hidden `botcheck` box catches bots.
- The form also sends the `workshop_id`.
- The UTM tags the visitor arrived with are sent along, together with a per-area subject line and the workshop name.
- Afterwards the visitor lands on the thank-you page (`/terima-kasih/` or `/en/thank-you/`), with or without JavaScript.
- The consent line links to the privacy notice.

## Analytics events

When someone taps a contact button or sends the form, `src/assets/site.js` fires these events:

- `click_call`
- `click_whatsapp`
- `generate_lead`

Each event carries:
- `area`
- `service`: the service slug on service pages, otherwise `area` or `home`
- `workshop_id`
- `tenant_status`
- `lang`
- `page_path`

**GA4 is built in and switched off until an ID is set.** Put the measurement ID in `site.json` as `ga4_measurement_id`, for example `G-XXXXXXX`.
- **Empty (today):** no Google script loads at all.
- **Set:** every page loads `gtag.js` (async) from googletagmanager.com, `src/assets/ga4.js` runs `gtag('config', ID)`, and the events above go to GA4.

The CSP in `public/_headers` already allows Google's addresses. Tests confirm both cases: no GA tag when the ID is empty, and with a test ID the tag is present and the events reach `gtag`.

## Tracking must be verified on the PR preview before merge

Only two things remain:

- [ ] Add Muhammad's GA4 measurement ID to `ga4_measurement_id` in `src/_data/site.json`, through a pull request.
- [ ] On that pull request's preview link, with a test area set to `trial`, open GA4 **Admin → DebugView**. Tapping the call and WhatsApp buttons should show `click_call` and `click_whatsapp`, each with `area`, `service`, `workshop_id`, `tenant_status` and `lang`.

## Decisions made

- **The form posts straight from the browser to Web3Forms, on the free plan.** Web3Forms' free plan doesn't accept posts sent from a server, so there is no server function. The public access key sits in `routing.json`, one per workshop.
- **The English servicing page is `/en/car-servicing/`** (the Malay page stays `/servis/`). The team chose this wording for clearer English.

## Still needed before launch

- [ ] Web3Forms access key(s), from Muhammad's own Web3Forms sign-up (one per workshop inbox)
- [ ] The brand name (the site shows "JBCarFix" for now)
- [ ] Real page text, once it has been checked and cleared
- [ ] The privacy notice text. Then remove its noindex rules in `public/_headers` and set `status` in `privacy.json`
- [ ] Muhammad's GA4 measurement ID, then the DebugView check above

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
