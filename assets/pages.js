// Language switch and topic filter for the generated Knowledge pages
(function () {
  var lang = "kh";
  function apply() {
    document.documentElement.lang = lang === "kh" ? "km" : "en";
    document.querySelectorAll("[data-kh]").forEach(function (el) { el.textContent = el.getAttribute("data-" + lang); });
    document.querySelectorAll("[data-lang-block]").forEach(function (el) { el.hidden = el.getAttribute("data-lang-block") !== lang; });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest(".chip"); if (!b) return;
    var tag = b.getAttribute("data-tag");
    document.querySelectorAll(".chip").forEach(function (c) { c.setAttribute("aria-pressed", c === b); });
    document.querySelectorAll(".card[data-tag]").forEach(function (c) { c.hidden = tag !== "all" && c.getAttribute("data-tag") !== tag; });
  });
  apply();
})();
