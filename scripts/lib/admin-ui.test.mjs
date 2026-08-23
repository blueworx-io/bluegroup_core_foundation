import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminAssetPaths, classifyAdminFile, findViolations } from './admin-ui.mjs';

test('adminAssetPaths: collects assets enqueued beside an admin hook', () => {
  const paths = adminAssetPaths([
    {
      path: 'includes/class-admin.php',
      content: [
        "add_action( 'admin_enqueue_scripts', [ $this, 'assets' ] );",
        "wp_enqueue_style( 'bw-admin', PLUGIN_URL . 'assets/blueworx-admin-design.css', [], V );",
        "wp_enqueue_style( 'my-admin', PLUGIN_URL . 'assets/css/admin.css', [], V );",
      ].join('\n'),
    },
    {
      path: 'includes/class-public.php',
      content: [
        "add_action( 'wp_enqueue_scripts', [ $this, 'assets' ] );",
        "wp_enqueue_style( 'front', PLUGIN_URL . 'assets/css/public.css', [], V );",
      ].join('\n'),
    },
  ]);
  assert.equal(paths.has('assets/css/admin.css'), true);
  assert.equal(paths.has('assets/css/public.css'), false);
});

test('adminAssetPaths: collects admin-named assets from any wp_enqueue_* call', () => {
  const paths = adminAssetPaths([
    {
      path: 'includes/class-admin.php',
      content: [
        "wp_enqueue_style( 'admin-styles', PLUGIN_URL . 'assets/css/admin.css' );",
        "wp_enqueue_style( 'public-styles', PLUGIN_URL . 'assets/css/public.css' );",
        "wp_enqueue_script( 'admin-logic', PLUGIN_URL . 'assets/js/admin-panel.js' );",
      ].join('\n'),
    },
  ]);
  assert.equal(paths.has('assets/css/admin.css'), true);
  assert.equal(paths.has('assets/js/admin-panel.js'), true);
  assert.equal(paths.has('assets/css/public.css'), false);
});

test('classifyAdminFile: PHP that registers or renders an admin page', () => {
  assert.equal(classifyAdminFile({ path: 'includes/menu.php', content: "add_menu_page( 'X', 'X', 'manage_options', 'x', 'render' );" }), 'php');
  assert.equal(classifyAdminFile({ path: 'views/screen.php', content: '<div class="wrap bw-wrap">' }), 'php');
  assert.equal(classifyAdminFile({ path: 'includes/shortcode.php', content: "add_shortcode( 'x', 'render' );" }), null);
});

test('classifyAdminFile: JSX that imports the system or uses its classes', () => {
  assert.equal(classifyAdminFile({ path: 'src/Settings.jsx', content: "import { Button } from '../.claude/skills/blueworx-admin-design/components/core/Button.jsx';" }), 'jsx');
  assert.equal(classifyAdminFile({ path: 'src/Panel.jsx', content: '<div className="bw-card" />' }), 'jsx');
  assert.equal(classifyAdminFile({ path: 'src/Front.jsx', content: '<div className="hero" />' }), null);
});

test('classifyAdminFile: CSS only when the plugin enqueues it on an admin screen', () => {
  const adminAssets = new Set(['assets/css/admin.css']);
  assert.equal(classifyAdminFile({ path: 'assets/css/admin.css', content: '.x{}', adminAssets }), 'css');
  assert.equal(classifyAdminFile({ path: 'assets/css/public.css', content: '.x{}', adminAssets }), null);
});

test('classifyAdminFile: the design system itself is never judged against itself', () => {
  assert.equal(
    classifyAdminFile({ path: '.claude/skills/blueworx-admin-design/components/core/Button.jsx', content: '<button className="bw-btn" />' }),
    null,
  );
  assert.equal(
    classifyAdminFile({ path: 'assets/blueworx-admin-design.css', content: '.bw-btn{ color: #fff; }', adminAssets: new Set(['assets/blueworx-admin-design.css']) }),
    null,
  );
});

test('classifyAdminFile: Windows paths are normalised', () => {
  assert.equal(classifyAdminFile({ path: 'includes\\menu.php', content: 'add_menu_page(' }), 'php');
});

const VOCAB = { tokens: new Set(['--bw-brand']), classes: new Set(['bw-btn', 'bw-card', 'bw-wrap', 'bw-icon']), components: new Set(['Button']) };
const rules = (problems) => problems.map((p) => p.rule);
const scan = (content, kind = 'php') => findViolations({ path: 'includes/screen.php', kind, content, vocab: VOCAB });

