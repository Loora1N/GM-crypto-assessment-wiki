  self.addEventListener = listen;

  // Lunr's match metadata contains the actual indexed words. Use those for
  // result links so a corrected query highlights real words on the target page.
  const search = self.lunr.Index.prototype.search;
  let capture = false;
  let matches = new Map();
  let sourceDocs = new Map();
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
    }
    const ordinary = await run(message);
    if (message.type !== 2 || ordinary.data.items.length) {
      send(ordinary);
      return;
    }

    for (const candidate of self.wikiSearchFallbacks(message.data)) {
      const fallback = await run({ ...message, data: candidate.query }, candidate.mode === "fuzzy");
      if (candidate.mode === "alias") {
        fallback.data.items = filterAliasGroups(fallback.data.items, candidate.term);
      }
      if (!fallback.data.items.length) continue;
      if (candidate.mode === "fuzzy") {
        for (const group of fallback.data.items) {
          for (const item of group) {
            const words = matches.get(item.location);
            if (item.score > 0 && words) {
              item.terms = Object.fromEntries(words.map(word => [word, true]));
            }
          }
        }
      }
      fallback.data.match = { mode: candidate.mode, query: message.data };
      fallback.data.suggest = [];
      send(fallback);
      return;
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
