import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { judgeDeclaration, declarations, phpStyles, isSectionFile, sectionStyles } from './section-styles.mjs';

const bad = (prop, value) => assert.ok(judgeDeclaration(prop, value), `${prop}: ${value} should fail`);
const good = (prop, value) => assert.equal(judgeDeclaration(prop, value), null, `${prop}: ${value} should pass`);

test('colours: typed-in values fail', () => {
  bad('color', '#fff');
  bad('background', '#F4F6FA');
  bad('background-color', '#f4f6fa80');
  bad('color', 'rgb(0, 0, 0)');
  bad('color', 'rgba(0,0,0,.5)');
  bad('color', 'hsl(210 50% 40%)');
  bad('color', 'oklch(60% 0.2 250)');
  bad('border', '1px solid red');
  bad('background', 'linear-gradient(to right, var(--color-primary), white)');
  bad('box-shadow', '0 1px 2px rgba(0,0,0,.2)');
  bad('fill', 'black');
  bad('color', 'color-mix(in srgb, var(--color-primary) 80%, white)');
  bad('--bwx-card-bg', '#fff');
});

test('colours: theme names and keywords pass', () => {
  good('color', 'var(--color-primary)');
  good('background', 'var(--color-surface) url(hero.png) no-repeat');
  good('border', '1px solid var(--color-border)');
  good('background-color', 'transparent');
  good('color', 'currentColor');
  good('fill', 'none');
  good('color', 'inherit');
  good('color', 'color-mix(in srgb, var(--color-primary) 80%, transparent)');
  good('color', 'rgb(from var(--color-primary) r g b / 50%)');
  good('--bwx-card-bg', 'var(--color-surface)');
  good('background', 'url(#gradient)');
  good('content', '"#fff"');
  good('color', 'var(--color-text, #16181d)'); // fallback beside a theme name
});

test('fonts: only the theme names', () => {
  bad('font-family', 'Georgia, serif');
  bad('font-family', '"Inter", sans-serif');
  bad('font-family', 'var(--font-body), sans-serif');
  bad('font-family', 'var(--my-font)');
  bad('font', '16px/1.5 Arial');
  good('font-family', 'var(--font-heading)');
  good('font-family', 'var(--font-heading, inherit)');
  good('font-family', 'var(--font-body), var(--font-fallback)');
  good('font-family', 'inherit');
  good('font', 'inherit');
});

test('sizes: only the theme names', () => {
  bad('font-size', '18px');
  bad('font-size', '1.2rem');
  bad('font-size', '1em');
  bad('font-size', '100%');
  bad('font-size', 'large');
  bad('font-size', 'clamp(1rem, 2vw, 2rem)');
  bad('font-size', 'var(--my-size)');
  bad('font-size', 'calc(var(--text-lead) + 2px)');
  good('font-size', 'var(--text-lead)');
  good('font-size', 'var(--text-display, 64px)');
  good('font-size', 'calc(var(--text-lead) * 1.2)');
  good('font-size', 'clamp(var(--text-small), var(--text-body), var(--text-lead))');
  good('font-size', 'inherit');
  good('font-size', '0');
});

test('a section never defines a theme name', () => {
  bad('--color-primary', '#123456');
  bad('--font-heading', 'Georgia');
  bad('--text-lead', '18px');
  good('--color-accent', 'var(--color-primary)');
  good('--bwx-gap', '16px');
});

test('other properties are left alone', () => {
  good('margin', '0 auto');
  good('padding', 'var(--space-4, 16px) 24px');
  good('letter-spacing', '0.08em');
  good('line-height', '1.6');
  good('font-weight', '600');
});

test('declarations: finds properties with line numbers, skips selectors and comments', () => {
  const css = `/* color: #fff; */\n.a:hover {\n  color: red;\n}\n@media (min-width: 600px) {\n  .b { font-size: 12px }\n}`;
  const found = declarations(css);
  assert.deepEqual(found.map((d) => [d.prop, d.value, d.line]), [
    ['color', 'red', 3],
    ['font-size', '12px', 6],
  ]);
});

