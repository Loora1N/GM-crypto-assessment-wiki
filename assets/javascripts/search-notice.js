/* Explain automatic fallback without changing the query the user entered. */
(() => {
  if (typeof component$ === "undefined") return;
  component$.subscribe(component => {
    if (component.ref?.getAttribute("data-md-component") !== "search-result" ||
        !Array.isArray(component.items)) return;
    const meta = component.ref.querySelector(".md-search-result__meta");
    if (!meta) return;
    meta.querySelector(".search-match-notice")?.remove();
    if (!component.match) return;
    const notice = document.createElement("span");
    notice.className = "search-match-notice";
    notice.textContent = component.match.mode === "alias"
      ? "未找到原词结果，已按同义术语匹配"
      : "未找到准确结果，已显示近似匹配";
    meta.append(notice);
  });
})();
