// Language switch and topic filter for the generated Knowledge pages
(function () {
  var lang = "kh";
  try { lang = localStorage.getItem("adsbox-lang") || "kh"; } catch (e) {}
  function apply() {
    document.documentElement.lang = lang === "kh" ? "km" : "en";
    document.querySelectorAll("[data-kh]").forEach(function (el) { el.textContent = el.getAttribute("data-" + lang); });
    document.querySelectorAll("[data-lang-block]").forEach(function (el) { el.hidden = el.getAttribute("data-lang-block") !== lang; });
    document.getElementById("lang-kh").setAttribute("aria-pressed", lang === "kh");
    document.getElementById("lang-en").setAttribute("aria-pressed", lang === "en");
  }
  function set(l) { lang = l; try { localStorage.setItem("adsbox-lang", l); } catch (e) {} apply(); }
  document.getElementById("lang-kh").addEventListener("click", function () { set("kh"); });
  document.getElementById("lang-en").addEventListener("click", function () { set("en"); });
  document.addEventListener("click", function (e) {
    var b = e.target.closest(".chip"); if (!b) return;
    var tag = b.getAttribute("data-tag");
    document.querySelectorAll(".chip").forEach(function (c) { c.setAttribute("aria-pressed", c === b); });
    document.querySelectorAll(".card[data-tag]").forEach(function (c) { c.hidden = tag !== "all" && c.getAttribute("data-tag") !== tag; });
  });
  apply();
})();
