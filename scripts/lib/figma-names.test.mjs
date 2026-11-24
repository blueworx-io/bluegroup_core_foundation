import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { themeNames, figmaNames, figmaKey, fetchFigmaVariables, compareNames } from './figma-names.mjs';

const THEME_CSS = `
:root {
  --color-primary: #0a4ea3;
  --color-surface: #f4f6fa;
  --font-heading: "Inter", sans-serif;
  --text-lead: 1.25rem;
  --space-4: 1rem;
  --radius-md: 8px;
  --wp--preset--color--black: #000;
  --not-a-group: 1;
}
.card { --card-bg: var(--color-surface); color: var(--color-primary); }
`;
const theme = themeNames([{ path: 'style.css', content: THEME_CSS }]);

test('themeNames: reads the colour, font, size, space and corner names a theme defines', () => {
  assert.deepEqual(theme, ['--color-primary', '--color-surface', '--font-heading', '--radius-md', '--space-4', '--text-lead']);
});

test('themeNames: scss, comments and repeated names', () => {
  const names = themeNames([
    { path: 'a.scss', content: '// --color-old: red;\n:root { --color-brand: #000; /* --color-ghost: 1 */ }' },
    { path: 'b.css', content: ':root { --color-brand: #111 }' },
  ]);
  assert.deepEqual(names, ['--color-brand']);
});

test('figmaNames: a plain list of names, or of objects with a name', () => {
  assert.deepEqual(figmaNames(['color/primary', 'space/4']), ['color/primary', 'space/4']);
  assert.deepEqual(figmaNames([{ name: 'color/primary' }, { name: 'space/4' }]), ['color/primary', 'space/4']);
});

test('figmaNames: the Figma variables answer, leaving out other files\' and deleted variables', () => {
  const answer = {
    meta: {
      variableCollections: { c1: { name: 'Design system' }, c2: { name: 'Buttons' } },
      variables: {
        a: { name: 'color/primary', variableCollectionId: 'c1' },
        b: { name: 'space/4', variableCollectionId: 'c1' },
        c: { name: 'btn/radius', variableCollectionId: 'c2' },
        d: { name: 'library/thing', variableCollectionId: 'c1', remote: true },
        e: { name: 'color/old', variableCollectionId: 'c1', deletedButReferenced: true },
      },
    },
  };
  assert.deepEqual(figmaNames(answer), ['btn/radius', 'color/primary', 'space/4']);
  assert.deepEqual(figmaNames(answer, { collection: 'design system' }), ['color/primary', 'space/4']);
});

test('figmaNames: an exported tokens file with nested groups', () => {
  const tokens = {
    color: { primary: { $type: 'color', $value: '#0a4ea3' }, text: { muted: { $value: '#666' } } },
    space: { 4: { $value: '16px' } },
    $description: 'ignored',
  };
  assert.deepEqual(figmaNames(tokens), ['color/primary', 'color/text/muted', 'space/4']);
});

test('figmaNames: something that is not a variables file says so', () => {
  assert.throws(() => figmaNames('nope'), /variables/);
  assert.throws(() => figmaNames(42), /variables/);
});

test('compareNames: a correct file passes', () => {
  const r = compareNames({ figma: ['color/primary', 'color/surface', 'font/heading', 'text/lead', 'space/4', 'radius/md'], theme });
  assert.equal(r.ok, true);
  assert.deepEqual([r.missing, r.extra, r.misnamed], [[], [], []]);
  assert.match(r.message, /all 6/);
});

test('compareNames: nested groups that spell the same name pass', () => {
  const all = [...theme, '--color-text-muted'];
  const base = ['color/primary', 'color/surface', 'font/heading', 'text/lead', 'space/4', 'radius/md'];
  assert.equal(compareNames({ figma: [...base, 'color/text/muted'], theme: all }).ok, true);
  assert.equal(compareNames({ figma: [...base, 'color/text-muted'], theme: all }).ok, true);
  assert.deepEqual(compareNames({ figma: base, theme: all }).missing, ['color/text-muted']);
});

test('compareNames: a missing name is listed in Figma form', () => {
  const r = compareNames({ figma: ['color/primary', 'font/heading', 'text/lead', 'space/4', 'radius/md'], theme });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ['color/surface']);
  assert.match(r.message, /color\/surface/);
});

test('compareNames: a name the theme does not have is extra', () => {
  const r = compareNames({ figma: [...['color/primary', 'color/surface', 'font/heading', 'text/lead', 'space/4', 'radius/md'], 'color/hot-pink', 'shadow/soft'], theme });
  assert.equal(r.ok, false);
  assert.deepEqual(r.extra, ['color/hot-pink', 'shadow/soft']);
  assert.deepEqual(r.missing, []);
});

test('compareNames: a name that is nearly right is misnamed, with the right name', () => {
  const r = compareNames({ figma: ['Color/Primary', 'colour/surface', 'font/Heading', 'text/lead', 'spacing/4', 'radius/md'], theme });
  assert.equal(r.ok, false);
  assert.deepEqual(r.misnamed, [
    { figma: 'Color/Primary', shouldBe: 'color/primary' },
    { figma: 'colour/surface', shouldBe: 'color/surface' },
    { figma: 'font/Heading', shouldBe: 'font/heading' },
    { figma: 'spacing/4', shouldBe: 'space/4' },
  ]);
  assert.deepEqual([r.missing, r.extra], [[], []]);
});

