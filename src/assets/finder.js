// Home page only. 1) The hero search box shows the service and area pages whose names
// (in either language) match what is typed. 2) The filter buttons above the workshop list
// show only the entries for one service or area. No network requests.
(function (root) {
  var doc = root.document;
  if (!doc) return;
  function norm(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  }
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  var box = doc.querySelector("[data-finder]");
  if (box) {
    var input = box.querySelector("input"), list = box.querySelector(".finder-list");
    var items = list.querySelectorAll("li[data-k]"), none = list.querySelector(".finder-none");
    var show = function (on) { list.hidden = !on; };
    var first = function () {
      for (var i = 0; i < items.length; i++) if (!items[i].hidden) return items[i].querySelector("a");
      return null;
    };
    input.addEventListener("input", function () {
      var words = norm(input.value).split(" ").filter(Boolean), n = 0;
      if (!words.length) { show(false); return; }
      each(items, function (li) {
        var key = norm(li.getAttribute("data-k"));
        var hit = words.every(function (w) { return key.indexOf(w) >= 0; });
        li.hidden = !hit;
        if (hit) n++;
      });
      none.hidden = n > 0;
      show(true);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") show(false);
      if (e.key === "Enter") { var a = first(); if (a) { e.preventDefault(); root.location.href = a.href; } }
    });
    doc.addEventListener("click", function (e) { if (!box.contains(e.target)) show(false); });
  }

  var dir = doc.querySelector("[data-dir]");
  if (dir) {
    var buttons = dir.querySelectorAll("[data-filter]"), cards = dir.querySelectorAll(".dir-card"), empty = dir.querySelector(".dir-empty");
    each(buttons, function (btn) {
      btn.addEventListener("click", function () {
        var f = btn.getAttribute("data-filter"), shown = 0;
        each(buttons, function (b) { b.setAttribute("aria-pressed", b === btn ? "true" : "false"); });
        each(cards, function (c) {
          var hit = !f || (" " + c.getAttribute("data-f") + " ").indexOf(" " + f + " ") >= 0;
          c.hidden = !hit;
          if (hit) shown++;
        });
        empty.hidden = shown > 0;
        try { doc.dispatchEvent(new CustomEvent("jbcf:filter")); } catch (e) {}
      });
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
