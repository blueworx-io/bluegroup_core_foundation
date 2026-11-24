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

// Review round 1.
test('fallbacks: allowed on a theme name, judged on any other variable', () => {
  bad('color', 'var(--hero-tint, #f00)');
  bad('background', 'var(--hero-tint, red)');
  good('color', 'var(--color-text, #16181d)');
  good('font-size', 'var(--text-lead, var(--wp--preset--font-size--large))');
  good('font-family', 'var(--font-heading, var(--wp--preset--font-family--serif))');
});

test('theme names: a definition may only be another theme name', () => {
  bad('--text-lead', 'calc(var(--text-body) + 12px)');
  bad('--color-accent', 'var(--hero-tint, #fff)');
  good('--text-lead', 'var(--text-body)');
});

test('colour functions are judged one by one', () => {
  bad('background', 'linear-gradient(rgb(from var(--color-primary) r g b / 50%), rgb(255 0 0))');
  good('background', 'linear-gradient(rgb(from var(--color-primary) r g b / 50%), var(--color-surface))');
  bad('color', 'rgb(from var(--hero-tint) r g b)');
});

test('sizes: nested maths of theme sizes passes', () => {
  good('font-size', 'calc(max(var(--text-small), var(--text-body)) * 1.2)');
  bad('font-size', 'calc(max(var(--text-small), 12px) * 1.2)');
});

test('border-image: named colours in a gradient fail', () => {
  bad('border-image', 'linear-gradient(red, blue) 1');
});

test('declarations: text in strings and scss comments is not a declaration', () => {
  const css = '.a::after { content: "x; color: red;"; }\n// color: red;\n.b { margin: 0 }';
  assert.deepEqual(declarations(css, { scss: true }).map((d) => d.prop), ['content', 'margin']);
});

test('declarations: scss nested properties keep their full name', () => {
  const found = declarations('.a {\n  font: {\n    size: 18px;\n    family: Georgia;\n  }\n}', { scss: true });
  assert.deepEqual(found.map((d) => d.prop), ['font-size', 'font-family']);
  assert.ok(judgeDeclaration(found[0].prop, found[0].value));
  assert.ok(judgeDeclaration(found[1].prop, found[1].value));
});

test('declarations: a multi-line comment keeps the line numbers', () => {
  const found = declarations('/* one\n two\n three */\n.a { color: red; }');
  assert.equal(found[0].line, 4);
});

test('declarations: a semicolon inside url() does not split the value', () => {
  const found = declarations('.a { background: url("data:image/svg+xml;utf8,<svg/>") no-repeat; color: red }');
  assert.deepEqual(found.map((d) => d.prop), ['background', 'color']);
});

test('phpStyles: markup printed by php is judged, runtime values are not', () => {
  const php = `<?php\necho '<div style="color: red">hi</div>';\nprintf( "<p style=\\"font-size: 12px\\">%s</p>", $x );\necho "<p style='color: {$colour}'>x</p>";\n$a = array( 'style' => 'background: #fff' );\n?>`;
  const found = phpStyles(php).map((d) => `${d.prop}=${d.value.trim()}@${d.line}`);
  assert.deepEqual(found.sort(), ['background=#fff@5', 'color=red@2', 'font-size=12px@3'].sort());
});

test('phpStyles: data- attributes are metadata, not paint', () => {
  const php = '<div data-fill="red" data-style="color: red" fill="blue"></div>';
  assert.deepEqual(phpStyles(php).map((d) => `${d.prop}=${d.value}`), ['fill=blue']);
});

test('cli: a changed section with a non-ASCII name is still judged on a pull request', () => {
  const dir = mkdtempSync(join(tmpdir(), 'section-styles-git-'));
  try {
    const git = (...args) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8' });
    git('init', '-q');
    writeFileSync(join(dir, 'README.md'), 'x');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    mkdirSync(join(dir, 'blocks', 'hero'), { recursive: true });
    writeFileSync(join(dir, 'blocks', 'hero', 'été.scss'), '.hero { color: #ff0000; }');
    git('add', '-A');
    git('commit', '-q', '-m', 'section');
    const run = spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8', env: { ...process.env, BASE_REF: 'main' } });
    assert.equal(run.status, 1);
    assert.match(run.stdout, /été\.scss:1/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Review round 2.
test('theme aliases must stay in the same family', () => {
  bad('--color-primary', 'var(--wp--preset--color--contrast)');
  bad('--color-primary', 'var(--text-body)');
  good('--color-accent', 'var(--color-primary)');
});

test('named colours: whole words, any Sass variable, any gradient', () => {
  good('--hero-animation', 'fade-to-black');
  bad('--hero-colour', 'black');
  bad('$accent', 'red');
  bad('list-style-image', 'linear-gradient(red, blue)');
  good('list-style-image', 'linear-gradient(var(--color-primary), var(--color-surface))');
});

test('a theme name does not hide a typed-in colour inside a relative colour', () => {
  bad('color', 'rgb(from rgb(255 0 0) r g b)');
  bad('color', 'rgb(from var(--color-primary) 255 g b / #fff)');
  good('color', 'rgb(from var(--color-primary) r g b / 50%)');
});

test('scss: interpolation stays in the value, nested shorthand values are judged', () => {
  const size = declarations('.a { font-size: #{$hero-size}px; }', { scss: true });
  assert.deepEqual(size.map((d) => d.prop), ['font-size']);
  assert.ok(judgeDeclaration(size[0].prop, size[0].value));

  const nested = declarations('.a { font: 16px Arial {\n size: 24px;\n } }', { scss: true });
  assert.deepEqual(nested.map((d) => d.prop), ['font', 'font-size']);
  assert.ok(judgeDeclaration('font', nested[0].value));
  assert.ok(judgeDeclaration('font-size', nested[1].value));

  const selector = declarations('a:hover { color: red }', { scss: true });
  assert.deepEqual(selector.map((d) => d.prop), ['color']);
});

test('scss: a // comment inside var() is skipped, a url(//cdn) is not a comment', () => {
  const found = declarations('.a {\n  font-size: var(\n    // the size\n    --text-lead\n  );\n  background: url(//cdn.example.com/a.png);\n}', { scss: true });
  assert.equal(judgeDeclaration(found[0].prop, found[0].value), null);
  assert.equal(found[1].value.trim(), 'url(//cdn.example.com/a.png)');
});

test('phpStyles: commented-out styles are ignored', () => {
  const php = `<!-- <div style="color: red"> -->\n<?php\n// $a = array( 'style' => 'color: red' );\n/* echo '<p style="color: red">'; */\n?>`;
  assert.deepEqual(phpStyles(php), []);
});

test('phpStyles: svg text typography is judged like inline css', () => {
  const found = phpStyles('<svg><text font-family="Arial" font-size="24">x</text></svg>').map((d) => `${d.prop}=${d.value}`);
  assert.deepEqual(found.sort(), ['font-family=Arial', 'font-size=24']);
  assert.ok(judgeDeclaration('font-size', '24'));
});
