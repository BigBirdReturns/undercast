(() => {
  "use strict";
  const root = document.documentElement;
  const storageKey = "uc-theme";
  const media = matchMedia("(prefers-color-scheme: dark)");
  root.classList.add("js");

  const storedTheme = () => {
    try {
      const value = localStorage.getItem(storageKey);
      return value === "dark" || value === "light" ? value : null;
    } catch (_) {
      return null;
    }
  };

  const applyTheme = (theme, persist = false) => {
    const dark = theme === "dark";
    root.dataset.theme = dark ? "dark" : "light";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#15120D" : "#E8E3D9");
    for (const button of document.querySelectorAll("[data-theme-toggle]")) {
      button.textContent = dark ? "☀ Light" : "☾ Dark";
      button.setAttribute("aria-pressed", String(dark));
      button.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
      button.title = dark ? "Switch to light theme" : "Switch to dark theme";
    }
    for (const source of document.querySelectorAll('picture.absence-plate source[srcset*="placeholder-dark-clean.png"]')) source.media = dark ? "all" : "not all";
    if (persist) {
      try { localStorage.setItem(storageKey, dark ? "dark" : "light"); } catch (_) {}
    }
  };

  const initial = storedTheme() || "light";
  applyTheme(initial, false);

  const wire = () => {
    applyTheme(root.dataset.theme || initial, false);
    for (const button of document.querySelectorAll("[data-theme-toggle]")) {
      if (button.dataset.themeWired) continue;
      button.dataset.themeWired = "1";
      button.addEventListener("click", () => applyTheme(root.dataset.theme === "dark" ? "light" : "dark", true));
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire, { once: true });
  else wire();

})();
