/* Presentation adapters for Typora-compatible notes and self-hosted math. */
(() => {
  const alertNames = {
    note: "说明",
    tip: "提示",
    important: "重要",
    warning: "注意",
    caution: "警告"
  };

  function styleAlerts() {
    document.querySelectorAll(".md-typeset blockquote:not(.topaz-alert)").forEach(block => {
      const first = block.firstElementChild;
      if (!first || first.tagName !== "P") return;
      const marker = first.textContent.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i);
      if (!marker) return;
      const kind = marker[1].toLowerCase();
      block.classList.add("topaz-alert", `topaz-alert--${kind}`);
      first.classList.add("topaz-alert__title");
      first.textContent = alertNames[kind];
    });
  }

  function renderMath() {
    if (!window.katex) return;
    document.querySelectorAll(".arithmatex:not([data-topaz-rendered])").forEach(element => {
      const displayMode = element.tagName === "DIV";
      const source = element.textContent.trim();
      const expression = source.replace(/^\\\((.*)\\\)$/s, "$1").replace(/^\\\[(.*)\\\]$/s, "$1");
      window.katex.render(expression, element, {
        displayMode,
        throwOnError: false,
        strict: "ignore",
        trust: false
      });
      element.dataset.topazRendered = "true";
    });
  }

  function enhanceDocument() {
    styleAlerts();
    renderMath();
  }

  if (typeof document$ !== "undefined") {
    document$.subscribe(enhanceDocument);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enhanceDocument, { once: true });
  } else {
    enhanceDocument();
  }
})();
