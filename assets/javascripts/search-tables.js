/* Keep table previews bounded and bring their first highlighted row into view. */
(() => {
  let observer;
  let result;
  let pending = false;

  function enhanceTables() {
    pending = false;
    result.querySelectorAll("table").forEach(table => {
      let preview = table.parentElement;
      if (!preview.classList.contains("search-table-preview")) {
        preview = document.createElement("div");
        preview.className = "search-table-preview";
        preview.tabIndex = 0;
        preview.setAttribute("role", "region");
        preview.setAttribute("aria-label", "搜索结果表格，可滚动查看");
        table.before(preview);
        preview.append(table);
        table.querySelectorAll("th, td").forEach(cell => {
          const text = cell.textContent.replace(/\u200b/g, "").trim();
          if (/^[\w./:+~—-]+$/.test(text)) cell.classList.add("search-table-preview__identifier");
        });
        preview.addEventListener("keydown", event => {
          if (/^(Arrow|Page|Home$|End$|Shift$|Control$|Alt$|Meta$)/.test(event.key)) {
            event.stopPropagation();
          }
        });
      }

      if (preview.dataset.positioned || !preview.clientHeight) return;
      table.querySelectorAll("mark").forEach(mark => {
        mark.closest("tr")?.classList.add("search-table-preview__match");
      });
      const match = table.querySelector("mark");
      if (match) {
        const row = match.closest("tr");
        const headerHeight = table.tHead?.getBoundingClientRect().height || 0;
        if (row) {
          preview.scrollTop += row.getBoundingClientRect().top -
            preview.getBoundingClientRect().top - headerHeight - 8;
        }
        const cell = match.closest("td, th");
        if (cell && cell.getBoundingClientRect().right > preview.getBoundingClientRect().right) {
          preview.scrollLeft += cell.getBoundingClientRect().right -
            preview.getBoundingClientRect().right + 8;
        }
      }
      preview.dataset.positioned = "true";
    });
  }

  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(enhanceTables);
  }

  function focusTable(event) {
    if (event.key !== "Tab") return;
    const preview = event.target.closest(".search-table-preview");
    let target;
    if (preview) {
      const link = preview.closest("a");
      const links = [...result.querySelectorAll(".md-search-result__link")]
        .filter(item => item.getClientRects().length);
      target = event.shiftKey ? link : links[links.indexOf(link) + 1] ||
        document.querySelector('[data-md-component="search-query"]');
    } else if (!event.shiftKey && event.target.matches(".md-search-result__link")) {
      target = event.target.querySelector(".search-table-preview");
    }
    if (target) {
      event.preventDefault();
      event.stopPropagation();
      target.focus();
    }
  }

  function initialize() {
    const next = document.querySelector('[data-md-component="search-result"]');
    if (!next || next === result) return;
    observer?.disconnect();
    result = next;
    observer = new MutationObserver(schedule);
    observer.observe(result, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "open"]
    });
    result.addEventListener("toggle", schedule, true);
    result.addEventListener("keydown", focusTable, true);
    schedule();
  }

  if (typeof document$ !== "undefined") {
    document$.subscribe(initialize);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
