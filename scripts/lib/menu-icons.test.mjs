import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Icons::MENU_ICONS writes geometry a second time, because the top-level
// wp-admin menu is drawn by WordPress before any of our JavaScript runs and
// add_menu_page() takes an image, not an element. Two copies of the same thing
// drift, so this reads both and refuses to let them.
const SKILL = new URL('../../.claude/skills/blueworx-admin-design/', import.meta.url);
const ICONS_PHP = readFileSync(new URL('editor/php/v1/Icons.php', SKILL), 'utf8');
const ICONS_JS = readFileSync(new URL('assets/icons/lucide-icons.js', SKILL), 'utf8');

// "name" => '<path …/>',  — the PHP map.
function phpMenuIcons(php) {
  const body = php.slice(php.indexOf('const MENU_ICONS'), php.indexOf('];', php.indexOf('const MENU_ICONS')));
  const out = new Map();
  for (const m of body.matchAll(/'([a-z0-9-]+)'\s*=>\s*'([^']*)'/g)) out.set(m[1], m[2]);
  return out;
}

// "name": '<path …/>',  — the JS map. Stops at the alias map below it, whose
// values are plain names rather than geometry.
function jsIcons(js) {
  const body = js.slice(js.indexOf('lucideIcons'), js.indexOf('lucideAliases'));
  const out = new Map();
  for (const m of body.matchAll(/"([a-z0-9-]+)"\s*:\s*'([^']*)'/g)) out.set(m[1], m[2]);
  return out;
}

test('both maps were actually found', () => {
  assert.ok(phpMenuIcons(ICONS_PHP).size > 0, 'no menu icons parsed out of Icons.php');
  assert.ok(jsIcons(ICONS_JS).size > 20, 'no icon map parsed out of lucide-icons.js');
});

test('every menu icon exists in the design system, with identical geometry', () => {
  const menu = phpMenuIcons(ICONS_PHP);
  const icons = jsIcons(ICONS_JS);

  for (const [name, geometry] of menu) {
    assert.ok(icons.has(name), `Icons::MENU_ICONS has "${name}", which the design system does not ship`);
    assert.equal(
      geometry,
      icons.get(name),
      `"${name}" has drifted: the menu copy and the design system's copy are different shapes`,
    );
  }
});
