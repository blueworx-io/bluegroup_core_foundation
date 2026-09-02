import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTokens, parseClasses, parseComponents, parseIcons, vocabulary } from './design-system.mjs';

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

test('parseTokens and parseClasses: ignore content inside CSS comments', () => {
  const cssWithComments = [
    '.bw-btn{ color: blue; }',
    '/* old: --bw-legacy-token and .bw-legacy-class */',
    '--bw-real: #fff;',
  ].join('\n');
  const tokens = parseTokens(cssWithComments);
  const classes = parseClasses(cssWithComments);
  assert.equal(tokens.has('--bw-real'), true);
  assert.equal(tokens.has('--bw-legacy-token'), false);
  assert.equal(classes.has('bw-btn'), true);
  assert.equal(classes.has('bw-legacy-class'), false);
});

test('vocabulary: a bw- class named only in the markup lands in classes', () => {
  const v = vocabulary({ css: CSS, manifest: null, markup: '<div class="wrap bw-wrap">' });
  assert.equal(v.classes.has('bw-wrap'), true);
});

test('vocabulary: a markup class that is not bw--prefixed is not absorbed', () => {
  const v = vocabulary({ css: CSS, manifest: null, markup: '<div class="wrap other-class">' });
  assert.equal(v.classes.has('other-class'), false);
});

test('vocabulary: a templated markup class is not absorbed', () => {
  const v = vocabulary({ css: CSS, manifest: null, markup: '<div class="bw-${variant}">' });
  assert.equal(v.classes.has('bw-${variant}'), false);
  assert.equal([...v.classes].some((c) => c.startsWith('bw-$')), false);
});

test('vocabulary: no markup argument behaves exactly as before', () => {
  const v = vocabulary({ css: CSS, manifest: { components: [{ name: 'Button' }] } });
  assert.equal(v.tokens.has('--bw-brand'), true);
  assert.equal(v.classes.has('bw-btn'), true);
  assert.equal(v.components.has('Button'), true);
});

// An icon name the system does not ship renders as an empty box and says so
// only in the browser console. Three of them shipped to a live plugin before
// this existed, so the names are read out of the same file the browser uses.
const ICONS_JS = [
  'export const lucideIcons = {',
  '  "archive": \'<path d="M4 4v16"/>\',',
  '  "trash-2": \'<path d="M10 11v6"/>\',',
  '};',
  'const lucideAliases = {',
  '  "trash": "trash-2", "update": "refresh-cw"',
  '};',
].join('\n');

test('parseIcons reads the icon map and the dashicon aliases beside it', () => {
  const icons = parseIcons(ICONS_JS);

  assert.equal(icons.has('archive'), true);
  assert.equal(icons.has('trash-2'), true);
  // An alias is a name a plugin may legitimately write, so it counts as known.
  assert.equal(icons.has('trash'), true);
  assert.equal(icons.has('library'), false);
});

test('vocabulary carries the icons alongside the classes and tokens', () => {
  const v = vocabulary({ css: CSS, manifest: { components: [] }, icons: ICONS_JS });

  assert.equal(v.icons.has('archive'), true);
  assert.equal(v.icons.has('library'), false);
});

test('a screen with no icon file to read against reports no icons at all', () => {
  const v = vocabulary({ css: CSS, manifest: { components: [] } });

  assert.equal(v.icons.size, 0, 'an empty set is what findViolations treats as "cannot check"');
});
