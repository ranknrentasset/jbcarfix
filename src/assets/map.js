// Opt-in workshop map. Nothing loads until the visitor taps the "Show map" button: then the
// self-hosted Leaflet files (/assets/leaflet/, BSD-2-Clause, see LICENSE.txt there) are added
// and OpenStreetMap tiles are drawn. Pins come only from cards on the page that carry
// data-lat/data-lng, which are copied from each workshop's public Google Maps listing.
(function (root) {
  var doc = root.document;
  if (!doc) return;
  var btn = doc.querySelector("[data-map-btn]");
  if (!btn) return;
  var box = doc.getElementById(btn.getAttribute("aria-controls"));
  var section = btn.closest("[data-dir]");
  var map = null, layer = null, started = false;

  function pinned() {
    return Array.prototype.filter.call(doc.querySelectorAll("[data-lat][data-lng]"), function (el) { return !el.hidden; });
  }

  function popup(el, name) {
    var div = doc.createElement("div"), b = doc.createElement("strong");
    b.textContent = name;
    div.appendChild(b);
    var dir = el.querySelector('a[data-ev="click_directions"]');
    if (dir) {
      var a = doc.createElement("a");
      a.href = dir.href;
      a.rel = "noopener";
      a.className = "map-dir";
      a.textContent = btn.getAttribute("data-dir-label");
      a.addEventListener("click", function () {
        var J = root.JBCF;
        if (J && J.track) J.track("click_directions", J.eventParams(el.dataset));
      });
      div.appendChild(a);
    }
    return div;
  }

  function draw() {
    var L = root.L, pts = [];
    layer.clearLayers();
    pinned().forEach(function (el) {
      var lat = parseFloat(el.getAttribute("data-lat")), lng = parseFloat(el.getAttribute("data-lng"));
      if (!isFinite(lat) || !isFinite(lng)) return;
      var h = el.querySelector("h3"), name = h ? h.textContent : "";
      L.marker([lat, lng], { title: name, icon: L.divIcon({ className: "pin", iconSize: [28, 36], iconAnchor: [14, 34], popupAnchor: [0, -30] }) })
        .bindPopup(popup(el, name), { autoPanPaddingTopLeft: [56, 16] }).addTo(layer);
      pts.push([lat, lng]);
    });
    if (pts.length === 1) map.setView(pts[0], 15);
    else if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 15 });
  }

  function init() {
    var L = root.L;
    map = L.map(box, { scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    layer = L.layerGroup().addTo(map);
    draw();
    doc.addEventListener("jbcf:filter", function () { if (!box.hidden) draw(); });
  }

  function start() {
    started = true;
    var waiting = 2, done = function () { if (--waiting === 0) init(); };
    var css = doc.createElement("link");
    css.rel = "stylesheet";
    css.href = btn.getAttribute("data-css");
    css.onload = done;
    doc.head.appendChild(css);
    var js = doc.createElement("script");
    js.src = btn.getAttribute("data-js");
    js.onload = done;
    doc.head.appendChild(js);
  }

  function setOpen(open) {
    box.hidden = !open;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.querySelector("span").textContent = btn.getAttribute(open ? "data-hide" : "data-show");
    if (section) section.classList.toggle("map-on", open);
  }

  btn.addEventListener("click", function () {
    var open = btn.getAttribute("aria-expanded") !== "true";
    setOpen(open);
    if (!open) return;
    if (map) { map.invalidateSize(); draw(); }
    else if (!started) start();
  });
})(typeof window !== "undefined" ? window : globalThis);
