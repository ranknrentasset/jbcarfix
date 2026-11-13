// First-party only. Remembers the first UTM tags a visitor arrived with (90 days),
// fills them into the lead form, checks the form, and posts it straight to Web3Forms.
// On success the visitor is sent to the thank-you page (same as the no-JavaScript post).
(function (root) {
  var KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

  // Phone: digits with optional leading +, spaces, dashes or brackets; 9 to 15 digits.
  function normalisePhone(raw) {
    var s = String(raw || "").trim();
    if (!/^\+?[\d\s().-]+$/.test(s)) return null;
    var digits = s.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 15) return null;
    return (s.charAt(0) === "+" ? "+" : "") + digits;
  }

  // Returns a list of problem field names (empty list = OK).
  function validateLead(f) {
    var errors = [];
    if (String(f.name || "").trim().length < 2) errors.push("name");
    if (!normalisePhone(f.phone)) errors.push("phone");
    if (!f.consent) errors.push("consent");
    if (!f.access_key || /^TODO/.test(f.access_key)) errors.push("access_key");
    return errors;
  }

  // Analytics event parameters from the data-ev-* attributes on the contact block.
  // No analytics script is loaded by this site; events are only handed to gtag()
  // or window.dataLayer if one is added later.
  var EV_PARAMS = { evArea: "area", evLang: "lang", evWorkshopId: "workshop_id", evTenantStatus: "tenant_status", evService: "service", evPagePath: "page_path" };
  function eventParams(dataset) {
    var out = {};
    for (var k in EV_PARAMS) if (dataset && dataset[k]) out[EV_PARAMS[k]] = String(dataset[k]);
    return out;
  }
  function track(name, params) {
    try {
      if (typeof root.gtag === "function") root.gtag("event", name, params);
      else if (root.dataLayer && root.dataLayer.push) root.dataLayer.push(Object.assign({ event: name }, params));
    } catch (e) {}
  }

  root.JBCF = { normalisePhone: normalisePhone, validateLead: validateLead, eventParams: eventParams };
  if (typeof document === "undefined") return; // loaded by tests

  var STORE = "jbcf_utm", MAX_AGE = 90 * 24 * 3600 * 1000, utm = null;
  try {
    var saved = JSON.parse(localStorage.getItem(STORE) || "null");
    if (saved && Date.now() - saved.t < MAX_AGE) utm = saved.v;
  } catch (e) {}
  var params = new URLSearchParams(location.search), fresh = {}, any = false;
  KEYS.forEach(function (k) {
    var v = params.get(k);
    if (v) { fresh[k] = v.slice(0, 100); any = true; }
  });
  if (!utm && any) {
    utm = fresh;
    try { localStorage.setItem(STORE, JSON.stringify({ t: Date.now(), v: utm })); } catch (e) {}
  }

  Array.prototype.forEach.call(document.querySelectorAll(".routing a[data-ev]"), function (a) {
    a.addEventListener("click", function () {
      track(a.getAttribute("data-ev"), eventParams(a.closest(".routing").dataset));
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll("form[data-lead-form]"), function (form) {
    var el = form.elements;
    if (utm) KEYS.forEach(function (k) { if (el[k] && utm[k]) el[k].value = utm[k]; });
    var thanks = location.origin + form.getAttribute("data-thanks");
    if (el.redirect) el.redirect.value = thanks; // keeps preview sites on their own thank-you page
    form.addEventListener("submit", function (ev) {
      var status = form.querySelector(".status"), btn = form.querySelector("button[type=submit]");
      if (el.botcheck && el.botcheck.checked) { ev.preventDefault(); return; }
      var errors = validateLead({ name: el.name.value, phone: el.phone.value, consent: el.consent.checked, access_key: el.access_key.value });
      if (errors.length) {
        ev.preventDefault();
        status.textContent = form.getAttribute(errors.indexOf("access_key") >= 0 ? "data-error" : "data-invalid");
        return;
      }
      el.phone.value = normalisePhone(el.phone.value);
      if (!window.fetch) return; // plain post; Web3Forms redirects to the thank-you page
      ev.preventDefault();
      status.textContent = form.getAttribute("data-sending");
      btn.disabled = true;
      fetch(form.action, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } })
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .catch(function () { return {}; })
        .then(function (j) {
          if (j && j.success) {
            var box = form.closest(".routing");
            track("generate_lead", eventParams(box ? box.dataset : {}));
            setTimeout(function () { location.href = thanks; }, 150);
            return;
          }
          btn.disabled = false;
          status.textContent = form.getAttribute("data-error");
        });
    });
  });
})(typeof window !== "undefined" ? window : globalThis);