test('compareNames: separators and camelCase count as misnamed, not as a different name', () => {
  const r = compareNames({ figma: ['color-primary', 'color/surface'], theme: ['--color-primary', '--color-surface', '--color-primary-dark'] });
  assert.deepEqual(r.misnamed, [{ figma: 'color-primary', shouldBe: 'color/primary' }]);
  assert.deepEqual(r.missing, ['color/primary-dark']);
  const camel = compareNames({ figma: ['color/primaryDark'], theme: ['--color-primary-dark'] });
  assert.deepEqual(camel.misnamed, [{ figma: 'color/primaryDark', shouldBe: 'color/primary-dark' }]);
});

test('compareNames: two misnamed copies of one name are one misnamed and one extra', () => {
  const r = compareNames({ figma: ['Color/Primary', 'color/PRIMARY'], theme: ['--color-primary'] });
  assert.equal(r.misnamed.length, 1);
  assert.equal(r.extra.length, 1);
  assert.deepEqual(r.missing, []);
});

test('compareNames: the same variable listed twice is counted once', () => {
  const r = compareNames({ figma: ['color/primary', 'color/primary'], theme: ['--color-primary'] });
  assert.equal(r.ok, true);
});

test('compareNames: nothing to compare is a failure, not a pass', () => {
  assert.equal(compareNames({ figma: [], theme }).ok, false);
  assert.match(compareNames({ figma: [], theme }).message, /no variables/i);
  assert.equal(compareNames({ figma: ['color/primary'], theme: [] }).ok, false);
  assert.match(compareNames({ figma: ['color/primary'], theme: [] }).message, /no names/i);
});

test('figmaKey: a file key or a Figma link', () => {
  assert.equal(figmaKey('AbC123xyz'), 'AbC123xyz');
  assert.equal(figmaKey('https://www.figma.com/design/AbC123xyz/Client-site?node-id=1-2'), 'AbC123xyz');
  assert.equal(figmaKey('https://www.figma.com/file/AbC123xyz/Client-site'), 'AbC123xyz');
});

test('fetchFigmaVariables: asks Figma with the token, and explains a refusal', async () => {
  let seen;
  const ok = await fetchFigmaVariables({
    key: 'K1',
    token: 'secret',
    fetchImpl: async (url, init) => {
      seen = { url, init };
      return { ok: true, status: 200, json: async () => ({ meta: { variables: {} } }) };
    },
  });
  assert.equal(seen.url, 'https://api.figma.com/v1/files/K1/variables/local');
  assert.equal(seen.init.headers['X-Figma-Token'], 'secret');
  assert.deepEqual(ok, { meta: { variables: {} } });

  await assert.rejects(
    fetchFigmaVariables({ key: 'K1', token: 'secret', fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}) }) }),
    /403.*export/s,
  );
  await assert.rejects(fetchFigmaVariables({ key: 'K1', token: '', fetchImpl: async () => ({}) }), /FIGMA_TOKEN/);
});

// The script end to end.
const script = resolve('scripts/check-figma-names.mjs');
function run(args, files, env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'figma-names-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      mkdirSync(join(dir, name, '..'), { recursive: true });
      writeFileSync(join(dir, name), content);
    }
    return spawnSync(process.execPath, [script, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, FIGMA_TOKEN: '', FIGMA_NAMES: '', ...env } });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('script: a correct file passes, a wrong one lists every mismatch', () => {
  const files = {
    'theme/style.css': THEME_CSS,
    'good.json': JSON.stringify(['color/primary', 'color/surface', 'font/heading', 'text/lead', 'space/4', 'radius/md']),
    'bad.json': JSON.stringify(['Color/Primary', 'color/surface', 'text/lead', 'space/4', 'radius/md', 'shadow/soft']),
  };
  const good = run(['--figma', 'good.json', '--theme', 'theme'], files);
  assert.equal(good.status, 0, good.stdout + good.stderr);
  const bad = run(['--figma', 'bad.json', '--theme', 'theme'], files);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /font\/heading/);
  assert.match(bad.stdout, /shadow\/soft/);
  assert.match(bad.stdout, /Color\/Primary.*color\/primary/);
});

test('script: FIGMA_NAMES=warn reports without failing, off skips', () => {
  const files = { 'theme/style.css': THEME_CSS, 'bad.json': JSON.stringify(['shadow/soft']) };
  const warn = run(['--figma', 'bad.json', '--theme', 'theme'], files, { FIGMA_NAMES: 'warn' });
  assert.equal(warn.status, 0);
  assert.match(warn.stdout, /shadow\/soft/);
  const off = run([], {}, { FIGMA_NAMES: 'off' });
  assert.equal(off.status, 0);
});

test('script: missing arguments explain how to run it', () => {
  const r = run([], {});
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--figma/);
  assert.match(r.stderr, /--theme/);
});

test('script: an unreadable Figma file is an error, not a pass', () => {
  const r = run(['--figma', 'nope.json', '--theme', 'theme'], { 'theme/style.css': THEME_CSS });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /nope\.json/);
});
