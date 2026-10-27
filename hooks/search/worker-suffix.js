  self.addEventListener = listen;

  // Lunr concatenates edge labels and numeric node IDs without delimiters.
  // Numeric tokens can then collide during automaton minimization, producing
  // words absent from the inverted index and crashing a prefix query such as
  // "4*". Keep the same automaton with unambiguous node signatures.
  self.lunr.TokenSet.prototype.toString = function () {
    return this._str || JSON.stringify([
      this.final,
      Object.keys(this.edges).sort().map(label => [label, this.edges[label].id])
    ]);
  };

  // Lunr's match metadata contains the actual indexed words. Use those for
  // result links so a corrected query highlights real words on the target page.
  const search = self.lunr.Index.prototype.search;
  let capture = false;
  let matches = new Map();
  let sourceDocs = new Map();
  let literalFields = new Map();
  self.lunr.Index.prototype.search = function (query) {
    const results = search.call(this, query);
    if (capture) {
      for (const result of results) {
        matches.set(result.ref, Object.keys(result.matchData.metadata));
      }
    }
    return results;
  };

  async function run(message, remember = false) {
    materialResponse = undefined;
    matches = new Map();
    capture = remember;
    try {
      await materialHandler({ data: message });
    } finally {
      capture = false;
    }
    if (!materialResponse) throw new Error("The search worker did not respond");
    return materialResponse;
  }

  function sourceText(value) {
    return String(value || "")
      // Inline markup can split a word, but separate cells and paragraphs
      // cannot combine to create a phrase that does not occur in the source.
      .replace(/<\/?(?:p|div|br|li|ul|ol|dl|dt|dd|pre|blockquote|table|caption|thead|tbody|tfoot|tr|th|td|h[1-6]|hr|section|article|details|summary)\b[^>]*>/gi, "\0")
      .replace(/<[^>]*>/g, "")
      .replace(/&(?:#(\d+)|#x([a-f\d]+)|(amp|lt|gt|quot|apos|nbsp));/gi, (entity, decimal, hex, named) => {
        if (named) return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }[named.toLowerCase()];
        const point = decimal ? Number(decimal) : parseInt(hex, 16);
        return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
      })
      .replace(/[\u200b-\u200d\ufeff]/g, "");
  }

  function splitScriptBoundaries(query) {
    // The build-time Chinese segmenter inserts boundaries on both sides of a
    // Han run. Material's query segmenter does not, so adjacent Latin names
    // otherwise become impossible tokens such as "gcm模式" or "ctr计数器".
    return query.replace(/(\p{sc=Han})(?=[a-z0-9])|([a-z0-9])(?=\p{sc=Han})/giu, "$1$2 ");
  }

  function hasAlias(document, term) {
    if (!document) return false;
    const fields = [document.title, document.text, ...(document.tags || [])];
    if (/^[a-z]+$/i.test(term)) {
      // Identifiers such as SGD_MAC are separate tokens in our index; HMAC
      // must not satisfy a MAC alias just because it contains those letters.
      const word = new RegExp(`(^|[^a-z0-9])${term}(?=$|[^a-z0-9])`, "i");
      return fields.some(field => word.test(sourceText(field)));
    }
    return fields.some(field => sourceText(field).replace(/\s+/g, "").includes(term));
  }

  function filterAliasGroups(groups, term) {
    return groups.flatMap(group => {
      const retained = group.filter(item => item.score > 0 && hasAlias(sourceDocs.get(item.location), term));
      if (!retained.length) return [];
      const page = retained[0].location.split("#")[0];
      if (!retained.some(item => item.location === page)) {
        const article = sourceDocs.get(page) || group.find(item => item.location === page);
        if (article) retained.push({ ...article, score: 0, terms: {} });
      }
      return [retained];
    });
  }

  async function respond(message) {
    if (message.type === 0) {
      sourceDocs = new Map(message.data.docs.map(document => [document.location, { ...document }]));
      literalFields = new Map();
    }
    if (message.type !== 2) {
      send(await run(message));
      return;
    }

    // Exact passage lookup is independent of token lookup. A complete source
    // fragment must survive even when the tokenizer cannot retrieve it.
    const combined = new Map(exactSearch(message.data).map(item => [item.location, item]));
    const ordinary = await run({ ...message, data: splitScriptBoundaries(message.data) }, true);
    const append = (groups, reason) => {
      for (const item of groups.flat()) {
        if (item.score <= 0 || combined.get(item.location)?.matchKind === "exact") continue;
        const previous = combined.get(item.location);
        if (previous && (reason === "partial" || previous.matchReason !== "partial")) continue;
        const words = matches.get(item.location);
        combined.set(item.location, { ...item, matchKind: "fuzzy", matchReason: reason,
          ...(reason === "fuzzy" && words ? { terms: Object.fromEntries(words.map(word => [word, true])) } : {})
        });
      }
    };
    append(ordinary.data.items, "partial");
    let fallbackMode;
    for (const candidate of self.wikiSearchFallbacks(message.data)) {
      const fallback = await run({ ...message, data: candidate.query }, true);
      if (candidate.mode === "alias") {
        fallback.data.items = filterAliasGroups(fallback.data.items, candidate.term);
      }
      if (!fallback.data.items.length) continue;
      fallbackMode ||= candidate.mode;
      append(fallback.data.items, candidate.mode);
    }

    const exact = [...combined.values()].filter(item => item.matchKind === "exact");
    const fuzzy = [...combined.values()].filter(item => item.matchKind === "fuzzy")
      .sort((a, b) => b.score - a.score);
    const group = items => {
      const pages = new Map();
      for (const item of items) {
        const page = item.location.split("#")[0];
        if (!pages.has(page)) pages.set(page, []);
        pages.get(page).push(item);
      }
      for (const [page, items] of pages) {
        if (!items.some(item => item.location === page)) {
          const parent = sourceDocs.get(page);
          if (parent) items.push({ ...parent, score: 0, terms: {} });
        }
      }
      return [...pages.values()];
    };
    ordinary.data.items = [...group(exact), ...group(fuzzy)];
    ordinary.data.matchCounts = { exact: exact.length, fuzzy: fuzzy.length };
    if (!exact.length && fallbackMode && !ordinary.data.items.some(items => items.some(item => item.matchReason === "partial"))) {
      ordinary.data.match = { mode: fallbackMode, query: message.data };
      ordinary.data.suggest = [];
    }
    send(ordinary);
  }

  // Setup can load language scripts asynchronously in file:// mode. Serialize
  // all messages so rapid typing cannot mix response data or fallback metadata.
  let queue = Promise.resolve();
  listen("message", event => {
    const pending = queue.then(() => respond(event.data));
    queue = pending.catch(() => {});
    return pending;
  });
})();
