  const fuzzyLimit = 20;

  // Use the actual parsed query and expanded index terms, so repeated words or
  // several prefix variants count as one query term, including typo matches.
  function queryTermLinks(index, query) {
    const parsed = new self.lunr.Query(index.fields);
    new self.lunr.QueryParser(query, parsed).parse();
    const links = new Map();
    for (const clause of parsed.clauses) {
      if (clause.presence === self.lunr.Query.presence.PROHIBITED) continue;
      const terms = index.tokenSet.intersect(self.lunr.TokenSet.fromClause(clause)).toArray();
      for (const word of terms) {
        if (!links.has(word)) links.set(word, []);
        links.get(word).push({ term: clause.term.replace(/\*/g, ""), fields: clause.fields });
      }
    }
    return links;
  }

  function fieldTerms(metadata, links, field, words) {
    const terms = new Set();
    for (const [word, fields] of Object.entries(metadata)) {
      if (!fields[field] || (words && !words.has(word))) continue;
      for (const link of links.get(word) || []) {
        if (link.fields.includes(field)) terms.add(link.term);
      }
    }
    return terms.size;
  }

  const escapePreview = text => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  function blockTokens(text) {
    return new Set(text.toLowerCase().split(self.lunr.tokenizer.separator).filter(Boolean));
  }

  function paragraphPreview(text, metadata) {
    const words = new Set(Object.entries(metadata).filter(([, fields]) => fields.text).map(([word]) => word));
    const separator = new RegExp(self.lunr.tokenizer.separator.source, "gu");
    let previous = 0;
    let output = "";
    const add = word => words.has(word.toLowerCase()) ? `<mark>${escapePreview(word)}</mark>` : escapePreview(word);
    for (const match of text.matchAll(separator)) {
      output += add(text.slice(previous, match.index)) + escapePreview(match[0]);
      previous = match.index + match[0].length;
    }
    return `<p>${output + add(text.slice(previous))}</p>`;
  }

  function rankFuzzy(item, evidence) {
    const source = sourceDocs.get(item.location);
    const meta = source?.searchMeta;
    const metadata = evidence?.metadata || {};
    const links = evidence?.links || new Map();
    const titleTerms = fieldTerms(metadata, links, "title");
    const blocks = meta?.blocks || [{ kind: /<table\b/i.test(source?.text || "") ? "table" : "body",
      text: String(source?.text || "").replace(/<[^>]*>/g, " ") }];
    const paragraphs = blocks.map((block, order) => ({ ...block, order,
      coverage: fieldTerms(metadata, links, "text", blockTokens(block.text))
    })).filter(block => block.coverage > 0);
    const body = paragraphs.filter(block => block.kind === "body")
      .sort((a, b) => b.coverage - a.coverage || a.order - b.order);
    let tier = 3;
    let coverage = Math.max(titleTerms, ...paragraphs.map(block => block.coverage), 0);
    let field = meta?.appendix ? "appendix" : paragraphs[0]?.kind || "other";
    if (!meta?.appendix) {
      if (titleTerms) {
        tier = item.location.includes("#") ? 1 : 0;
        coverage = titleTerms;
        field = tier === 0 ? "title" : "heading";
      } else if (body.length) {
        tier = 2;
        coverage = body[0].coverage;
        field = "body";
      }
    }
    let preview = item.text;
    if (tier === 2 && meta) {
      const words = blockTokens(body[0].text);
      const otherHits = [...item.text.matchAll(/<mark>([\s\S]*?)<\/mark>/g)]
        .some(match => !words.has(sourceText(match[1]).toLowerCase()));
      preview = paragraphPreview(body[0].text, metadata) + (otherHits ? item.text : "");
    }
    return { ...item, matchRank: { tier, coverage, field, headingLevel: meta?.headingLevel || 6 },
      // The native preview takes the first two hits, which may omit the paragraph
      // responsible for this result's rank. Show the strongest body passage.
      text: preview
    };
  }

  function compareFuzzy(a, b) {
    return a.matchRank.tier - b.matchRank.tier ||
      b.matchRank.coverage - a.matchRank.coverage ||
      (a.matchRank.tier === 1 ? a.matchRank.headingLevel - b.matchRank.headingLevel : 0) ||
      b.score - a.score || a.location.localeCompare(b.location);
  }

  function rankedGroups(items) {
    // One hit per group preserves global rank: regrouping by page would move a
    // low-ranked sibling ahead of stronger results belonging to another page.
    return items.map(item => {
      const page = item.location.split("#")[0];
      const parent = sourceDocs.get(page);
      return parent && item.location !== page
        ? [item, { ...parent, score: 0, terms: {} }]
        : [item];
    });
  }
