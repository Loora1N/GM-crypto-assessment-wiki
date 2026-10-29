/* Label the exact/related union, including Material's lazily rendered groups. */
(() => {
  if (typeof component$ === "undefined") return;
  let state;
  let observer;
  let pending = false;
  const labels = { exact: "精准匹配", partial: "关键词匹配", fuzzy: "拼写相近", alias: "同义术语" };
  const fields = { title: "文章标题", heading: "小标题", body: "正文", table: "表格", formula: "公式", appendix: "附录", other: "其他" };

  function decorate() {
    pending = false;
    if (!state?.matchCounts) return;
    const { exact, fuzzy } = state.matchCounts;
    const shown = state.fuzzyShown ?? fuzzy;
    const meta = state.ref.querySelector(".md-search-result__meta");
    const summary = `精准匹配 ${exact} 处 · 模糊匹配 ${fuzzy} 处${fuzzy > shown ? `（展示前 ${shown} 处，已去重）` : "（已去重）"}`;
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
        if (item.matchKind === "fuzzy" && item.matchRank) {
          badge.textContent += ` · ${fields[item.matchRank.field]} · 命中 ${item.matchRank.coverage} 词`;
        }
        link.querySelector("h1, h2")?.prepend(badge);
      });
    });
    const list = state.ref.querySelector(".md-search-result__list");
    let notice = state.ref.querySelector(".search-match-limit");
    if (fuzzy > shown && rendered.length === state.items.length && list) {
      if (!notice) {
        notice = document.createElement("li");
        notice.className = "search-match-limit";
        notice.setAttribute("role", "status");
      }
      const text = `模糊匹配结果总数${fuzzy}，数量较多只展示了${shown}`;
      if (notice.textContent !== text) notice.textContent = text;
      if (list.lastElementChild !== notice) list.append(notice);
    } else {
      notice?.remove();
    }
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
