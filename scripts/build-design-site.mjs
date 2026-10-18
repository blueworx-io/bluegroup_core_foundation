#!/usr/bin/env node
// Builds the design system's browsable site into design-site/ for Vercel.
//
// The skill folder already works as a static site: every card, the component
// inventory and the two UI kits load styles.css, the fonts and _ds_bundle.js by
// relative path. So this copies the folder as it is, then adds a small docs app
// (scripts/design-site/) and one generated data file describing every
// component: its group, summary, guidance, options and where its live example is.
//
// Nothing is added to the skill folder itself. It is copied into plugins and
// mirrored to the Claude Design project, and a docs site has no place there.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { basename, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = join(root, '.claude', 'skills', 'blueworx-admin-design');
const app = join(root, 'scripts', 'design-site');
const out = join(root, 'design-site');
const repoUrl = 'https://github.com/blueworx-io/bluegroup_core_foundation';

// Agent and plugin files, not things a person looks at.
const skip = new Set(['editor', 'design-system.php', 'SKILL.md', 'github.md', '_adherence.oxlintrc.json']);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(src, out, {
  recursive: true,
  filter: (path) => {
    const rel = relative(src, path);
    if (rel === '') return true;
    const parts = rel.split(sep);
    return !skip.has(parts[0]) && !parts.some((p) => p.startsWith('.'));
  },
});
for (const f of readdirSync(app)) cpSync(join(app, f), join(out, f));

// Windows checkouts may hand back CRLF; every pattern below expects LF.
const read = (p) => readFileSync(join(src, p), 'utf8').replace(/\r\n/g, '\n');
const posix = (p) => p.split(sep).join('/');

