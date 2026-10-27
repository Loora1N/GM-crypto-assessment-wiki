/* Label the exact/related union, including Material's lazily rendered groups. */
(() => {
  if (typeof component$ === "undefined") return;
  let state;
  let observer;
  let pending = false;
  const labels = { exact: "精准匹配", partial: "关键词匹配", fuzzy: "拼写相近", alias: "同义术语" };

  function decorate() {
    pending = false;
    if (!state?.matchCounts) return;
    const { exact, fuzzy } = state.matchCounts;
    const meta = state.ref.querySelector(".md-search-result__meta");
    const summary = `精准匹配 ${exact} 处 · 模糊匹配 ${fuzzy} 处（已去重）`;
    if (meta && exact + fuzzy && meta.textContent !== summary) meta.textContent = summary;
    const rendered = state.ref.querySelectorAll(".md-search-result__item");
    rendered.forEach((element, index) => {
      const group = state.items[index];
      if (!group) return;
      const kind = group[0].matchKind;
      if (index === 0 || state.items[index - 1][0].matchKind !== kind) {
        if (!element.previousElementSibling?.classList.contains("search-match-heading")) {
          const heading = document.createElement("li");
          heading.className = "search-match-heading";
          heading.setAttribute("role", "presentation");
          heading.textContent = `${kind === "exact" ? "精准匹配" : "模糊匹配"} · ${state.matchCounts[kind]} 处`;
          element.before(heading);
        }
      }
      element.querySelectorAll(".md-search-result__link").forEach(link => {
        const url = new URL(link.href);
        const item = group.find(item => {
          const relative = new URL(item.location, "https://search.invalid/");
          return item.score > 0 && url.pathname.endsWith(relative.pathname) && url.hash === relative.hash;
        });
        if (!item || link.querySelector(".search-match-badge")) return;
        const badge = document.createElement("span");
        badge.className = "search-match-badge";
        badge.dataset.matchKind = item.matchKind;
        badge.textContent = labels[item.matchKind === "exact" ? "exact" : item.matchReason];
        link.querySelector("h1, h2")?.prepend(badge);
      });
    });
  }

  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(decorate);
  }

  component$.subscribe(component => {
    if (component.ref?.getAttribute("data-md-component") !== "search-result" ||
        !Array.isArray(component.items)) return;
    if (state?.ref !== component.ref) {
      observer?.disconnect();
      observer = new MutationObserver(schedule);
      observer.observe(component.ref, { childList: true, subtree: true });
    }
    state = component;
    schedule();
  });
})();
