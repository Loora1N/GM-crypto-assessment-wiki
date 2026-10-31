// Exercise Material's built search worker with Node only. Run after mkdocs build:
//   node tests/search.test.cjs site
//   node tests/search.test.cjs site-offline --offline
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { fileURLToPath, pathToFileURL } = require('node:url');
const { test } = require('node:test');

const site = path.resolve(process.argv[2] || 'site');
const offline = process.argv.includes('--offline') || path.basename(site) === 'site-offline';
const plain = (text) => text.replace(/<[^>]*>/g, '').replace(/\u200b/g, '');
const marked = (text) => [...text.matchAll(/<mark>(.*?)<\/mark>/g)].map((match) => plain(match[1]));

function pageConfig(html) {
  const match = html.match(/<script\b[^>]*\bid="__config"[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(match, 'Built page must include Material configuration');
  return JSON.parse(match[1]);
}

// Parse just table subtrees, checking balanced tags and row/cell ancestry. This
// deliberately does not let a header, label and value in separate rows pass.
function tableTrees(html) {
  const tables = [];
  const stack = [];
  const allowed = { table: ['thead', 'tbody', 'tfoot'], thead: ['tr'], tbody: ['tr'], tfoot: ['tr'], tr: ['th', 'td'] };
  const structural = new Set([...Object.keys(allowed), 'th', 'td']);
  for (const token of html.matchAll(/<(\/?)([a-z][a-z\d]*)\b[^>]*>|([^<]+)/gi)) {
    const parent = stack.at(-1);
    if (token[3] !== undefined) {
      if (parent) {
        if (allowed[parent.tag]) assert.equal(token[3].trim(), '', `Text must be inside a table cell, not ${parent.tag}`);
        parent.children.push(token[3]);
      }
      continue;
    }
    const tag = token[2].toLowerCase();
    if (!parent && tag !== 'table') {
      assert.ok(!structural.has(tag), `${tag} must be inside a table`);
      continue;
    }
    if (token[1]) {
      assert.equal(parent?.tag, tag, `Unbalanced table tag: ${token[0]}`);
      stack.pop();
      continue;
    }
    if (parent) {
      assert.notEqual(tag, 'table', 'Nested tables are not expected in search previews');
      if (allowed[parent.tag]) assert.ok(allowed[parent.tag].includes(tag), `${tag} is invalid inside ${parent.tag}`);
      if (structural.has(tag)) assert.ok(allowed[parent.tag]?.includes(tag), `${tag} has invalid parent ${parent.tag}`);
    }
    const node = { tag, children: [] };
    if (parent) parent.children.push(node);
    else tables.push(node);
    if (!/^(?:br|hr|img|wbr|input)$/.test(tag)) stack.push(node);
  }
  assert.equal(stack.length, 0, 'Table preview must close all tags');
  return tables;
}

const children = (node, tag) => node.children.filter((child) => typeof child === 'object' && child.tag === tag);
const nodeText = (node) => plain(node.children.map((child) => typeof child === 'string' ? child : nodeText(child)).join('')).trim();
function nodeMarks(node) {
  return node.children.flatMap((child) => typeof child === 'string' ? [] : child.tag === 'mark' ? [nodeText(child)] : nodeMarks(child));
}

function tableRow(html, headers, expectedCells) {
  const tables = tableTrees(html);
  assert.ok(tables.length > 0, 'Search text must preserve an HTML table');
  for (const table of tables) {
    const headerRows = children(table, 'thead').flatMap((head) => children(head, 'tr'));
    if (!headerRows.some((row) => JSON.stringify(children(row, 'th').map(nodeText)) === JSON.stringify(headers))) continue;
    for (const row of children(table, 'tbody').flatMap((body) => children(body, 'tr'))) {
      const cells = children(row, 'td');
      if (cells.length === expectedCells.length && cells.every((cell, i) => {
        const expected = expectedCells[i];
        return expected instanceof RegExp ? expected.test(nodeText(cell)) : nodeText(cell) === expected;
      })) return cells;
    }
  }
  assert.fail(`Expected one table with headers ${headers.join(' / ')} and a single row containing ${expectedCells.join(' / ')}`);
}

function localFile(base, url) {
  assert.ok(!/^(?:[a-z][a-z\d+.-]*:|\/\/|\/)/i.test(url), `Expected a local resource: ${url}`);
  return checkedFile(path.resolve(base, decodeURIComponent(url.split(/[?#]/)[0])));
}

function checkedFile(file) {
  const relative = path.relative(site, file);
  assert.ok(relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), `Resource leaves build directory: ${file}`);
  assert.ok(fs.statSync(file).isFile(), `Missing build resource: ${file}`);
  return file;
}

async function loadWorker(config, index, { iframe = false, queuedQueries = [] } = {}) {
  const workerFile = localFile(site, config.search);
  assert.match(workerFile.replaceAll('\\', '/'), /\/assets\/javascripts\/workers\/search\.[^/]+\.min\.js$/);
  const warnings = [];
  const imported = [];
  const pending = [];
  let scriptLookups = 0;
  let listener;
  const context = vm.createContext({
    console: { warn: (...args) => warnings.push(args.map(String).join(' ')) },
    addEventListener(type, callback) {
      assert.equal(type, 'message');
      listener = callback;
    },
    postMessage(message) {
      const request = pending.shift();
      assert.ok(request, 'Worker returned an unsolicited response');
      clearTimeout(request.timer);
      request.resolve(message);
    },
    importScripts(...urls) {
      const importOne = (url) => {
        // Material derives absolute file URLs from script.src in the iframe.
        if (iframe) assert.equal(new URL(url).protocol, 'file:', 'Iframe language scripts must stay local');
        const file = iframe ? checkedFile(fileURLToPath(url)) : localFile(path.dirname(workerFile), url);
        imported.push(file);
        vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file, timeout: 10000 });
      };
      if (!iframe) return urls.forEach(importOne);
      // The shipped iframe shim loads scripts in sequence and returns a Promise.
      // Yield before each script so a missing await in SETUP cannot pass unnoticed.
      return (async () => {
        for (const url of urls) {
          await new Promise((resolve) => setImmediate(resolve));
          importOne(url);
        }
      })();
    },
  });
  context.self = context;
  if (iframe) {
    context.parent = { IFrameWorker: function IFrameWorker() {} };
    context.document = {
      querySelector(selector) {
        assert.equal(selector, 'script[src]');
        scriptLookups += 1;
        return { src: `${pathToFileURL(workerFile).href}?offline-test` };
      },
    };
  }
  vm.runInContext(fs.readFileSync(workerFile, 'utf8'), context, { filename: workerFile, timeout: 10000 });
  assert.equal(typeof listener, 'function', 'Worker must subscribe to messages');

  async function send(type, data) {
    let request;
    const reply = new Promise((resolve, reject) => {
      request = { resolve, reject, timer: setTimeout(() => reject(new Error(`Worker did not respond to message ${type}`)), 10000) };
      pending.push(request);
    });
    try {
      Promise.resolve(listener({ data: { type, data } })).catch(request.reject);
    } catch (error) {
      request.reject(error);
    }
    const response = await reply.finally(() => {
      clearTimeout(request.timer);
      const position = pending.indexOf(request);
      if (position >= 0) pending.splice(position, 1);
    });
    assert.equal(warnings.length, 0, warnings.join('\n'));
    return response;
  }

  const response = async (query) => {
    const result = await send(2, query);
    assert.equal(result.type, 3, 'QUERY must return RESULT');
    assert.ok(Array.isArray(result.data.items));
    return result.data;
  };
  const setup = send(0, {
    ...structuredClone(index),
    options: { suggest: config.features.includes('search.suggest') },
  });
  const earlyResponses = Promise.all(queuedQueries.map(response));
  const ready = await setup;
  assert.equal(ready.type, 1, 'SETUP must return READY');
  assert.ok(imported.some((file) => file.endsWith('lunr.zh.min.js')), 'Load the real Chinese language module');
  if (iframe) assert.ok(scriptLookups > 0, 'Exercise the iframe-specific script URL resolution');
  const query = async (text) => (await response(text)).items.flat();
  query.response = response;
  query.initialResponses = await earlyResponses;
  return query;
}

function standardResult(results, anchor, query) {
  const result = results.find((item) => item.location.includes('standard/GMT0006-2023/') && item.location.endsWith(`#${anchor}`));
  const locations = results.slice(0, 8).map((item) => decodeURIComponent(item.location)).join(', ');
  assert.ok(result, `${JSON.stringify(query)} must match GMT0006 #${anchor}; got: ${locations || '(no results)'}${results.length > 8 ? ', …' : ''}`);
  assert.ok(result.score > 0, 'A fallback page entry is not a search match');
  assert.ok(marked(result.title + result.text).length > 0, 'Result must include highlighted matches');
  return result;
}

function noteWithPassage(index, phrase) {
  // Notes can move into author folders. Locate the original section by its
  // unique passage while still requiring it to exist in the real built index.
  const notes = index.docs.filter(doc => decodeURIComponent(doc.location).startsWith('notes/') &&
    plain(doc.text).includes(phrase));
  assert.equal(notes.length, 1, `Expected one notes section containing ${JSON.stringify(phrase)}; found ${notes.length}`);
  return notes[0];
}

test(`built search: ${path.basename(site)}`, async (t) => {
  const html = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
  const config = pageConfig(html);
  const index = JSON.parse(fs.readFileSync(path.join(site, 'search/search_index.json'), 'utf8'));
  const query = await loadWorker(config, index);

  await t.test('index links point to the actual block cipher section', () => {
    const section = index.docs.find((doc) => doc.location.includes('standard/GMT0006-2023/') && doc.location.endsWith('#621'));
    assert.ok(section, 'GM/T 0006 section 6.2.1 must be indexed');
    assert.equal(plain(section.title).replace(/\s/g, ''), '6.2.1分组密码算法标识');
    const [page, anchor] = section.location.split('#');
    const pageFile = localFile(site, page.endsWith('/') ? `${page}index.html` : page);
    const pageHtml = fs.readFileSync(pageFile, 'utf8');
    assert.ok(pageHtml.includes(`id="${anchor}"`), 'Search destination must exist in HTML');
    assert.equal(localFile(path.dirname(pageFile), pageConfig(pageHtml).search), localFile(site, config.search), 'Nested content page must resolve to the same enhanced worker as the home page');
  });

  await t.test('404 page uses the same enhanced search worker as content pages', () => {
    const errorConfig = pageConfig(fs.readFileSync(path.join(site, '404.html'), 'utf8'));
    const workerName = (url) => path.posix.basename(new URL(url, 'https://search.test/').pathname);
    assert.equal(workerName(errorConfig.search), workerName(config.search), 'Template pages must not retain the original worker');
  });

  await t.test('index preserves the SM4 label, identifier and definition in one table row', () => {
    const section = index.docs.find((doc) => doc.location.includes('standard/GMT0006-2023/') && doc.location.endsWith('#621'));
    tableRow(section.text, ['标签', '标识符', '定义'], ['SGD_SM4_ECB', '0x00000401', /SM4算法ECB加密模式.*128比特/]);
  });

  for (const term of ['401', '0x401', '0x00000401', '0X00000401']) {
    await t.test(`${term} finds the SM4 ECB identifier and highlights it`, async () => {
      const result = standardResult(await query(term), '621', term);
      const snippet = plain(result.text);
      assert.match(snippet, /SGD_SM4_ECB/);
      assert.match(snippet, /0x00000401/i);
      assert.ok(marked(result.text).some((text) => /401/i.test(text)), 'Highlight must cover the identifier value');
      const cells = tableRow(result.text, ['标签', '标识符', '定义'], ['SGD_SM4_ECB', '0x00000401', /SM4算法ECB加密模式.*128比特/]);
      assert.ok(nodeMarks(cells[1]).some((text) => text.includes('401')), 'Highlight must belong to the identifier cell in the SM4 ECB row');
    });
  }

  for (const term of ['SGD_SM4', 'SM4']) {
    await t.test(`${term} finds an SM4 identifier in the block cipher section`, async () => {
      const result = standardResult(await query(term), '621', term);
      assert.match(plain(result.text), /SGD_SM4_[A-Z]+/);
      assert.ok(marked(result.text).some((text) => /SM4/i.test(text)), 'Highlight must cover SM4');
    });
  }

  for (const term of ['"SGD_SM4_ECB"', 'ECB']) {
    await t.test(`${term} finds and highlights the cipher mode`, async () => {
      const result = standardResult(await query(term), '621', term);
      assert.match(plain(result.text), /SGD_\w+_ECB/);
      assert.ok(marked(result.text).some((text) => /ECB/i.test(text)), 'Highlight must cover ECB');
      if (term.startsWith('"')) {
        assert.ok(marked(result.text).some((text) => /SM4/i.test(text)), 'Quoted identifier must also match SM4');
        for (const component of ['sgd', 'sm4', 'ecb']) {
          assert.equal(result.terms[component], true, `Quoted identifier must match ${component}`);
        }
      }
    });
  }

  await t.test('0006 finds the standard number', async () => {
    const result = (await query('0006')).find((item) => item.location.includes('standard/GMT0006-2023/') && !item.location.includes('#'));
    assert.ok(result && result.score > 0, 'Standard page must be an actual match');
    assert.match(
      plain(result.title + ' ' + result.text),
      /(?:GM\/T\s*0006|GMT0006)/i
    );
        assert.ok(marked(result.title + result.text).some((text) => text.includes('0006')));
  });

  for (const term of ['GMT0006', 'gmt0006']) {
    await t.test(`${term} finds and highlights the standard title`, async () => {
      const result = (await query(term)).find((item) => item.location.includes('standard/GMT0006-2023/') && !item.location.includes('#'));
      assert.ok(result && result.score > 0, 'Standard page must be an actual match');
      assert.match(plain(result.title), /GMT0006-2023/);
      assert.ok(marked(result.title).some((text) => /GMT/i.test(text)));
      assert.ok(marked(result.title).some((text) => text.includes('0006')));
    });
  }

  await t.test('copied mixed Chinese and Latin passage finds the original notes first', async () => {
    const phrase = 'gcm模式下ctr计数器';
    const note = noteWithPassage(index, phrase);
    for (const term of [phrase, 'GCM模式下CTR计数器', 'gcm 模式下 ctr 计数器', '后续gcm模式下ctr计数器的前4个字节']) {
      const response = await query.response(term);
      assert.equal(response.match, undefined, 'A literal passage is not an approximate match');
      const first = response.items[0]?.[0];
      assert.equal(first?.location, note.location, `${term} must put the actual passage before partial heading matches`);
      assert.ok(first.score > 0);
      assert.equal(first.matchKind, 'exact');
      assert.equal(response.matchCounts.exact, 1);
      assert.ok(response.matchCounts.fuzzy > 0, 'Keep related matches after the exact passage');
      assert.ok(plain(first.text).includes(phrase), 'Preview must include the original passage');
      assert.ok(marked(first.text).some(word => word.includes(phrase)), 'Exact preview must highlight the continuous passage, not scattered words');
      assert.ok(marked(first.text).some(word => /gcm/i.test(word)));
      assert.ok(marked(first.text).some(word => /ctr/i.test(word)));
      assert.equal(first.terms[term], true, 'Navigation highlight must include the original passage');
      assert.ok(Object.values(first.terms).every(Boolean), 'Literal results must not claim missing query terms');
    }
  });

  await t.test('copied passage with a plus sign finds and highlights the original SSH note first', async () => {
    const phrase = '对c+s随机数';
    const note = noteWithPassage(index, phrase);
    assert.ok(note.location.endsWith('#ssh'));
    for (const term of [phrase, '对C+S随机数', 'c+s', 'ssh签名内容：签名是对c+s随机数']) {
      const response = await query.response(term);
      const hits = response.items.flat().filter(item => item.score > 0);
      const first = hits[0];
      assert.equal(first?.location, note.location, `${term} must put the original SSH passage first`);
      assert.equal(first.matchKind, 'exact');
      assert.equal(response.matchCounts.exact, 1);
      assert.ok(marked(first.text).some(text => text.toLowerCase().includes(term.toLowerCase())), 'Highlight the literal plus sign with the complete passage');
      assert.equal(first.terms[term], true, 'Navigation must preserve the plus sign');
      assert.equal(hits.filter(item => item.location === note.location).length, 1, 'The exact section must not repeat among fuzzy matches');
      assert.equal(hits.length, new Set(hits.map(item => item.location)).size);
    }
  });

  await t.test('literal search treats query operators as source punctuation', async () => {
    const phrases = ['c+s', 'a*b', 'a~1', 'x^2', 'name:value', String.raw`dir\file`, '-word', '"quoted"'];
    const literalQuery = await loadWorker(config, {
      config: index.config,
      docs: phrases.map((phrase, i) => ({ location: `symbol-${i}.html`, title: 'Punctuation', text: `<p>${phrase}</p>` })),
    });
    for (const [i, phrase] of phrases.entries()) {
      const response = await literalQuery.response(phrase);
      const hits = response.items.flat().filter(item => item.score > 0);
      assert.equal(hits[0]?.location, `symbol-${i}.html`, `${phrase} must retrieve its literal occurrence`);
      assert.equal(hits[0].matchKind, 'exact');
      assert.deepEqual(Array.from(marked(hits[0].text)), [phrase]);
      assert.equal(response.matchCounts.exact, 1);
    }
  });

  await t.test('exact scan retrieves a Chinese substring absent from token lookup', async () => {
    const literalQuery = await loadWorker(config, {
      config: index.config,
      docs: [{ location: 'literal.html', title: 'Unsegmented passage', text: '<p>前缀超级计数器后缀</p>' }],
    });
    const response = await literalQuery.response('计数器');
    assert.equal(response.items[0][0].location, 'literal.html');
    assert.equal(response.items[0][0].matchKind, 'exact');
    assert.deepEqual(Array.from(marked(response.items[0][0].text)), ['计数器']);
    assert.equal(response.matchCounts.exact, 1);
    assert.equal(response.matchCounts.fuzzy, 0);
  });

  // The Python hook tests verify extraction; these fixtures exercise ranking
  // against the real worker and real token metadata, with deliberately high
  // boosts on low-priority content to expose accidental BM25-first ordering.
  const rankedDoc = (location, title, blocks, extra = {}) => ({
    location, title,
    text: blocks.map(block => block.kind === 'table'
      ? `<table><tbody><tr><td>${block.text}</td></tr></tbody></table>` : `<p>${block.text}</p>`).join(''),
    searchMeta: { headingLevel: location.includes('#') ? 2 : 1, appendix: false, blocks, ...extra },
    boost: extra.boost || 1,
  });

  await t.test('fuzzy rank uses content type then distinct terms in the best paragraph', async () => {
    const body = text => ({ kind: 'body', text });
    const rankingQuery = await loadWorker(config, { config: index.config, docs: [
      rankedDoc('article.html', 'alpha topic', []),
      rankedDoc('heading.html', 'Overview', []),
      rankedDoc('heading.html#child', 'alpha topic beta topic gamma', [], { headingLevel: 3 }),
      rankedDoc('three.html', 'Notes', [body('alpha'), body('beta'), body('gamma'), body('alpha together beta together gamma')]),
      rankedDoc('two.html', 'Notes', [body('alpha together beta')]),
      rankedDoc('repeat.html', 'Notes', [body('alpha '.repeat(60))], { boost: 1000 }),
      rankedDoc('split.html', 'Notes', [body('alpha'), body('beta'), body('gamma')], { boost: 1000 }),
      rankedDoc('mixed.html', 'Notes', [body('alpha'), { kind: 'table', text: 'beta gamma' }], { boost: 1000 }),
      rankedDoc('table.html', 'Notes', [{ kind: 'table', text: 'alpha topic beta topic gamma' }], { boost: 1000 }),
      rankedDoc('formula.html', 'Notes', [{ kind: 'formula', text: 'alpha topic beta topic gamma' }], { boost: 1000 }),
      rankedDoc('appendix.html', 'Overview', []),
      rankedDoc('appendix.html#child', 'alpha topic beta topic gamma', [body('alpha topic beta topic gamma')], { appendix: true, boost: 1000 }),
    ] });
    for (const term of ['alpha beta gamma', 'alpha alpha beta gamma']) {
      const response = await rankingQuery.response(term);
      const hits = response.items.flat().filter(item => item.score > 0);
      assert.equal(response.matchCounts.exact, 0);
      assert.deepEqual(Array.from(hits.slice(0, 4), item => item.location),
        ['article.html', 'heading.html#child', 'three.html', 'two.html']);
      assert.deepEqual(Array.from(hits.slice(4, 7), item => item.matchRank.coverage), [1, 1, 1], 'Do not add repetitions, other paragraphs or table terms to body coverage');
      assert.ok(hits.slice(7).every(item => item.matchRank.tier === 3), 'Tables, formulas and appendix headings all follow body hits');
      assert.equal(hits.find(item => item.location === 'three.html').matchRank.coverage, 3);
      const snippet = hits.find(item => item.location === 'three.html').text;
      assert.ok(plain(snippet).includes('alpha together beta together gamma'), 'Preview the strongest paragraph even when it occurs after the first two hits');
      assert.deepEqual(new Set(marked(snippet)), new Set(['alpha', 'beta', 'gamma']));
    }
  });

  await t.test('prefix variants do not inflate fuzzy query-term coverage', async () => {
    const rankingQuery = await loadWorker(config, { config: index.config, docs: [
      rankedDoc('variants.html', 'Notes', [{ kind: 'body', text: 'alpha alphabet alphabetic' }], { boost: 1000 }),
      rankedDoc('both.html', 'Notes', [{ kind: 'body', text: 'alphabet betamax' }]),
    ] });
    const hits = (await rankingQuery('alpha beta')).filter(item => item.score > 0);
    assert.deepEqual(Array.from(hits, item => [item.location, item.matchRank.coverage]),
      [['both.html', 2], ['variants.html', 1]]);
  });

  await t.test('page grouping must not move a low-ranked sibling before another page body hit', async () => {
    const rankingQuery = await loadWorker(config, { config: index.config, docs: [
      rankedDoc('shared.html', 'Overview', []),
      rankedDoc('shared.html#heading', 'alpha topic', []),
      rankedDoc('shared.html#table', 'Values', [{ kind: 'table', text: 'alpha example beta' }]),
      rankedDoc('other.html', 'Notes', [{ kind: 'body', text: 'alpha example beta' }]),
    ] });
    const hits = (await rankingQuery('alpha beta')).filter(item => item.score > 0);
    assert.deepEqual(Array.from(hits, item => item.location),
      ['shared.html#heading', 'other.html', 'shared.html#table']);
  });

  await t.test('cap fuzzy sections after deduplication while keeping all exact hits and total counts', async () => {
    const limitQuery = await loadWorker(config, { config: index.config, docs: [
      rankedDoc('many.html', 'Overview', []),
      ...Array.from({ length: 25 }, (_, i) => rankedDoc(`exact-${i}.html`, 'Original', [{ kind: 'body', text: 'alpha beta' }])),
      ...Array.from({ length: 25 }, (_, i) => rankedDoc(`many.html#hit-${i}`, 'Related', [{ kind: 'body', text: 'alpha other beta' }])),
    ] });
    const response = await limitQuery.response('alpha beta');
    const hits = response.items.flat().filter(item => item.score > 0);
    assert.equal(response.matchCounts.exact, 25);
    assert.equal(response.matchCounts.fuzzy, 25);
    assert.equal(response.fuzzyShown, 20);
    assert.equal(hits.length, 45, 'Count scored sections, not article context headers');
    assert.equal(new Set(hits.map(item => item.location)).size, 45);
    assert.ok(hits.slice(0, 25).every(item => item.matchKind === 'exact'));
    assert.ok(hits.slice(25).every(item => item.matchKind === 'fuzzy'));
    const empty = await limitQuery.response('zzznomatch');
    assert.equal(empty.matchCounts.fuzzy, 0);
    assert.equal(empty.fuzzyShown, 0);
    for (const total of [20, 21]) {
      const boundaryQuery = await loadWorker(config, { config: index.config,
        docs: Array.from({ length: total }, (_, i) => rankedDoc(`boundary-${i}.html`, 'Related', [{ kind: 'body', text: 'alpha other beta' }])),
      });
      const boundary = await boundaryQuery.response('alpha beta');
      assert.equal(boundary.matchCounts.fuzzy, total);
      assert.equal(boundary.fuzzyShown, 20);
      assert.equal(boundary.items.flat().filter(item => item.score > 0).length, 20);
    }
  });

  await t.test('exact, prefix and spelling matches form a deduplicated exact-first union', async () => {
    const unionQuery = await loadWorker(config, {
      config: index.config,
      docs: [
        { location: 'shared.html', title: 'Overview', text: '' },
        { location: 'shared.html#exact', title: 'Original', text: '<p>Cryptographic</p>' },
        { location: 'shared.html#typo', title: 'Misspelled', text: '<p>Cryptograhpic</p>' },
        { location: 'both.html', title: 'Both spellings', text: '<p>Cryptographic Cryptograhpic</p>' },
        { location: 'prefix.html', title: 'Longer word', text: '<p>Cryptographical</p>' },
      ],
    });
    const response = await unionQuery.response('cryptographic');
    const hits = response.items.flat().filter(item => item.score > 0);
    assert.equal(response.matchCounts.exact, 2);
    assert.equal(response.matchCounts.fuzzy, 2);
    assert.equal(hits.length, new Set(hits.map(item => item.location)).size, 'Deduplicate by document and section anchor across all search phases');
    assert.deepEqual(Array.from(hits, item => item.matchKind), ['exact', 'exact', 'fuzzy', 'fuzzy']);
    assert.equal(hits.find(item => item.location === 'both.html').matchKind, 'exact');
    assert.equal(hits.find(item => item.location === 'shared.html#typo').terms.cryptograhpic, true);
    assert.ok(hits.find(item => item.location === 'prefix.html'));
  });

  await t.test('all aliases supplement an existing exact match without duplicates', async () => {
    const unionQuery = await loadWorker(config, {
      config: index.config,
      docs: [
        { location: 'mac.html', title: 'Original', text: '<p>MAC</p>' },
        { location: 'auth.html', title: 'First alias', text: '<p>消息\u200b认证码</p>' },
        { location: 'verify.html', title: 'Second alias', text: '<p>消息\u200b鉴别码</p>' },
      ],
    });
    const response = await unionQuery.response('MAC');
    const hits = response.items.flat().filter(item => item.score > 0);
    assert.equal(response.matchCounts.exact, 1);
    assert.equal(response.matchCounts.fuzzy, 2);
    assert.equal(hits[0].location, 'mac.html');
    assert.deepEqual(new Set(hits.map(item => item.location)), new Set(['mac.html', 'auth.html', 'verify.html']));
  });

  await t.test('literal highlighting preserves escaped text, inline tags and English word boundaries', async () => {
    const literalQuery = await loadWorker(config, {
      config: index.config,
      docs: [
        { location: 'inline.html', title: 'Comparison', text: '<p>a &lt; <code>b</code></p><p>some thing</p>' },
        { location: 'joined.html', title: 'Other words', text: '<p>something</p>' },
      ],
    });
    const response = await literalQuery.response('a < b');
    assert.equal(response.items[0][0].matchKind, 'exact');
    assert.equal(response.items[0][0].text, '<p><mark>a &lt; </mark><code><mark>b</mark></code></p>');
    const words = await literalQuery.response('some thing');
    assert.deepEqual(Array.from(words.items.flat().filter(item => item.matchKind === 'exact'), item => item.location), ['inline.html']);
  });

  await t.test('literal passage priority respects paragraph and cell boundaries', async () => {
    const phrase = 'gcm模式下ctr计数器';
    const mixedQuery = await loadWorker(config, {
      config: index.config,
      docs: [
        { location: 'heading.html', title: 'GCM CTR 模式 计数器', text: '<p>gcm\u200b模式\u200b下</p><p>ctr\u200b计数器</p>' },
        { location: 'cells.html', title: 'Other reference', text: '<table><tbody><tr><td>gcm\u200b模式\u200b下</td><td>ctr\u200b计数器</td></tr></tbody></table>' },
        { location: 'passage.html', title: 'Notes', text: '<p>后续gcm\u200b模式\u200b下<code>ctr</code>\u200b计数器\u200b的前4\u200b个字节</p>' },
      ],
    });
    for (const term of [phrase, 'GCM 模式下 CTR 计数器']) {
      const response = await mixedQuery.response(term);
      assert.equal(response.match, undefined);
      assert.equal(response.items[0][0].location, 'passage.html');
      const exact = response.items.flat().filter(item => item.terms[term] === true);
      assert.deepEqual(Array.from(exact, item => item.location), ['passage.html'], 'Separate blocks must not receive literal passage priority');
      assert.match(response.items[0][0].text, /<code><mark>ctr<\/mark><\/code>/i, 'Inline code formatting must survive');
    }
  });

  await t.test('Chinese phrase finds and highlights the correct section', async () => {
    const result = standardResult(await query('分组密码算法标识'), '621', '分组密码算法标识');
    assert.equal(plain(result.title).replace(/\s/g, ''), '6.2.1分组密码算法标识');
    assert.ok(marked(result.title).some((text) => /分组|密码|算法|标识/.test(text)));
  });

  await t.test('dotted OID finds the object identifier section', async () => {
    const term = '1.2.156.10197.1.104.1';
    const result = standardResult(await query(term), '8', term);
    const cells = tableRow(result.text, ['类别', 'OID', '定义'], ['', term, 'SM4_ECB']);
    assert.ok(nodeMarks(cells[1]).includes(term), 'Highlight must cover the full OID in the SM4 ECB row');
  });

  await t.test('plain English typo automatically finds and highlights the original table content', async () => {
    const term = 'cryptograhpic';
    const response = await query.response(term);
    assert.equal(response.match?.mode, 'fuzzy');
    assert.equal(response.match.query, term);
    const result = standardResult(response.items.flat(), '641', term);
    const cells = tableRow(result.text, ['标签', '标识符', '定义'], ['SGD_PROTOCOL_CSP', '0x00000001', /Cryptographic Service Provider/]);
    assert.ok(nodeMarks(cells[2]).some((word) => /Cryptographic/i.test(word)), 'Corrected word must be highlighted in its original table cell');
    assert.ok(Object.entries(result.terms).some(([word, matched]) => /^cryptograph/i.test(word) && matched), 'Navigation highlight terms must use the matched word');
    assert.ok(!Object.keys(result.terms).some((word) => /cryptograhp/i.test(word)), 'Misspelling must not be used as a navigation highlight term');
  });

  await t.test('existing English, identifier and algorithm results need no fallback marker', async () => {
    for (const term of ['Cryptographic', '401', 'SM2', 'SM3', 'SM4', 'GMT0006', '1.2.156.10197.1.104.1']) {
      const response = await query.response(term);
      assert.ok(response.items.length > 0, `${term} should have an existing match`);
      assert.equal(response.match, undefined, `${term} must preserve normal search behavior`);
    }
  });

  await t.test('whole-query Chinese aliases find MAC and retain exact-query precedence', async () => {
    const aliasQuery = await loadWorker(config, {
      config: index.config,
      docs: [{ location: 'mac.html', title: 'Integrity notes', text: '<p>MAC</p>' }],
    });
    const response = await aliasQuery.response('消息认证码');
    assert.equal(response.match?.mode, 'alias');
    assert.equal(response.match.query, '消息认证码');
    const results = response.items.flat();
    assert.deepEqual(Array.from(results, (item) => item.location), ['mac.html']);
    assert.ok(marked(results[0].text).includes('MAC'));
    assert.equal(results[0].terms.mac, true, 'Alias navigation highlight must use the actual MAC term');
    const exact = await aliasQuery.response('MAC');
    assert.equal(exact.match, undefined, 'An existing MAC match must take precedence over aliases');
    assert.deepEqual(Array.from(exact.items.flat(), (item) => item.location), ['mac.html']);
    const unrelated = await aliasQuery.response('消息认证码无关后缀');
    assert.equal(unrelated.items.length, 0, 'Alias expansion must require the whole query');
    assert.equal(unrelated.match, undefined);
  });

  await t.test('Chinese alias fragments in separate documents or blocks do not form a match', async () => {
    const aliasQuery = await loadWorker(config, {
      config: index.config,
      docs: [
        { location: 'message.html', title: 'First fragment', text: '<p>消息</p>' },
        { location: 'code.html', title: 'Second fragment', text: '<p>鉴别码</p>' },
        { location: 'blocks.html', title: 'Separate blocks', text: '<p>消息</p><p>鉴别码</p>' },
      ],
    });
    const response = await aliasQuery.response('MAC');
    assert.equal(response.items.length, 0, 'An alias must occur as a complete term within one text block');
    assert.equal(response.match, undefined, 'Partial Chinese matches must not claim alias success');
  });

  await t.test('Chinese MAC alias does not match HMAC or a longer ASCII word', async () => {
    for (const term of ['HMAC', 'MACRO']) {
      const aliasQuery = await loadWorker(config, {
        config: index.config,
        docs: [{ location: 'word.html', title: 'Related word', text: `<p>${term}</p>` }],
      });
      const response = await aliasQuery.response('消息认证码');
      assert.equal(response.items.length, 0, `${term} must not be treated as the standalone MAC alias`);
      assert.equal(response.match, undefined);
    }
  });

  await t.test('complete Chinese alias keeps the matching section and its unscored parent', async () => {
    const aliasQuery = await loadWorker(config, {
      config: index.config,
      docs: [
        { location: 'notes.html', title: 'Overview', text: '<p>消息</p>' },
        { location: 'notes.html#integrity', title: 'Integrity', text: '<p>消息\u200b鉴别码</p>' },
      ],
    });
    const response = await aliasQuery.response('MAC');
    assert.equal(response.match?.mode, 'alias');
    assert.equal(response.match.query, 'MAC');
    assert.equal(response.items.length, 1);
    const results = response.items[0];
    assert.equal(results.length, 2, 'Keep the matching section with one parent entry');
    const section = results.find((item) => item.location === 'notes.html#integrity');
    assert.ok(section && section.score > 0, 'The complete alias must match the section');
    assert.equal(plain(section.text), '消息鉴别码');
    assert.ok(marked(section.text).some((word) => /消息|鉴别码/.test(word)), 'Highlight the actual matching section');
    const parent = results.find((item) => item.location === 'notes.html');
    assert.ok(parent, 'Retain the parent for grouped result navigation');
    assert.equal(parent.score, 0, 'The parent containing only a fragment is not an alias match');
    assert.equal(Object.keys(parent.terms).length, 0);
    assert.equal(marked(parent.text).length, 0);
  });

  for (const term of ['', 'zzzznoresult987654321zzzz']) {
    await t.test(`${JSON.stringify(term)} returns no matches`, async () => {
      assert.equal((await query(term)).length, 0);
    });
  }

  await t.test('normalization preserves internal zeros and algorithm names', async () => {
    const boundaryQuery = await loadWorker(config, {
      config: index.config,
      docs: [
        { location: 'padded.html', title: 'Padded identifier', text: '<p>0x00000401</p>' },
        { location: 'internal.html', title: 'Internal zero', text: '<p>0x00004001</p>' },
        { location: 'algorithm.html', title: 'Algorithm name', text: '<p>SM4</p>' },
        { location: 'zero.html', title: 'Zero identifier', text: '<p>0x00000000</p>' },
      ],
    });
    for (const term of ['401', '0x401', '0x00000401']) {
      const matches = await boundaryQuery(term);
      assert.deepEqual(Array.from(matches, (item) => item.location), ['padded.html'], `${term} must not swallow an internal zero`);
      assert.ok(marked(matches[0].text).some((text) => text.includes('401')));
    }
    for (const term of ['4001', '0x4001']) {
      const matches = await boundaryQuery(term);
      assert.deepEqual(Array.from(matches, (item) => item.location), ['internal.html']);
      assert.match(plain(matches[0].text), /0x00004001/);
    }
    assert.equal((await boundaryQuery('41')).length, 0, 'Internal zeros must remain significant');
    assert.ok(!(await boundaryQuery('4')).some((item) => item.location === 'algorithm.html'), 'SM4 must remain a single algorithm token');
    assert.deepEqual(Array.from(await boundaryQuery('SM4'), (item) => item.location), ['algorithm.html']);
    assert.deepEqual(Array.from(await boundaryQuery('0x0'), (item) => item.location), ['zero.html']);
  });

  await t.test('standard prefixes split only at whole GMT/GBT boundaries', async () => {
    const boundaryQuery = await loadWorker(config, {
      config: index.config,
      docs: [
        { location: 'gmt.html', title: 'Industry standard', text: '<p>GMT0006</p>' },
        { location: 'gbt.html', title: 'National standard', text: '<p>GBT38629</p>' },
        { location: 'embedded.html', title: 'Embedded prefix', text: '<p>XGMT0006 XGBT38629</p>' },
      ],
    });
    for (const [term, location] of [['0006', 'gmt.html'], ['38629', 'gbt.html'], ['"gmt0006"', 'gmt.html'], ['"gbt38629"', 'gbt.html']]) {
      const results = await boundaryQuery(term);
      assert.deepEqual(Array.from(results, (item) => item.location), [location]);
      assert.ok(marked(results[0].text).length > 0);
    }
    assert.equal((await boundaryQuery('6')).length, 0, 'Non-hex standard numbers must retain leading zeros');
  });

  await t.test('automatic typo correction is limited to one edit and does not alter technical values', async () => {
    const boundaryQuery = await loadWorker(config, {
      config: index.config,
      docs: [
        { location: 'word.html', title: 'Library notes', text: '<p>Cryptographic</p>' },
        { location: 'technical.html', title: 'Technical references', text: '<p>SGD_SM4_ECB 0x00000401 SM2 SM3 SM4 MAC HMAC 12345678 GMT0006 1.2.156.10197.1.104.1</p>' },
      ],
    });
    for (const term of ['crxptogrxphic', '403', '0x00000403', '12345679', 'SM5', 'MAB', 'HMAA', 'GNT0006', '"GMT0007"', '1.2.156.10197.1.104.9', 'cryptograhpic 99999999', 'cryptograhpic SM5', '"cryptograhpic"', 'cryptograhpic~0', 'zzzznomatch']) {
      const response = await boundaryQuery.response(term);
      assert.equal(response.items.length, 0, `${term} must not be silently changed to another technical value or a distant spelling`);
      assert.equal(response.match, undefined, 'Failed fallback must not claim a match');
    }
    const corrected = await boundaryQuery.response('cryptograhpic');
    assert.equal(corrected.match?.mode, 'fuzzy');
    assert.deepEqual(Array.from(corrected.items.flat(), (item) => item.location), ['word.html']);
  });

  await t.test('rapid consecutive requests keep results and fallback metadata independent', async () => {
    const boundaryQuery = await loadWorker(config, {
      config: index.config,
      docs: [
        { location: 'crypto.html', title: 'Cryptographic', text: '<p>Cryptographic</p>' },
        { location: 'signature.html', title: 'Signature', text: '<p>Signature</p>' },
      ],
    });
    const inputs = ['cryptograhpic', 'signature', 'zzzznomatch', 'cryptographic', 'SM5'];
    const responses = await Promise.all(inputs.map((term) => boundaryQuery.response(term)));
    const expected = [['crypto.html'], ['signature.html'], [], ['crypto.html'], []];
    responses.forEach((response, i) => {
      assert.deepEqual(Array.from(response.items.flat(), (item) => item.location), expected[i], `Response must belong to ${inputs[i]}`);
      if (i === 0) {
        assert.equal(response.match?.mode, 'fuzzy');
        assert.equal(response.match.query, inputs[i]);
      } else assert.equal(response.match, undefined, `${inputs[i]} must not inherit fallback metadata`);
    });
  });

  if (offline) {
    await t.test('offline iframe awaits async language imports and queues searches during setup', async () => {
      const iframeQuery = await loadWorker(config, index, {
        iframe: true,
        queuedQueries: ['cryptograhpic', '401', 'zzzznomatch', 'SM4'],
      });
      const [fuzzy, identifier, empty, algorithm] = iframeQuery.initialResponses;
      assert.equal(fuzzy.match?.mode, 'fuzzy');
      assert.equal(fuzzy.match.query, 'cryptograhpic');
      const corrected = standardResult(fuzzy.items.flat(), '641', 'cryptograhpic');
      const correctedCells = tableRow(corrected.text, ['标签', '标识符', '定义'], ['SGD_PROTOCOL_CSP', '0x00000001', /Cryptographic Service Provider/]);
      assert.ok(nodeMarks(correctedCells[2]).some((word) => /Cryptographic/i.test(word)));
      assert.equal(identifier.match, undefined);
      const result = standardResult(identifier.items.flat(), '621', '401');
      const cells = tableRow(result.text, ['标签', '标识符', '定义'], ['SGD_SM4_ECB', '0x00000401', /SM4算法ECB加密模式.*128比特/]);
      assert.ok(nodeMarks(cells[1]).some((word) => word.includes('401')));
      assert.equal(empty.items.length, 0);
      assert.equal(empty.match, undefined);
      assert.equal(algorithm.match, undefined);
      standardResult(algorithm.items.flat(), '621', 'SM4');
      const exact = await iframeQuery.response('Cryptographic');
      assert.equal(exact.match, undefined, 'Later exact queries must not inherit fallback metadata');
      standardResult(exact.items.flat(), '641', 'Cryptographic');
    });

    await t.test('offline index matches JSON and scripts are local', () => {
      const context = vm.createContext({});
      const file = localFile(site, 'search/search_index.js');
      vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file, timeout: 10000 });
      assert.deepEqual(JSON.parse(JSON.stringify(context.__index)), index);
      const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]);
      assert.ok(scripts.some((src) => src.includes('iframe-worker/shim.js')), 'Offline worker shim must be included');
      for (const src of scripts) localFile(site, src);
    });
  }
});
