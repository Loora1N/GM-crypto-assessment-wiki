  // Scan complete passages independently of Lunr's word segmentation. Keep
  // offsets only while rendering hits, so the cached corpus stays compact.
  const literalNormalizations = [
    [/[\u200b-\u200d\ufeff]/g, ""],
    [/\s+/g, " "],
    [/(?<=\p{sc=Han}) | (?=\p{sc=Han})/gu, ""],
    [/\b0x0*(?=[0-9a-f])/gi, ""],
    [/^ +| +$/g, ""]
  ];

  function normalizeLiteral(text) {
    for (const [pattern, replacement] of literalNormalizations) text = text.replace(pattern, replacement);
    return text.toLowerCase();
  }

  function literalRanges(text, phrase) {
    const ranges = [];
    for (let start = text.indexOf(phrase); start !== -1; start = text.indexOf(phrase, start + phrase.length)) {
      const end = start + phrase.length;
      // Chinese passages can start inside a segmented word; ASCII identifiers
      // must keep their boundaries (SM4 is not 4, MAC is not HMAC).
      if (/^[a-z0-9]/.test(phrase) && /[a-z0-9]/.test(text[start - 1] || "") &&
          !(/^\d/.test(phrase) && /\bg[mb]t$/.test(text.slice(0, start)))) continue;
      if (/[a-z0-9]$/.test(phrase) && /[a-z0-9]/.test(text[end] || "")) continue;
      ranges.push([start, end]);
    }
    return ranges;
  }

  function literalMarkup(html, phrase) {
    let text = "";
    let offsets = [];
    for (const token of html.matchAll(/<[^>]*>|&(?:#\d+|#x[a-f\d]+|[a-z]+);|[^<&]+|[<&]/gi)) {
      const raw = token[0];
      const value = raw.startsWith("<") || raw.startsWith("&") ? sourceText(raw) : raw;
      for (let i = 0; i < value.length; i++) {
        text += value[i];
        offsets.push(raw.startsWith("<") || raw.startsWith("&")
          ? [token.index, token.index + raw.length]
          : [token.index + i, token.index + i + 1]);
      }
    }
    for (const [pattern, replacement] of literalNormalizations) {
      let next = "";
      const mapped = [];
      let previous = 0;
      for (const match of text.matchAll(pattern)) {
        next += text.slice(previous, match.index) + replacement;
        mapped.push(...offsets.slice(previous, match.index));
        if (replacement) mapped.push([offsets[match.index][0], offsets[match.index + match[0].length - 1][1]]);
        previous = match.index + match[0].length;
      }
      next += text.slice(previous);
      mapped.push(...offsets.slice(previous));
      text = next;
      offsets = mapped;
    }
    const ranges = literalRanges(text.toLowerCase(), phrase).map(([start, end]) =>
      [offsets[start][0], offsets[end - 1][1]]);
    const terms = new Set();
    let output = "";
    // Mark text nodes separately to preserve inline markup and table ancestry.
    for (const token of html.matchAll(/<[^>]*>|[^<]+/g)) {
      if (token[0].startsWith("<")) { output += token[0]; continue; }
      const end = token.index + token[0].length;
      let previous = token.index;
      for (const [left, right] of ranges) {
        const start = Math.max(left, token.index);
        const stop = Math.min(right, end);
        if (start >= stop) continue;
        output += html.slice(previous, start) + "<mark>" + html.slice(start, stop) + "</mark>";
        terms.add(sourceText(html.slice(start, stop)));
        previous = stop;
      }
      output += html.slice(previous, end);
    }
    return { html: output, terms: [...terms] };
  }

  function literalExcerpt(html) {
    const blocks = [];
    let depth = 0;
    let start = 0;
    for (const tag of html.matchAll(/<(\/?)([a-z][a-z\d]*)\b[^>]*>/gi)) {
      if (tag[1]) depth--;
      else if (!/^(?:br|hr|img|wbr|input)$/i.test(tag[2])) depth++;
      if (depth === 0) {
        blocks.push(html.slice(start, tag.index + tag[0].length));
        start = tag.index + tag[0].length;
      }
    }
    blocks.push(html.slice(start));
    return blocks.filter(block => block.includes("<mark>")).slice(0, 3).join("");
  }

  function exactSearch(query) {
    const phrase = normalizeLiteral(query);
    // A copied passage can contain Lunr operators (e.g. "对c+s随机数").
    // Always scan it literally; query syntax belongs only to token lookup.
    if (!phrase) return [];
    const hits = [];
    for (const document of sourceDocs.values()) {
      const fields = [document.title, document.text, ...(document.tags || [])];
      if (!literalFields.has(document.location)) {
        literalFields.set(document.location, fields.map(field => normalizeLiteral(sourceText(field))));
      }
      const matching = literalFields.get(document.location).map(field => literalRanges(field, phrase).length > 0);
      if (!matching.some(Boolean)) continue;
      const marked = fields.map((field, index) => matching[index]
        ? literalMarkup(String(field || ""), phrase) : { html: field, terms: [] });
      const terms = marked.flatMap(field => field.terms).filter(Boolean);
      hits.push({ ...document, score: 1, matchKind: "exact",
        title: marked[0].html,
        text: matching[1] ? literalExcerpt(marked[1].html) : "",
        ...(document.tags ? { tags: marked.slice(2).map(field => field.html) } : {}),
        terms: Object.fromEntries([[query.trim(), true], ...terms.map(term => [term, true])])
      });
    }
    return hits;
  }
