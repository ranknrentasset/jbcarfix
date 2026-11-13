// First-party only: remembers the first UTM tags a visitor arrived with (90 days),
// fills them into the lead form, and submits the form without leaving the page.
(function () {
  var KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
  var STORE = "jbcf_utm";
  var MAX_AGE = 90 * 24 * 3600 * 1000;
  var utm = null;
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
  var forms = document.querySelectorAll("form[data-lead-form]");
  Array.prototype.forEach.call(forms, function (form) {
    if (utm) KEYS.forEach(function (k) { if (form.elements[k] && utm[k]) form.elements[k].value = utm[k]; });
    form.addEventListener("submit", function (ev) {
      if (!window.fetch) return;
      ev.preventDefault();
      var status = form.querySelector(".status"), btn = form.querySelector("button[type=submit]");
      status.textContent = form.getAttribute("data-sending");
      btn.disabled = true;
      fetch(form.action, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok && j && j.ok }; }); })
        .catch(function () { return { ok: false }; })
        .then(function (res) {
          btn.disabled = false;
          status.textContent = form.getAttribute(res.ok ? "data-ok" : "data-error");
          if (res.ok) form.reset();
        });
    });
  });
})();
