// Google Analytics 4 setup. Only included when site.json ga4_measurement_id is set.
// The measurement ID comes from this tag's data-ga4-id attribute; gtag.js itself loads async.
(function (root) {
  var s = root.document && root.document.currentScript;
  var id = s && s.getAttribute("data-ga4-id");
  if (!id) return;
  root.dataLayer = root.dataLayer || [];
  root.gtag = function () { root.dataLayer.push(arguments); };
  root.gtag("js", new Date());
  root.gtag("config", id);
})(typeof window !== "undefined" ? window : globalThis);
