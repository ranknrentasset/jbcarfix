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

  root.JBCF = { normalisePhone: normalisePhone, validateLead: validateLead };
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
          if (j && j.success) { location.href = thanks; return; }
          btn.disabled = false;
          status.textContent = form.getAttribute("data-error");
        });
    });
  });
})(typeof window !== "undefined" ? window : globalThis);