test('findViolations: a colour written by hand fails', () => {
  assert.equal(rules(scan('.bw-x{ color: #4F46E5; }', 'css')).includes('raw-color'), true);
  assert.equal(rules(scan('.bw-x{ color: rgb(10 12 41); }', 'css')).includes('raw-color'), true);
  assert.equal(rules(scan('.bw-x{ color: var(--bw-brand); }', 'css')).includes('raw-color'), false);
});

test('findViolations: an anchor fragment is not a colour', () => {
  assert.equal(rules(scan('<a class="bw-btn" href="#abc">Section</a>')).includes('raw-color'), false);
});

test('findViolations: a hand-written size fails, but not inside a breakpoint', () => {
  assert.equal(rules(scan('.bw-x{ padding: 24px; }', 'css')).includes('raw-size'), true);
  assert.equal(rules(scan('@media (min-width: 782px){', 'css')).includes('raw-size'), false);
  assert.equal(rules(scan('.bw-x{ padding: var(--bw-space-6); }', 'css')).includes('raw-size'), false);
});

test('findViolations: a hand-set font and shadow fail', () => {
  assert.equal(rules(scan('.bw-x{ font-family: Arial, sans-serif; }', 'css')).includes('raw-font'), true);
  assert.equal(rules(scan('.bw-x{ font-family: var(--bw-font-sans); }', 'css')).includes('raw-font'), false);
  assert.equal(rules(scan('.bw-x{ box-shadow: 0 1px 2px rgb(0 0 0 / .1); }', 'css')).includes('raw-shadow'), true);
  assert.equal(rules(scan('.bw-x{ box-shadow: none; }', 'css')).includes('raw-shadow'), false);
});

test('findViolations: inline style fails in markup and in JSX', () => {
  assert.equal(rules(scan('<div class="bw-card" style="margin-top:8px">')).includes('inline-style'), true);
  assert.equal(rules(scan('<div className="bw-card" style={{ marginTop: 8 }} />', 'jsx')).includes('inline-style'), true);
});

test('findViolations: a hand-drawn icon fails', () => {
  assert.equal(rules(scan('<div class="bw-card"><svg viewBox="0 0 24 24"></svg></div>')).includes('hand-svg'), true);
  assert.equal(rules(scan('<i class="bw-icon" data-lucide="settings"></i>')).includes('hand-svg'), false);
});

test('findViolations: WordPress core classes fail and name the replacement', () => {
  const problems = scan('<table class="form-table">');
  assert.equal(rules(problems).includes('wp-core-class'), true);
  assert.match(problems.find((p) => p.rule === 'wp-core-class').message, /FormRow/);
  assert.match(scan('<button class="button button-primary">Save</button>').find((p) => p.rule === 'wp-core-class').message, /Button/);
  assert.match(scan('<div class="notice notice-error"><p>No</p></div>').find((p) => p.rule === 'wp-core-class').message, /Notice/);
});

test('findViolations: wp-core-class matches a whole class name, not a substring', () => {
  assert.equal(rules(scan('<div class="primary-nav-tab-container">')).includes('wp-core-class'), false);
});

test('findViolations: an invented bw- class fails, a real one passes', () => {
  assert.equal(rules(scan('<div class="bw-card">')).includes('unknown-bw-class'), false);
  assert.equal(rules(scan('<div class="bw-superpanel">')).includes('unknown-bw-class'), true);
});

test('findViolations: a class built from a variable is left alone', () => {
  assert.equal(rules(scan('<div className={`bw-btn bw-btn--${variant}`} />', 'jsx')).includes('unknown-bw-class'), false);
});

test('findViolations: every problem carries a line number a person can open', () => {
  const problems = scan('<div class="bw-card">\n<table class="form-table">');
  assert.equal(problems.find((p) => p.rule === 'wp-core-class').line, 2);
});

test('findViolations: a token on one declaration does not excuse a hand-written value on another', () => {
  assert.equal(rules(scan('.bw-x{ color: var(--bw-brand); padding: 24px; }', 'css')).includes('raw-size'), true);
  assert.equal(rules(scan('.bw-x{ padding: var(--bw-space-6); color: #4F46E5; }', 'css')).includes('raw-color'), true);
});