// Every card opens with <!-- @dsCard group="…" viewport="WxH" name="…" subtitle="…" -->.
function cards(dir) {
  const found = [];
  for (const entry of readdirSync(join(src, dir), { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
    const path = posix(relative(src, join(entry.parentPath ?? entry.path, entry.name)));
    const first = read(path).split('\n', 1)[0];
    if (!first.startsWith('<!-- @dsCard')) continue;
    const attr = (k) => (first.match(new RegExp(`${k}="([^"]*)"`)) || [])[1] || '';
    const [w, h] = (attr('viewport') || '700x300').split('x').map(Number);
    found.push({ path, group: attr('group'), name: attr('name'), subtitle: attr('subtitle'), w, h });
  }
  return found.sort((a, b) => a.path.localeCompare(b.path));
}

// The inventory page holds one live sample per component, each in an
// <Item name="…" what="…" props="…">, under a <Group id="…" name="…" what="…">.
const inventory = read('components/index.html');
const groups = [...inventory.matchAll(/<Group id="([^"]+)" name="([^"]+)" path="[^"]*" what="([^"]*)">/g)]
  .map(([, id, name, what]) => ({ id, name, what }));
const items = new Map(
  [...inventory.matchAll(/<Item name="([^"]+)" what="([^"]*)" props="([^"]*)"/g)]
    .map(([, label, what, props]) => [label.split(' / ')[0], { label, what, props }]),
);

// Exported interfaces in a .d.ts, each with its doc comment and fields.
function interfaces(dts) {
  const found = [];
  const re = /(\/\*\*([\s\S]*?)\*\/\s*)?export interface (\w+)(?:\s+extends[^{]*)?\s*\{\n([\s\S]*?)\n\}/g;
  for (const [, , doc, name, body] of dts.matchAll(re)) {
    const fields = [];
    let note = '';
    let inDoc = false;
    for (const raw of body.split('\n')) {
      const t = raw.trim();
      if (t.startsWith('/**')) {
        inDoc = !t.endsWith('*/');
        note = t.replace(/^\/\*\*/, '').replace(/\*\/$/, '').trim();
        continue;
      }
      if (inDoc) {
        if (t.endsWith('*/')) inDoc = false;
        note = `${note} ${t.replace(/^\*\/?/, '').replace(/\*\/$/, '').trim()}`.trim();
        continue;
      }
      const f = t.match(/^(\w+)(\?)?:\s*(.+?);?$/);
      if (f && raw.startsWith('  ') && !raw.startsWith('    ')) {
        fields.push({ name: f[1], required: !f[2], type: f[3], note });
        note = '';
      }
    }
    found.push({ name, doc: clean(doc), fields });
  }
  return found;
}
const clean = (doc = '') => doc.split('\n').map((l) => l.replace(/^\s*\*\s?/, '')).join(' ').replace(/\s+/g, ' ').trim();
const firstSentence = (s) => (s.match(/^.*?[.!?](\s|$)/) || [s])[0].trim();

const allCards = cards('guidelines').concat(cards('components'));
const patternFiles = new Set(['data-calendar', 'data-compare', 'settings', 'settings-functions']);
const cardKey = (c) => basename(c.path, '.card.html');
const isPattern = (c) => patternFiles.has(cardKey(c));
const planning = allCards.find((c) => cardKey(c) === 'data-planning');

const components = [];
for (const g of groups) {
  const dir = `components/${g.id}`;
  for (const file of readdirSync(join(src, dir)).filter((f) => f.endsWith('.jsx')).sort()) {
    const name = basename(file, '.jsx');
    const dts = existsSync(join(src, dir, `${name}.d.ts`)) ? read(`${dir}/${name}.d.ts`) : '';
    const guide = existsSync(join(src, dir, `${name}.prompt.md`)) ? read(`${dir}/${name}.prompt.md`) : '';
    const types = interfaces(dts);
    const main = types.find((t) => t.name === `${name}Props`);
    const item = items.get(name);
    const exports = [...dts.matchAll(/export declare function (\w+)/g)].map((m) => m[1]);
    components.push({
      id: name.toLowerCase(),
      name,
      group: g.id,
      also: exports.filter((e) => e !== name),
      summary: item?.what || firstSentence(main?.doc || guide.replace(/\s+/g, ' ')),
      guide,
      types,
      example: item
        ? { kind: 'inventory', label: item.label }
        : planning && ['Gantt', 'SummaryStrip'].includes(name)
          ? { kind: 'card', path: planning.path, h: planning.h }
          : null,
      source: `${dir}/${name}.jsx`,
    });
  }
}

const foundations = ['Colors', 'Type', 'Spacing', 'Brand'].map((g) => ({
  id: g === 'Colors' ? 'colour' : g.toLowerCase(),
  name: g === 'Colors' ? 'Colour' : g,
  cards: allCards.filter((c) => c.path.startsWith('guidelines/') && c.group === g),
}));

const patterns = allCards.filter(isPattern).map((c) => ({
  id: cardKey(c).replace(/^data-/, ''),
  name: c.name.replace(/^\w+ — /, '').replace(/^./, (m) => m.toUpperCase()),
  subtitle: c.subtitle,
  card: c,
}));

const sheets = Object.fromEntries(groups.map((g) => [
  g.id,
  allCards.filter((c) => c.path.startsWith(`components/${g.id}/`) && !isPattern(c)),
]));

const screens = [
  { id: 'plugin-admin', name: 'Plugin admin', path: 'ui_kits/plugin_admin/index.html', subtitle: 'A sample plugin inside real WordPress chrome: overview, members, settings, tools.' },
  { id: 'setup-wizard', name: 'Setup wizard', path: 'ui_kits/setup_wizard/index.html', subtitle: 'The four-step first-run screen, with progress and a sticky save bar.' },
];

function commit() {
  const ref = process.env.VERCEL_GIT_COMMIT_SHA || (() => {
    try { return execSync('git rev-parse HEAD', { cwd: root }).toString().trim(); } catch { return ''; }
  })();
  return ref.slice(0, 7);
}

const data = {
  repo: repoUrl,
  sourceBase: `${repoUrl}/blob/main/.claude/skills/blueworx-admin-design/`,
  built: new Date().toISOString().slice(0, 10),
  commit: commit(),
  groups,
  components,
  foundations,
  patterns,
  sheets,
  screens,
  guidelines: read('readme.md'),
};

// `<` escaped so nothing in the data can close the script tag it lands in.
writeFileSync(join(out, 'data.js'), `window.DS = ${JSON.stringify(data).replace(/</g, '\\u003c')};\n`);
console.log(`design-site/ built: ${components.length} components in ${groups.length} groups, ${patterns.length} patterns.`);