test('phpStyles: reads style attributes, style blocks and svg paint; ignores php values', () => {
  const php = `<?php echo 'x'; ?>\n<section style="color: #fff; margin: 0">\n<style>.a { font-size: 12px }</style>\n<svg><path fill="#000"/></svg>\n<div style="background: <?php echo esc_attr( $c ); ?>"></div>`;
  const found = phpStyles(php).map((d) => `${d.prop}=${d.value}`);
  assert.deepEqual(found.sort(), ['color=#fff', 'fill=#000', 'font-size=12px', 'margin=0'].sort());
});

test('isSectionFile: stylesheets and render.php under blocks/ only', () => {
  assert.equal(isSectionFile('blocks/hero/style.css'), true);
  assert.equal(isSectionFile('plugin/blocks/hero/render.php'), true);
  assert.equal(isSectionFile('src/blocks/hero/style.scss'), true);
  assert.equal(isSectionFile('blocks/hero/edit.js'), false);
  assert.equal(isSectionFile('assets/site.css'), false);
  assert.equal(isSectionFile('build/blocks/hero/style.css'), false);
});

test('sectionStyles: a typed-in colour fails, the theme names pass', () => {
  const failing = sectionStyles({ files: [{ path: 'blocks/hero/style.css', content: '.hero {\n  color: #ff0000;\n}' }] });
  assert.equal(failing.ok, false);
  assert.match(failing.message, /blocks\/hero\/style\.css:2/);
  assert.match(failing.message, /var\(--color-primary\)/);

  const passing = sectionStyles({
    files: [{ path: 'blocks/hero/style.css', content: '.hero { color: var(--color-primary); font: inherit; font-size: var(--text-lead); }' }],
  });
  assert.equal(passing.ok, true);
});

test('sectionStyles: files outside sections, and the old plugin names file, are not judged', () => {
  const files = [
    { path: 'assets/site.css', content: ':root { --color-primary: #123456; }' },
    { path: 'blocks/theme-names.css', content: ':root { --color-primary: #123456; --font-heading: Georgia; --text-lead: 19px; }' },
  ];
  assert.equal(sectionStyles({ files: [files[0]] }).ok, true);
  assert.equal(sectionStyles({ files }).ok, false);
  assert.equal(sectionStyles({ files, namesFile: './blocks/theme-names.css' }).ok, true);
});

test('sectionStyles: nothing to judge passes', () => {
  assert.equal(sectionStyles({ files: [] }).ok, true);
});

test('sectionStyles: a render.php with an inline colour fails', () => {
  const result = sectionStyles({ files: [{ path: 'blocks/hero/render.php', content: '<?php // x ?>\n<div style="color: tomato">hi</div>' }] });
  assert.equal(result.ok, false);
  assert.match(result.message, /render\.php:2/);
});

// The CLI, end to end: a throwaway plugin with one section.

const script = resolve(import.meta.dirname, '..', 'check-section-styles.mjs');
function runCli(css, env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'section-styles-'));
  try {
    mkdirSync(join(dir, 'blocks', 'hero'), { recursive: true });
    writeFileSync(join(dir, 'blocks', 'hero', 'style.css'), css);
    const run = spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8', env: { ...process.env, BASE_REF: '', ...env } });
    return { code: run.status, out: run.stdout };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('cli: a pull request with a typed-in colour fails', () => {
  const { code, out } = runCli('.hero { color: #ff0000; }');
  assert.equal(code, 1);
  assert.match(out, /blocks\/hero\/style\.css:1/);
});

test('cli: a pull request using the theme names passes', () => {
  const { code } = runCli('.hero { color: var(--color-primary); font-family: var(--font-heading); font-size: var(--text-lead); }');
  assert.equal(code, 0);
});

test('cli: warn reports without failing, off skips', () => {
  assert.equal(runCli('.hero { color: red; }', { SECTION_STYLES: 'warn' }).code, 0);
  assert.equal(runCli('.hero { color: red; }', { SECTION_STYLES: 'off' }).code, 0);
});
