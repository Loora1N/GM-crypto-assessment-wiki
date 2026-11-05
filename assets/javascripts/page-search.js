/* Find literal text in the current article, independently of Material search. */
(() => {
  // Keep offsets into the original text so normalization never changes the page.
  function normalize(text) {
    let value = "";
    const starts = [];
    const ends = [];
    let offset = 0;
    for (const original of text) {
      const end = offset + original.length;
      for (const char of original.normalize("NFKC").toLowerCase()) {
        if (/[\u200b\ufeff\u00ad]/u.test(char)) continue;
        const next = /\s/u.test(char) ? " " : char;
        if (next === " " && value.endsWith(" ")) {
          ends[ends.length - 1] = end;
          continue;
        }
        value += next;
        for (let i = 0; i < next.length; i++) {
          starts.push(offset);
          ends.push(end);
        }
      }
      offset = end;
    }
    return { value, starts, ends };
  }

  function findMatches(blocks, query) {
    const needle = normalize(query).value.trim();
    if (!needle) return [];
    const matches = [];
    blocks.forEach((block, blockIndex) => {
      const haystack = normalize(block.text);
      let from = 0;
      while (from < haystack.value.length) {
        const start = haystack.value.indexOf(needle, from);
        if (start < 0) break;
        const end = start + needle.length;
        const match = { blockIndex, start: haystack.starts[start], end: haystack.ends[end - 1] };
        // A compatibility character can expand to multiple letters (e.g. ﬃ).
        const previous = matches[matches.length - 1];
        if (!previous || previous.blockIndex !== blockIndex || previous.end <= match.start) matches.push(match);
        from = end;
      }
    });
    return matches;
  }

  if (typeof module === "object" && module.exports) {
    module.exports = { normalize, findMatches };
    return;
  }

  const blockTags = new Set([
    "ARTICLE", "SECTION", "DIV", "P", "H1", "H2", "H3", "H4", "H5", "H6",
    "UL", "OL", "LI", "DL", "DT", "DD", "BLOCKQUOTE", "PRE", "TABLE", "THEAD",
    "TBODY", "TFOOT", "TR", "TD", "TH", "DETAILS", "SUMMARY", "FIGURE", "FIGCAPTION", "HR", "BR"
  ]);
  const excluded = ".topaz-page-search, .headerlink, .md-content__button, .md-code__button, " +
    ".linenos, .arithmatex, script, style, noscript, svg, math, button, input, textarea, select, [hidden]";
  let mountedArticle;
  let dispose;

  function collectBlocks(article) {
    const blocks = [];
    let text = "";
    let spans = [];
    function flush() {
      if (text.trim()) blocks.push({ text, spans });
      text = "";
      spans = [];
    }
    function visit(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        spans.push({ node, start: text.length, end: text.length + node.data.length });
        text += node.data;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.matches(excluded)) {
          // Do not manufacture a phrase by joining text around skipped content.
          flush();
          return;
        }
        const boundary = blockTags.has(node.tagName);
        if (boundary) flush();
        node.childNodes.forEach(visit);
        if (boundary) flush();
      }
    }
    article.childNodes.forEach(visit);
    flush();
    return blocks;
  }

  function mount() {
    const article = document.querySelector("article.md-content__inner");
    if (article === mountedArticle) return;
    dispose?.();
    mountedArticle = article;
    if (!article) return;

    const bar = document.createElement("section");
    bar.className = "topaz-page-search";
    bar.setAttribute("role", "search");
    bar.setAttribute("aria-label", "本文搜索");
    bar.innerHTML = `
      <label class="topaz-page-search__label" for="topaz-page-search-input">本文搜索</label>
      <input id="topaz-page-search-input" type="search" placeholder="查找本文中的关键词…" autocomplete="off" spellcheck="false" aria-describedby="topaz-page-search-help">
      <div class="topaz-page-search__controls">
        <output class="topaz-page-search__status" aria-live="polite" aria-atomic="true" for="topaz-page-search-input">输入关键词</output>
        <button type="button" data-action="previous" aria-label="本文搜索：上一处" title="上一处（Shift+Enter）" disabled>↑<span>上一处</span></button>
        <button type="button" data-action="next" aria-label="本文搜索：下一处" title="下一处（Enter）" disabled>↓<span>下一处</span></button>
        <button type="button" data-action="clear" aria-label="清除本文搜索" title="清除（Esc）" disabled>清除</button>
      </div>
      <span id="topaz-page-search-help" class="topaz-page-search__help">仅搜索本文。Enter 下一处，Shift+Enter 上一处，Esc 清除。</span>`;
    const title = article.querySelector("h1");
    if (title) title.after(bar);
    else article.prepend(bar);
    article.classList.add("topaz-has-page-search");

    const input = bar.querySelector("input");
    const status = bar.querySelector("output");
    const previous = bar.querySelector('[data-action="previous"]');
    const next = bar.querySelector('[data-action="next"]');
    const clear = bar.querySelector('[data-action="clear"]');
    let groups = [];
    let current = -1;
    let timer;
    let composing = false;
    let lastQuery = "";

    function clearMarks() {
      const parents = new Set();
      article.querySelectorAll("mark[data-page-search]").forEach(mark => {
        parents.add(mark.parentNode);
        mark.replaceWith(document.createTextNode(mark.textContent));
      });
      parents.forEach(parent => parent.normalize());
      groups = [];
      current = -1;
    }

    function highlight(blocks, matches) {
      groups = matches.map(() => []);
      const fragments = new Map();
      // Each text node is wrapped separately; links, code spans and table cells
      // keep their original elements and event handlers, including site highlights.
      let spanIndex = 0;
      let lastBlock = -1;
      matches.forEach((match, index) => {
        const spans = blocks[match.blockIndex].spans;
        if (match.blockIndex !== lastBlock) spanIndex = 0;
        lastBlock = match.blockIndex;
        while (spanIndex < spans.length && spans[spanIndex].end <= match.start) spanIndex++;
        for (let i = spanIndex; i < spans.length && spans[i].start < match.end; i++) {
          const span = spans[i];
          const start = Math.max(match.start, span.start) - span.start;
          const end = Math.min(match.end, span.end) - span.start;
          if (start >= end) continue;
          if (!fragments.has(span.node)) fragments.set(span.node, []);
          fragments.get(span.node).push({ start, end, index });
        }
      });
      fragments.forEach((parts, node) => {
        parts.reverse().forEach(part => {
          const text = node.splitText(part.start);
          text.splitText(part.end - part.start);
          const mark = document.createElement("mark");
          mark.dataset.pageSearch = "";
          text.replaceWith(mark);
          mark.append(text);
          groups[part.index].push(mark);
        });
      });
    }

    function updateSize() {
      const top = Math.max(0, document.querySelector(".md-header")?.getBoundingClientRect().bottom || 0);
      bar.style.top = `${top}px`;
      article.style.setProperty("--topaz-page-search-offset", `${top + bar.getBoundingClientRect().height + 16}px`);
    }

    function activate(index) {
      if (!groups.length) return;
      groups[current]?.forEach(mark => mark.classList.remove("topaz-page-search__current"));
      current = (index + groups.length) % groups.length;
      const marks = groups[current];
      marks.forEach(mark => mark.classList.add("topaz-page-search__current"));
      status.textContent = `${current + 1} / ${groups.length} 处`;
      const target = marks[0];
      for (let parent = target.parentElement; parent && parent !== article; parent = parent.parentElement) {
        if (parent.tagName === "DETAILS") parent.open = true;
      }
      // Reveal results within horizontally scrolling tables and code blocks too.
      target.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
      updateSize();
      const visibleTop = bar.getBoundingClientRect().bottom + 16;
      const rect = target.getBoundingClientRect();
      if (rect.top < visibleTop) window.scrollBy({ top: rect.top - visibleTop, behavior: "instant" });
    }

    function search() {
      clearTimeout(timer);
      timer = undefined;
      clearMarks();
      lastQuery = input.value;
      clear.disabled = !input.value;
      const blocks = collectBlocks(article);
      const matches = findMatches(blocks, input.value);
      highlight(blocks, matches);
      previous.disabled = next.disabled = !groups.length;
      status.textContent = normalize(input.value).value.trim() ? "未找到匹配" : "输入关键词";
      if (groups.length) activate(0);
    }

    function move(direction) {
      if (lastQuery !== input.value) {
        search();
        if (direction < 0) activate(groups.length - 1);
      } else activate(current + direction);
    }

    function reset() {
      input.value = "";
      search();
      input.focus({ preventScroll: true });
    }

    function schedule() {
      clearTimeout(timer);
      if (composing) return;
      clear.disabled = !input.value;
      previous.disabled = next.disabled = true;
      if (!input.value.trim()) return search();
      status.textContent = "正在查找…";
      timer = setTimeout(search, 180);
    }

    input.addEventListener("input", schedule);
    input.addEventListener("compositionstart", () => { composing = true; clearTimeout(timer); });
    input.addEventListener("compositionend", () => { composing = false; schedule(); });
    bar.addEventListener("keydown", event => {
      // Do not trigger Material's global search shortcuts while editing this field.
      event.stopPropagation();
      if (composing || event.isComposing || event.keyCode === 229) return;
      if (event.key === "Escape") { event.preventDefault(); reset(); }
      if (event.key === "Enter" && event.target === input) {
        event.preventDefault();
        move(event.shiftKey ? -1 : 1);
      }
    });
    previous.addEventListener("click", () => move(-1));
    next.addEventListener("click", () => move(1));
    clear.addEventListener("click", reset);
    const resize = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateSize) : null;
    resize?.observe(bar);
    const header = document.querySelector(".md-header");
    if (header) resize?.observe(header);
    window.addEventListener("resize", updateSize);
    updateSize();

    dispose = () => {
      clearTimeout(timer);
      resize?.disconnect();
      window.removeEventListener("resize", updateSize);
      clearMarks();
      bar.remove();
      article.classList.remove("topaz-has-page-search");
      article.style.removeProperty("--topaz-page-search-offset");
    };
  }

  if (typeof document$ !== "undefined") document$.subscribe(mount);
  else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
