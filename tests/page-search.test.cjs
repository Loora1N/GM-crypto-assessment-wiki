// Literal matching and source offsets used to highlight actual article text.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { normalize, findMatches } = require('../docs/assets/javascripts/page-search.js');

function found(text, query) {
  return findMatches([{ text }], query).map(match => text.slice(match.start, match.end));
}

test('Chinese keywords return every occurrence in article order', () => {
  assert.deepEqual(found('密码算法、密码技术和密码算法。', '密码算法'), ['密码算法', '密码算法']);
});

test('English and full-width identifiers match without changing original spelling', () => {
  assert.deepEqual(found('SM4、sm4、ＳＭ４、SM3', 'sm4'), ['SM4', 'sm4', 'ＳＭ４']);
  assert.deepEqual(found('GB/T 39786—2021', 'ｇｂ／ｔ'), ['GB/T']);
});

test('regular-expression and HTML characters are searched literally', () => {
  assert.deepEqual(found('a+b [0] .* <img> aab', 'a+b'), ['a+b']);
  assert.deepEqual(found('a+b [0] .* <img> aab', '.*'), ['.*']);
  assert.deepEqual(found('a+b [0] .* <img> aab', '<img>'), ['<img>']);
});

test('layout whitespace and invisible separators preserve original offsets', () => {
  const text = '前文 SM4\n  ECB  后文 密\u200b码';
  assert.deepEqual(found(text, ' sm4 ecb '), ['SM4\n  ECB']);
  assert.deepEqual(found(text, '密码'), ['密\u200b码']);
  assert.deepEqual(found('SM4\t\nECB', 'SM4\u3000ECB'), ['SM4\t\nECB']);
});

test('paragraphs and table cells cannot form a false phrase across boundaries', () => {
  const blocks = [{ text: '密码' }, { text: '算法' }, { text: '密码算法' }];
  assert.deepEqual(findMatches(blocks, '密码算法'), [{ blockIndex: 2, start: 0, end: 4 }]);
});

test('UTF-16 offsets handle emoji and case expansion', () => {
  assert.deepEqual(found('🔒前🔑后🔒', '🔒'), ['🔒', '🔒']);
  assert.deepEqual(found('前İ后', 'i\u0307'), ['İ']);
  assert.deepEqual(found('ﬃ ﬃ', 'f'), ['ﬃ', 'ﬃ']);
  const result = normalize('🔒ＳＭ４');
  assert.equal(result.value, '🔒sm4');
  assert.equal(result.starts.length, result.value.length);
  assert.equal(result.ends.length, result.value.length);
});

test('blank, absent and repeated queries produce safe non-overlapping matches', () => {
  for (const query of ['', '  \n', '\u200b', '不存在']) assert.deepEqual(found('密码算法', query), []);
  assert.deepEqual(found('aaaaa', 'aa'), ['aa', 'aa']);
});

test('a long standards table retains all matches and their source locations', () => {
  const blocks = Array.from({ length: 4000 }, (_, i) => ({ text: `第 ${i} 行：SGD_SM4_ECB = 0x00000401` }));
  const matches = findMatches(blocks, '0x00000401');
  assert.equal(matches.length, blocks.length);
  assert.equal(matches[3999].blockIndex, 3999);
  matches.forEach(match => assert.equal(blocks[match.blockIndex].text.slice(match.start, match.end), '0x00000401'));
});
