/* Shared page-edge navigation for online and offline documents. */
(() => {
  let navigation;
  let topButton;
  let bottomButton;
  let pendingFrame = false;

  function scrollLimit() {
    const page = document.scrollingElement || document.documentElement;
    return Math.max(0, page.scrollHeight - page.clientHeight);
  }

  function updateNavigation() {
    pendingFrame = false;
    const limit = scrollLimit();
    navigation.hidden = limit <= 1;
    // Keep focused buttons in the tab order when an edge is reached.
    topButton.setAttribute("aria-disabled", String(window.scrollY <= 1));
    bottomButton.setAttribute("aria-disabled", String(window.scrollY >= limit - 1));
  }

  function scheduleUpdate() {
    if (pendingFrame) return;
    pendingFrame = true;
    window.requestAnimationFrame(updateNavigation);
  }

  function createButton(label, caption, path, atBottom) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "topaz-page-nav__button";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"/></svg><span>${caption}</span>`;
    button.addEventListener("click", () => {
      if (button.getAttribute("aria-disabled") === "true") return;
      window.scrollTo({
        top: atBottom ? scrollLimit() : 0,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"
      });
    });
    return button;
  }

  function mountNavigation() {
    if (navigation) {
      scheduleUpdate();
      return;
    }
    navigation = document.createElement("div");
    navigation.className = "topaz-page-nav";
    navigation.setAttribute("role", "group");
    navigation.setAttribute("aria-label", "页面翻页辅助");
    navigation.hidden = true;
    topButton = createButton("回到页顶", "页顶", "M5 4h14M6 13l6-6 6 6M12 7v13", false);
    bottomButton = createButton("直达页底", "页底", "M5 20h14M6 11l6 6 6-6M12 4v13", true);
    navigation.append(topButton, bottomButton);
    document.body.append(navigation);

    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    // Images, math and expanded details can change the destination after load.
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(scheduleUpdate).observe(document.body);
    }
    window.addEventListener("load", scheduleUpdate, { once: true });
    updateNavigation();
  }

  if (typeof document$ !== "undefined") {
    document$.subscribe(mountNavigation);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountNavigation, { once: true });
  } else {
    mountNavigation();
  }
})();
