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

// Plenty of plugins register both hooks in one main class. Sweeping up every
// asset path there would judge the plugin's front-end stylesheet as admin and
// fail a build over its own colours, on pages this system does not govern.
test('adminAssetPaths: a file registering both hooks does not surrender its front-end assets', () => {
  const paths = adminAssetPaths([
    {
      path: 'my-plugin.php',
      content: [
        "add_action( 'admin_enqueue_scripts', [ $this, 'admin_assets' ] );",
        "wp_enqueue_style( 'mine-admin', PLUGIN_URL . 'assets/css/admin.css' );",
        "add_action( 'wp_enqueue_scripts', [ $this, 'public_assets' ] );",
        "wp_enqueue_style( 'mine-public', PLUGIN_URL . 'assets/css/public.css' );",
      ].join('\n'),
    },
  ]);
  assert.equal(paths.has('assets/css/admin.css'), true);
  assert.equal(paths.has('assets/css/public.css'), false);
});

// The same-file rule still earns its keep on a file that is only ever about
// admin: there, an admin stylesheet named anything at all is picked up.
test('adminAssetPaths: an admin-only file surrenders assets whatever they are named', () => {
  const paths = adminAssetPaths([
    {
      path: 'includes/class-admin.php',
      content: [
        "add_action( 'admin_enqueue_scripts', [ $this, 'assets' ] );",
        "wp_enqueue_style( 'mine', PLUGIN_URL . 'assets/css/settings.css' );",
      ].join('\n'),
    },
  ]);
  assert.equal(paths.has('assets/css/settings.css'), true);
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

const VOCAB = { tokens: new Set(['--bw-brand']), classes: new Set(['bw-btn', 'bw-card', 'bw-wrap', 'bw-icon']), components: new Set(['Button', 'Card']) };
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

test('findViolations: a JSX style object holding only computed values does not fail', () => {
  assert.equal(rules(scan('<div style={{ width: size }} />', 'jsx')).includes('inline-style'), false);
  assert.equal(rules(scan("<div style={{ width: pct + '%' }} />", 'jsx')).includes('inline-style'), false);
  assert.equal(rules(scan("<div style={{ color: 'var(--bw-brand)' }} />", 'jsx')).includes('inline-style'), false);
});

test('findViolations: a JSX style object with a hard-coded literal still fails', () => {
  assert.equal(rules(scan("<div style={{ width: '10px' }} />", 'jsx')).includes('inline-style'), true);
  assert.equal(rules(scan("<div style={{ color: '#333' }} />", 'jsx')).includes('inline-style'), true);
});

test('findViolations: a quoted hex colour in a JSX style object fails as a colour, not just an inline style', () => {
  const problems = scan('<div style={{ color: "#F04438" }} />', 'jsx');
  assert.equal(rules(problems).includes('raw-color'), true);
  assert.equal(rules(problems).includes('inline-style'), true);
});

test('findViolations: a hard-coded colour hiding in a JSX ternary still fails', () => {
  const problems = scan('<div style={{ color: isErr ? "#F04438" : "var(--bw-brand)" }} />', 'jsx');
  assert.equal(rules(problems).includes('raw-color'), true);
  assert.equal(rules(problems).includes('inline-style'), true);
});

test('findViolations: a hard-coded length hiding in a JSX ternary still fails', () => {
  assert.equal(
    rules(scan('<div style={{ width: big ? "100px" : "50px" }} />', 'jsx')).includes('inline-style'),
    true,
  );
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

test('findViolations: a real token excuses a value, an invented one does not', () => {
  assert.equal(rules(scan('.bw-x{ padding: var(--bw-brand, 13px); }', 'css')).includes('raw-size'), false);
  assert.equal(rules(scan('.bw-x{ padding: var(--i-made-this-up, 13px); }', 'css')).includes('raw-size'), true);
});

test('findViolations: an invented token with a hard-coded fallback fires on the fallback', () => {
  const problems = scan('.bw-x{ padding: var(--i-made-this-up, 13px); }', 'css');
  assert.match(problems.find((p) => p.rule === 'raw-size').message, /size by hand/);
});

test('findViolations: an HTML entity is not a declaration separator', () => {
  assert.equal(
    rules(scan('<p style="padding: var(--bw-space-4)">Fee&nbsp;is 24px annually</p>')).includes('raw-size'),
    false,
  );
});

test('findViolations: a colour shown as text is not a colour being used', () => {
  assert.equal(rules(scan('<span>#4F46E5</span>')).includes('raw-color'), false);
});

test('findViolations: a URL fragment in a declaration-shaped line is not a colour', () => {
  assert.equal(rules(scan('<a class="bw-btn" href="https://example.com/#abc">Docs</a>')).includes('raw-color'), false);
});

test('findViolations: a hex-shaped URL fragment on an ordinary link does not fail', () => {
  assert.equal(
    rules(scan('<a class="bw-btn" href="https://example.com/help#add-new">Add</a>')).includes('raw-color'),
    false,
  );
  assert.equal(
    rules(scan('// see https://example.com/help#add-new for details')).includes('raw-color'),
    false,
  );
});

test('findViolations: a hex-shaped fragment glued inside a longer word does not fail', () => {
  assert.equal(rules(scan("content: 'word#fff';", 'css')).includes('raw-color'), false);
});

test('findViolations: real colour declarations still fail after the fragment fix', () => {
  assert.equal(rules(scan('.bw-x{ color: #4F46E5; }', 'css')).includes('raw-color'), true);
  assert.equal(rules(scan('.bw-x{ color:#333; }', 'css')).includes('raw-color'), true);
  assert.equal(rules(scan('.bw-x{ border: 1px solid #ECEDF3; }', 'css')).includes('raw-color'), true);
});

test('findViolations: a plugin admin stylesheet may only hold the documented chrome overrides', () => {
  const allowed = [
    '.wrap.bw-wrap { margin: 0; }',
    'body.toplevel_page_x #wpcontent { padding-left: 0; }',
    'body.toplevel_page_x #wpbody-content { padding-bottom: 0; }',
    'body.toplevel_page_x #wpfooter { display: none; }',
  ].join('\n');
  assert.equal(
    rules(findViolations({ path: 'assets/css/admin.css', kind: 'css', content: allowed, vocab: VOCAB })).includes('stray-admin-css'),
    false,
  );
  assert.equal(
    rules(findViolations({ path: 'assets/css/admin.css', kind: 'css', content: '.my-settings-panel { border: 0; }', vocab: VOCAB })).includes('stray-admin-css'),
    true,
  );
});

test('findViolations: a screen with no design system classes at all is a warning', () => {
  const problems = findViolations({ path: 'includes/screen.php', kind: 'php', content: '<div class="settings"><table class="widefat"></table></div>', vocab: VOCAB });
  const bare = problems.find((p) => p.rule === 'no-bw-class');
  assert.ok(bare);
  assert.equal(bare.severity, 'warn');
});

test('findViolations: a screen that uses the system does not warn', () => {
  assert.equal(
    rules(findViolations({ path: 'includes/screen.php', kind: 'php', content: '<div class="bw-card"></div>', vocab: VOCAB })).includes('no-bw-class'),
    false,
  );
});

test('findViolations: no-bw-class never fires on an edit fragment', () => {
  assert.equal(
    rules(findViolations({ path: 'includes/screen.php', kind: 'php', content: '<div class="settings">', vocab: VOCAB, whole: false })).includes('no-bw-class'),
    false,
  );
});

test('findViolations: markup with no classes at all does not warn', () => {
  assert.equal(
    rules(findViolations({ path: 'includes/menu.php', kind: 'php', content: "add_menu_page( 'X', 'X', 'manage_options', 'x', 'render' );", vocab: VOCAB })).includes('no-bw-class'),
    false,
  );
});

test('findViolations: nesting under .wrap does not launder stray CSS as an allowed override', () => {
  assert.equal(
    rules(findViolations({ path: 'assets/css/admin.css', kind: 'css', content: '.wrap .my-settings-panel { color: red; }', vocab: VOCAB })).includes('stray-admin-css'),
    true,
  );
  assert.equal(
    rules(findViolations({ path: 'assets/css/admin.css', kind: 'css', content: 'body.toplevel_page_x #wpcontent { padding-left: 0; }', vocab: VOCAB })).includes('stray-admin-css'),
    false,
  );
});

test('findViolations: a keyframe block does not fail as a stray selector', () => {
  const css = [
    '@keyframes bw-spin {',
    '0% { transform: rotate(0deg); }',
    '50% { transform: rotate(180deg); }',
    'to { transform: rotate(360deg); }',
    '}',
  ].join('\n');
  assert.equal(
    rules(findViolations({ path: 'assets/css/admin.css', kind: 'css', content: css, vocab: VOCAB })).includes('stray-admin-css'),
    false,
  );
});

test('findViolations: a screen importing the design system does not warn, even with a plain wrapper class', () => {
  const content = [
    "import { Button } from '../.claude/skills/blueworx-admin-design/components/core/index.js';",
    '<div className="settings-wrapper"><Button className="save-btn">Save</Button></div>',
  ].join('\n');
  assert.equal(
    rules(findViolations({ path: 'src/Settings.jsx', kind: 'jsx', content, vocab: VOCAB })).includes('no-bw-class'),
    false,
  );
});

test('findViolations: a screen rendering a design system component from a local barrel import does not warn', () => {
  const content = [
    "import { Card } from '../components';",
    '<Card className="settings-wrapper"></Card>',
  ].join('\n');
  assert.equal(
    rules(findViolations({ path: 'src/Panel.jsx', kind: 'jsx', content, vocab: VOCAB })).includes('no-bw-class'),
    false,
  );
});

const EDITOR_VOCAB = { classes: new Set(['bw-tabs', 'bw-savebar', 'bw-card', 'bw-input']), tokens: new Set(), components: new Set() };

test('findViolations: tabs plus a save bar in a plugin is a hand-written editor', () => {
  const problems = findViolations({
    path: 'includes/admin/class-sport-editor.php',
    kind: 'php',
    content: [
      '<div class="bw-tabs"><button class="bw-tab">Content</button></div>',
      '<div class="bw-savebar"><button class="bw-btn">Save changes</button></div>',
    ].join('\n'),
    vocab: EDITOR_VOCAB,
  });
  const found = problems.filter((p) => p.rule === 'hand-written-editor');
  assert.equal(found.length, 1);
  assert.equal(found[0].severity, 'warn');
  assert.match(found[0].message, /page editor library/);
});

test('findViolations: a settings screen with a save bar and no tabs is left alone', () => {
  const problems = findViolations({
    path: 'includes/admin/class-settings.php',
    kind: 'php',
    content: '<div class="bw-savebar"><button class="bw-btn">Save changes</button></div>',
    vocab: EDITOR_VOCAB,
  });
  assert.equal(problems.filter((p) => p.rule === 'hand-written-editor').length, 0);
});

test('findViolations: the rule never fires on an edit fragment', () => {
  const problems = findViolations({
    path: 'includes/admin/class-sport-editor.php',
    kind: 'php',
    content: '<div class="bw-tabs"></div><div class="bw-savebar"></div>',
    vocab: EDITOR_VOCAB,
    whole: false,
  });
  assert.equal(problems.filter((p) => p.rule === 'hand-written-editor').length, 0);
});

test('findViolations: the library itself is not a consumer of itself', () => {
  const problems = findViolations({
    path: 'blueworx-page-editor/v1/Screen.php',
    kind: 'php',
    content: '<div class="bw-tabs"></div><div class="bw-savebar"></div>',
    vocab: EDITOR_VOCAB,
  });
  assert.equal(problems.filter((p) => p.rule === 'hand-written-editor').length, 0);
});
