import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTokens, parseClasses, parseComponents, vocabulary } from './design-system.mjs';

const CSS = [
  ':root{',
  '  --bw-brand: #4F46E5;',
  '  --bw-space-3: 12px;',
  '}',
  '.bw-btn{ background: var(--bw-brand); }',
  '.bw-btn--primary{ color: #fff; }',
  '.bw-card .bw-card__head{ border-bottom: 1px solid var(--bw-border); }',
].join('\n');

test('parseTokens: finds every custom property, ignores var() uses', () => {
  const tokens = parseTokens(CSS);
  assert.equal(tokens.has('--bw-brand'), true);
  assert.equal(tokens.has('--bw-space-3'), true);
  assert.equal(tokens.has('--bw-border'), false);
});

test('parseClasses: finds classes including modifiers and nested selectors', () => {
  const classes = parseClasses(CSS);
  assert.equal(classes.has('bw-btn'), true);
  assert.equal(classes.has('bw-btn--primary'), true);
  assert.equal(classes.has('bw-card__head'), true);
});

test('parseClasses: does not mistake decimals for classes', () => {
  assert.equal(parseClasses('.bw-x{ opacity: .05; transition: .2s ease; }').has('05'), false);
});

test('parseComponents: reads names from the manifest, tolerates a missing one', () => {
  const names = parseComponents({ components: [{ name: 'Button' }, { name: 'Notice' }] });
  assert.equal(names.has('Button'), true);
  assert.equal(names.has('Notice'), true);
  assert.equal(parseComponents(null).size, 0);
});

test('vocabulary: bundles all three', () => {
  const v = vocabulary({ css: CSS, manifest: { components: [{ name: 'Button' }] } });
  assert.equal(v.tokens.has('--bw-brand'), true);
  assert.equal(v.classes.has('bw-btn'), true);
  assert.equal(v.components.has('Button'), true);
});
