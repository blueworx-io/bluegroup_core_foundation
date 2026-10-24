// Pure parts of scripts/wp-test-env.mjs: which of a plugin and a theme a run
// sets up, and the PHP that activates them. Kept here so they can be tested
// without provisioning a WordPress.

import { resolve, basename } from 'node:path';

// A theme slug is a folder name under wp-content/themes and is written into the
// bootstrap PHP between single quotes, so only a plain folder name is allowed.
const THEME_SLUG = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

// `args` is parsed argv: { plugin, slug, theme, 'theme-slug' }.
//
// With no --theme, this is exactly the old behaviour: --plugin defaults to the
// current directory and --slug to its folder name. With --theme, a plugin is
// only set up when --plugin is passed too, so a theme repo is tested alone and
// a plugin such as Clubhouse can still sit on top of it.
export function resolveTargets(args) {
  const themeGiven = args.theme !== undefined;

  if (args.theme === true) throw new Error('--theme needs a directory, e.g. --theme .');
  if (args['theme-slug'] !== undefined && !themeGiven) {
    throw new Error('--theme-slug needs --theme <dir>.');
  }
  if (themeGiven && args.plugin === undefined && args.slug !== undefined) {
    throw new Error('--slug names the plugin. With --theme alone, name the theme with --theme-slug.');
  }

  let theme = null;
  if (themeGiven) {
    const dir = resolve(args.theme);
    const slug = args['theme-slug'] ?? basename(dir);
    if (typeof slug !== 'string' || !THEME_SLUG.test(slug) || slug === '..') {
      throw new Error(`Invalid theme slug "${slug}". Use a plain folder name (letters, numbers, - _ .).`);
    }
    theme = { dir, slug };
  }

  let plugin = null;
  if (!themeGiven || args.plugin !== undefined) {
    const dir = resolve(args.plugin ?? '.');
    plugin = { dir, slug: args.slug ?? basename(dir) };
  }

  return { plugin, theme };
}

// Pretty permalinks are required or /wp-json/ returns HTML and every REST spec
// fails on "Unexpected token '<'".
//
// With a plugin and no theme this is, byte for byte, the script the harness ran
// before themes were supported.
export function bootstrapScript({ plugin, theme, admin }) {
  const head = `<?php
require_once __DIR__ . '/wp-load.php';
require_once ABSPATH . 'wp-admin/includes/plugin.php';
require_once ABSPATH . 'wp-includes/rewrite.php';
global $wp_rewrite;
if ( get_option( 'permalink_structure' ) !== '/%postname%/' ) {
  $wp_rewrite->set_permalink_structure( '/%postname%/' );
  $wp_rewrite->flush_rules( true );
}
`;

  // Switched before any plugin activates, so a plugin built on the theme sees
  // it in place. Only switched when it is not already the active theme, so a
  // re-run does not fire after_switch_theme again on the next request.
  const themePart = theme ? `$theme = wp_get_theme( '${theme.slug}' );
if ( ! $theme->exists() || $theme->errors() ) {
  $why = $theme->errors() ? $theme->errors()->get_error_message() : 'not found in ' . get_theme_root();
  echo 'ACTIVATION_ERROR: theme ${theme.slug}: ' . $why . "\\n";
} else {
  if ( get_stylesheet() !== '${theme.slug}' ) {
    switch_theme( '${theme.slug}' );
  }
  echo 'THEME_ACTIVE: ${theme.slug}' . "\\n";
}
` : '';

  const findMain = plugin ? `$main = '${plugin.slug}/${plugin.slug}.php';
if ( ! file_exists( WP_PLUGIN_DIR . '/' . $main ) ) {
  foreach ( glob( WP_PLUGIN_DIR . '/${plugin.slug}/*.php' ) as $candidate ) {
    if ( preg_match( '/^\\s*\\*?\\s*Plugin Name:/im', file_get_contents( $candidate ) ) ) {
      $main = '${plugin.slug}/' . basename( $candidate );
      break;
    }
  }
}
` : '';

  const resetAdmin = `// The login is whatever this script says it is, on an old instance as well as
// a new one. An instance installed under an earlier password is reused rather
// than rebuilt, and without this the banner below would promise a login the
// site did not have.
$admin = get_user_by( 'login', '${admin.user}' );
if ( $admin && ! wp_check_password( '${admin.pass}', $admin->user_pass, $admin->ID ) ) {
  wp_set_password( '${admin.pass}', $admin->ID );
  echo "ADMIN_PASSWORD: reset\\n";
}
`;

  const activate = plugin ? `$res = activate_plugin( $main, '', false, false );
echo is_wp_error( $res ) ? 'ACTIVATION_ERROR: ' . $res->get_error_message() : 'PLUGIN_ACTIVE: ' . $main;
` : '';

  // The plugin's line has no trailing newline, so the permalinks line supplies
  // one; with no plugin every line above already ended in one.
  const permalinks = `echo ${plugin ? '"\\n" . ' : ''}'PERMALINKS: ' . get_option( 'permalink_structure' ) . "\\n";
`;

  return head + themePart + findMain + resetAdmin + activate + permalinks;
}
