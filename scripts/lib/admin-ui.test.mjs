import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminAssetPaths, classifyAdminFile } from './admin-ui.mjs';

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
