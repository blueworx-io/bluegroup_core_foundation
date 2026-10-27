import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basename, resolve } from 'node:path';
import {
  resolveTargets, bootstrapScript, serverWorkers, DEFAULT_SERVER_WORKERS,
} from './wp-test-env.mjs';

const ADMIN = { user: 'admin', pass: 'admin' };

test('serverWorkers: several by default off Windows, a set number kept', () => {
  assert.equal(serverWorkers(undefined, 'linux'), DEFAULT_SERVER_WORKERS);
  assert.ok(DEFAULT_SERVER_WORKERS > 1);
  assert.equal(serverWorkers('1', 'linux'), 1);
  assert.equal(serverWorkers('8', 'darwin'), 8);
});

test('serverWorkers: Windows always runs one, since PHP ignores workers there', () => {
  assert.equal(serverWorkers(undefined, 'win32'), 1);
  assert.equal(serverWorkers('8', 'win32'), 1);
});

test('serverWorkers: refuses anything but a whole number of one or more', () => {
  for (const bad of ['0', '-2', '2.5', 'many', true]) {
    assert.throws(() => serverWorkers(bad, 'linux'), /--server-workers/);
    assert.throws(() => serverWorkers(bad, 'win32'), /--server-workers/);
  }
});

test('resolveTargets: no flags sets up the current directory as a plugin, as before', () => {
  const { plugin, theme } = resolveTargets({ _: ['up'] });
  assert.deepEqual(plugin, { dir: resolve('.'), slug: basename(resolve('.')) });
  assert.equal(theme, null);
});

test('resolveTargets: --plugin and --slug behave as before', () => {
  const { plugin, theme } = resolveTargets({ _: [], plugin: '/repos/my-plugin', slug: 'other' });
  assert.deepEqual(plugin, { dir: resolve('/repos/my-plugin'), slug: 'other' });
  assert.equal(theme, null);
});

test('resolveTargets: --theme alone sets up only the theme, slug from its folder', () => {
  const { plugin, theme } = resolveTargets({ _: [], theme: '/repos/blueworx' });
  assert.equal(plugin, null);
  assert.deepEqual(theme, { dir: resolve('/repos/blueworx'), slug: 'blueworx' });
});

test('resolveTargets: --theme-slug overrides the folder name', () => {
  const { theme } = resolveTargets({ _: [], theme: '/repos/blueworx_labs_wordpress_theme', 'theme-slug': 'blueworx' });
  assert.equal(theme.slug, 'blueworx');
});

test('resolveTargets: --theme and --plugin together set up both', () => {
  const { plugin, theme } = resolveTargets({
    _: [], theme: '/repos/theme', 'theme-slug': 'blueworx', plugin: '/repos/clubhouse', slug: 'clubhouse',
  });
  assert.deepEqual(plugin, { dir: resolve('/repos/clubhouse'), slug: 'clubhouse' });
  assert.deepEqual(theme, { dir: resolve('/repos/theme'), slug: 'blueworx' });
});

test('resolveTargets: --theme without a directory is an error', () => {
  assert.throws(() => resolveTargets({ _: [], theme: true }), /--theme needs a directory/);
});

test('resolveTargets: --theme-slug without --theme is an error', () => {
  assert.throws(() => resolveTargets({ _: [], 'theme-slug': 'blueworx' }), /--theme-slug needs --theme/);
});

test('resolveTargets: --slug with only --theme is an error, not silently ignored', () => {
  assert.throws(() => resolveTargets({ _: [], theme: '/repos/blueworx', slug: 'blueworx' }), /--theme-slug/);
});

test('resolveTargets: a theme slug that is not a plain folder name is refused', () => {
  for (const bad of ["blue'worx", 'blue/worx', '..', 'blue worx']) {
    assert.throws(() => resolveTargets({ _: [], theme: '/repos/x', 'theme-slug': bad }), /theme slug/i, bad);
  }
});

test('bootstrapScript: plugin only activates the plugin and never touches the theme', () => {
  const php = bootstrapScript({ plugin: { slug: 'my-plugin' }, theme: null, admin: ADMIN });
  assert.match(php, /activate_plugin\( \$main/);
  assert.match(php, /\$main = 'my-plugin\/my-plugin\.php';/);
  assert.match(php, /PLUGIN_ACTIVE: /);
  assert.doesNotMatch(php, /switch_theme|THEME_ACTIVE/);
});

test('bootstrapScript: theme only switches the theme and activates no plugin', () => {
  const php = bootstrapScript({ plugin: null, theme: { slug: 'blueworx' }, admin: ADMIN });
  assert.match(php, /wp_get_theme\( 'blueworx' \)/);
  assert.match(php, /switch_theme\( 'blueworx' \)/);
  assert.match(php, /THEME_ACTIVE: blueworx/);
  assert.doesNotMatch(php, /activate_plugin|PLUGIN_ACTIVE/);
  // A theme that WordPress cannot load must stop the run, the same way a
  // plugin that fails to activate does.
  assert.match(php, /ACTIVATION_ERROR: /);
  assert.match(php, /->exists\(\)/);
  assert.match(php, /->errors\(\)/);
});

test('bootstrapScript: theme and plugin together switch the theme before activating the plugin', () => {
  const php = bootstrapScript({ plugin: { slug: 'clubhouse' }, theme: { slug: 'blueworx' }, admin: ADMIN });
  const switched = php.indexOf("switch_theme( 'blueworx' )");
  const activated = php.indexOf('activate_plugin(');
  assert.ok(switched > -1 && activated > -1);
  assert.ok(switched < activated, 'the plugin should activate with the theme already in place');
});

test('bootstrapScript: every mode resets the admin password and sets permalinks', () => {
  for (const targets of [
    { plugin: { slug: 'p' }, theme: null },
    { plugin: null, theme: { slug: 't' } },
    { plugin: { slug: 'p' }, theme: { slug: 't' } },
  ]) {
    const php = bootstrapScript({ ...targets, admin: ADMIN });
    assert.match(php, /wp_set_password\( 'admin'/);
    assert.match(php, /set_permalink_structure\( '\/%postname%\/' \)/);
    assert.match(php, /'PERMALINKS: '/);
  }
});

test('bootstrapScript: switching is skipped when the theme is already active, so re-runs stay quiet', () => {
  const php = bootstrapScript({ plugin: null, theme: { slug: 'blueworx' }, admin: ADMIN });
  assert.match(php, /get_stylesheet\(\) !== 'blueworx'/);
});
