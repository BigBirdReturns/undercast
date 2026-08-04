"use strict";
document.documentElement.classList.add("js");

(() => {
  const mobile = window.matchMedia("(max-width: 700px)");
  const openLabel = "Open archive menu";
  const closeLabel = "Close archive menu";

  const enhance = (shell, index) => {
    const nav = shell.querySelector(".site-nav");
    if (!nav || shell.dataset.navEnhanced === "true") return;

    const id = nav.id || `archive-navigation-${index + 1}`;
    nav.id = id;

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "site-nav-toggle";
    toggle.setAttribute("aria-controls", id);
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", openLabel);
    toggle.innerHTML = '<span aria-hidden="true">Menu</span><span class="site-nav-toggle__state" aria-hidden="true">+</span>';

    shell.dataset.navEnhanced = "true";
    shell.dataset.navOpen = "false";
    shell.insertBefore(toggle, nav);

    const setOpen = (open, { returnFocus = false } = {}) => {
      const expanded = Boolean(open && mobile.matches);
      shell.dataset.navOpen = expanded ? "true" : "false";
      toggle.setAttribute("aria-expanded", String(expanded));
      toggle.setAttribute("aria-label", expanded ? closeLabel : openLabel);
      toggle.querySelector(".site-nav-toggle__state").textContent = expanded ? "−" : "+";
      if (returnFocus) toggle.focus();
    };

    toggle.addEventListener("click", () => {
      setOpen(shell.dataset.navOpen !== "true");
    });

    shell.addEventListener("keydown", event => {
      if (event.key === "Escape" && shell.dataset.navOpen === "true") {
        event.preventDefault();
        setOpen(false, { returnFocus: true });
      }
    });

    nav.addEventListener("click", event => {
      if (mobile.matches && event.target.closest("a")) setOpen(false);
    });

    const leaveCompactMode = () => {
      if (!mobile.matches) setOpen(false);
    };
    if (typeof mobile.addEventListener === "function") mobile.addEventListener("change", leaveCompactMode);
    else mobile.addListener(leaveCompactMode);
  };

  const start = () => {
    document.querySelectorAll(".site-shell").forEach(enhance);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
