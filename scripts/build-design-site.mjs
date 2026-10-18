#!/usr/bin/env node
// Builds the design system's browsable site into design-site/ for Vercel.
//
// The skill folder already works as a static site: every card, the component
// inventory and the two UI kits load styles.css, the fonts and _ds_bundle.js by
// relative path. So this copies the folder as it is and adds two pages of its
// own: a front page showing every card, and the written guidelines.
//
// Nothing is added to the skill folder itself. It is copied into plugins and
// mirrored to the Claude Design project, and a front page has no place there.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = join(root, '.claude', 'skills', 'blueworx-admin-design');
const out = join(root, 'design-site');
const repoUrl = 'https://github.com/blueworx-io/bluegroup_core_foundation';
const srcOnGitHub = `${repoUrl}/blob/main/.claude/skills/blueworx-admin-design/`;

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

// Every card opens with <!-- @dsCard group="…" viewport="WxH" name="…" subtitle="…" -->.
function cards(dir) {
  const found = [];
  for (const entry of readdirSync(join(out, dir), { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
    const path = relative(out, join(entry.parentPath ?? entry.path, entry.name)).split(sep).join('/');
    const first = readFileSync(join(out, path), 'utf8').split('\n', 1)[0];
    if (!first.startsWith('<!-- @dsCard')) continue;
    const attr = (k) => (first.match(new RegExp(`${k}="([^"]*)"`)) || [])[1] || '';
    const [w, h] = (attr('viewport') || '700x300').split('x').map(Number);
    found.push({ path, group: attr('group'), name: attr('name'), subtitle: attr('subtitle'), w, h });
  }
  return found.sort((a, b) => a.path.localeCompare(b.path));
}

const foundations = cards('guidelines');
const components = cards('components').filter((c) => c.path !== 'components/index.html');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function commit() {
  const ref = process.env.COMMIT_REF || (() => {
    try { return execSync('git rev-parse HEAD', { cwd: root }).toString().trim(); } catch { return ''; }
  })();
  return ref ? ref.slice(0, 7) : '';
}
const built = new Date().toISOString().slice(0, 10);
const sha = commit();

function card(c) {
  return `
      <figure class="ds-card" style="--w:${c.w}px">
        <figcaption class="ds-card__head">
          <div>
            <h3 class="ds-card__name">${esc(c.name)}</h3>
            <p class="ds-card__sub">${esc(c.subtitle)}</p>
          </div>
          <div class="ds-card__links">
            <a href="${esc(c.path)}">Open</a>
            <a href="${srcOnGitHub}${esc(c.path)}">Source</a>
          </div>
        </figcaption>
        <div class="ds-card__frame"><iframe src="${esc(c.path)}" title="${esc(c.name)}" loading="lazy" style="height:${c.h}px"></iframe></div>
      </figure>`;
}

const sections = [
  ...['Colors', 'Type', 'Spacing', 'Brand'].map((g) => ({
    id: g.toLowerCase(),
    title: g === 'Colors' ? 'Colour' : g,
    items: foundations.filter((c) => c.group === g),
  })),
  { id: 'components', title: 'Components', items: components },
].filter((s) => s.items.length);

const templates = existsSync(join(out, 'templates'))
  ? readdirSync(join(out, 'templates'), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .flatMap((d) => readdirSync(join(out, 'templates', d.name))
        .filter((f) => f.endsWith('.html'))
        .map((f) => ({ path: `templates/${d.name}/${f}`, name: d.name.replace(/-/g, ' ') })))
  : [];

const head = (title) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="icon" href="assets/img/logo.png">
<link rel="stylesheet" href="styles.css">
<style>
html, body { margin: 0; background: var(--bw-canvas); }
body { font-family: var(--bw-font-body); color: var(--bw-text-body); }
.ds { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 40px; max-width: 1240px; margin: 0 auto; padding: 32px max(16px, 3vw) 80px; }
.ds-nav { position: sticky; top: 24px; align-self: start; display: flex; flex-direction: column; gap: 2px; }
.ds-nav img { height: 26px; width: auto; margin: 0 0 24px 10px; align-self: flex-start; }
.ds-nav a { padding: 7px 10px; border-radius: var(--bw-radius-md, 8px); color: var(--bw-text-muted); text-decoration: none; font-size: 13px; }
.ds-nav a:hover { background: var(--bw-surface-card); color: var(--bw-text-heading); }
.ds-nav a:focus-visible, .ds a:focus-visible { outline: 2px solid var(--bw-brand); outline-offset: 1px; }
.ds-nav__label { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--bw-text-faint); margin: 18px 10px 6px; }
.ds-main { min-width: 0; display: flex; flex-direction: column; gap: 48px; }
.ds-hero h1 { font-family: var(--bw-font-display); font-size: 32px; line-height: 1.15; font-weight: 600; color: var(--bw-text-heading); margin: 0 0 10px; text-wrap: balance; }
.ds-hero p { margin: 0; max-width: 60ch; font-size: 15px; line-height: 1.55; color: var(--bw-text-muted); }
.ds-meta { display: flex; flex-wrap: wrap; gap: 28px; margin-top: 22px; font-size: 12px; color: var(--bw-text-muted); }
.ds-meta b { display: block; font-family: var(--bw-font-display); font-size: 22px; font-weight: 600; color: var(--bw-text-heading); font-variant-numeric: tabular-nums; }
.ds-start { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
.ds-start a { display: flex; flex-direction: column; gap: 4px; padding: 16px 18px; background: var(--bw-surface-card); border: 1px solid var(--bw-border); border-radius: var(--bw-radius-lg); box-shadow: var(--bw-shadow-card); text-decoration: none; transition: border-color .12s ease; }
.ds-start a:hover { border-color: var(--bw-brand-line); }
.ds-start strong { font-family: var(--bw-font-display); font-size: 15px; font-weight: 600; color: var(--bw-text-heading); }
.ds-start span { font-size: 12px; line-height: 1.5; color: var(--bw-text-muted); }
.ds-section { display: flex; flex-direction: column; gap: 16px; scroll-margin-top: 24px; }
.ds-section h2 { font-family: var(--bw-font-display); font-size: 20px; font-weight: 600; color: var(--bw-text-heading); margin: 0; padding-bottom: 12px; border-bottom: 1px solid var(--bw-border); }
.ds-card { margin: 0; max-width: max(var(--w), 100%); background: var(--bw-surface-card); border: 1px solid var(--bw-border); border-radius: var(--bw-radius-lg); box-shadow: var(--bw-shadow-card); overflow: hidden; }
.ds-card__head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 14px 18px; border-bottom: 1px solid var(--bw-border); }
.ds-card__name { font-family: var(--bw-font-display); font-size: 15px; font-weight: 600; color: var(--bw-text-heading); margin: 0 0 2px; }
.ds-card__sub { margin: 0; font-size: 12px; color: var(--bw-text-muted); }
.ds-card__links { display: flex; gap: 14px; flex-shrink: 0; font-size: 12px; }
.ds-card__links a { color: var(--bw-brand); text-decoration: none; }
.ds-card__links a:hover { text-decoration: underline; }
.ds-card__frame { overflow-x: auto; }
.ds-card__frame iframe { display: block; width: 100%; min-width: min(var(--w), 640px); border: 0; background: #fff; }
.ds-list { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }
.ds-list a { color: var(--bw-brand); text-decoration: none; font-size: 14px; text-transform: capitalize; }
.ds-foot { font-size: 12px; color: var(--bw-text-faint); }
.ds-foot a { color: inherit; }
.ds-guide { max-width: 72ch; font-size: 14px; line-height: 1.65; }
.ds-guide h1 { font-family: var(--bw-font-display); font-size: 32px; font-weight: 600; color: var(--bw-text-heading); line-height: 1.15; }
.ds-guide h2 { font-family: var(--bw-font-display); font-size: 20px; font-weight: 600; color: var(--bw-text-heading); margin-top: 40px; padding-bottom: 10px; border-bottom: 1px solid var(--bw-border); }
.ds-guide h3 { font-family: var(--bw-font-display); font-size: 16px; font-weight: 600; color: var(--bw-text-heading); }
.ds-guide code { font-family: var(--bw-font-mono); font-size: 12px; background: var(--bw-field); padding: 1px 5px; border-radius: 4px; }
.ds-guide pre { background: var(--bw-surface-card); border: 1px solid var(--bw-border); border-radius: var(--bw-radius-lg); padding: 14px 16px; overflow-x: auto; }
.ds-guide pre code { background: none; padding: 0; }
.ds-guide table { border-collapse: collapse; display: block; overflow-x: auto; font-size: 13px; }
.ds-guide th, .ds-guide td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--bw-border); vertical-align: top; }
.ds-guide a { color: var(--bw-brand); }
@media (max-width: 860px) {
  .ds { grid-template-columns: minmax(0, 1fr); gap: 24px; }
  .ds-nav { position: static; flex-direction: row; flex-wrap: wrap; }
  .ds-nav img { width: 100%; object-fit: contain; object-position: left; margin-bottom: 8px; }
  .ds-nav__label { display: none; }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>
</head>`;

const nav = (onIndex) => {
  const to = (id) => (onIndex ? `#${id}` : `index.html#${id}`);
  return `
  <nav class="ds-nav" aria-label="Sections">
    <a href="index.html" style="padding:0"><img src="assets/img/logo.png" alt="BlueWorx"></a>
    <a href="${to('start')}">Start here</a>
    <a href="guide.html">Written guidelines</a>
    <div class="ds-nav__label">Foundations</div>
    ${sections.filter((s) => s.id !== 'components').map((s) => `<a href="${to(s.id)}">${s.title}</a>`).join('\n    ')}
    <div class="ds-nav__label">Building blocks</div>
    <a href="${to('components')}">Components</a>
    <a href="${to('screens')}">Screens and templates</a>
  </nav>`;
};

const footer = `<p class="ds-foot">Built ${built}${sha ? ` from <a href="${repoUrl}/commit/${sha}">${sha}</a>` : ''}. The skill folder in <a href="${repoUrl}">bluegroup_core_foundation</a> is the source; this site and the Claude Design project are copies of it.</p>`;

const index = `${head('BlueWorx Admin Design System')}
<body class="bw-admin">
<div class="ds">
  ${nav(true)}
  <main class="ds-main">
    <header class="ds-hero">
      <h1>BlueWorx Admin Design System</h1>
      <p>How every BlueWorx plugin's admin screens look and behave: one accent, one type pairing, one control size, one panel. Everything below is the real stylesheet and components, drawn live.</p>
      <div class="ds-meta">
        <div><b>${foundations.length}</b>foundation cards</div>
        <div><b>${components.length}</b>component sheets</div>
        <div><b>2</b>click-through screens</div>
      </div>
    </header>

    <section class="ds-section" id="start">
      <h2>Start here</h2>
      <div class="ds-start">
        <a href="components/index.html"><strong>Every component</strong><span>Every component on one page, each with a working sample and its options.</span></a>
        <a href="ui_kits/plugin_admin/index.html"><strong>Plugin admin</strong><span>A sample plugin inside real WordPress chrome: overview, members, settings, tools.</span></a>
        <a href="ui_kits/setup_wizard/index.html"><strong>Setup wizard</strong><span>The four-step first-run screen, with progress and a sticky save bar.</span></a>
        <a href="guide.html"><strong>Written guidelines</strong><span>Voice, colour, type, spacing, icons and which control to use for which job.</span></a>
      </div>
    </section>
${sections.map((s) => `
    <section class="ds-section" id="${s.id}">
      <h2>${s.title}</h2>${s.items.map(card).join('')}
    </section>`).join('')}

    <section class="ds-section" id="screens">
      <h2>Screens and templates</h2>
      <ul class="ds-list">
        <li><a href="ui_kits/plugin_admin/index.html">Plugin admin click-through</a></li>
        <li><a href="ui_kits/setup_wizard/index.html">Setup wizard click-through</a></li>
        ${templates.map((t) => `<li><a href="${esc(t.path)}">${esc(t.name)} template</a></li>`).join('\n        ')}
      </ul>
    </section>

    ${footer}
  </main>
</div>
</body>
</html>
`;

const guide = `${head('Guidelines · BlueWorx Admin Design System')}
<body class="bw-admin">
<div class="ds">
  ${nav(false)}
  <main class="ds-main">
    <article class="ds-guide" id="guide"><p>Loading the guidelines…</p></article>
    ${footer}
  </main>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js"></script>
<script>
fetch('readme.md')
  .then((r) => r.text())
  .then((md) => { document.getElementById('guide').innerHTML = marked.parse(md); })
  .catch(() => { document.getElementById('guide').innerHTML = '<p>The guidelines could not be loaded. <a href="readme.md">Open them as plain text</a>.</p>'; });
</script>
</body>
</html>
`;

writeFileSync(join(out, 'index.html'), index);
writeFileSync(join(out, 'guide.html'), guide);
console.log(`design-site/ built: ${foundations.length} foundation cards, ${components.length} component sheets.`);
