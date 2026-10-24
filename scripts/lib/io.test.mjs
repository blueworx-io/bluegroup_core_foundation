import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashFile, hashTree, readTextFiles, findThemeStylesheet, parsePhpHeaderVersion } from './io.mjs';

const scratch = () => mkdtempSync(join(tmpdir(), 'io-test-'));

test('hashFile: returns null for a file that does not exist', () => {
  assert.equal(hashFile(join(scratch(), 'nope.css')), null);
});

test('hashFile: is stable and content-sensitive', () => {
  const dir = scratch();
  writeFileSync(join(dir, 'a.css'), 'body {}');
  writeFileSync(join(dir, 'b.css'), 'body {}');
  writeFileSync(join(dir, 'c.css'), 'body { color: red }');
  assert.equal(hashFile(join(dir, 'a.css')), hashFile(join(dir, 'b.css')));
  assert.notEqual(hashFile(join(dir, 'a.css')), hashFile(join(dir, 'c.css')));
});

test('hashFile: ignores CRLF vs LF in text files', () => {
  const dir = scratch();
  writeFileSync(join(dir, 'a.md'), '# Title\nline two\n');
  writeFileSync(join(dir, 'b.md'), '# Title\r\nline two\r\n');
  assert.equal(hashFile(join(dir, 'a.md')), hashFile(join(dir, 'b.md')));
});

test('hashTree: returns null for a directory that does not exist', () => {
  assert.equal(hashTree(join(scratch(), 'nope')), null);
});

test('hashTree: keys are forward-slash paths relative to the root', () => {
  const dir = scratch();
  mkdirSync(join(dir, 'components'));
  writeFileSync(join(dir, 'SKILL.md'), 'front matter');
  writeFileSync(join(dir, 'components', 'button.md'), 'button');
  const hashes = hashTree(dir);
  assert.deepEqual([...hashes.keys()].sort(), ['SKILL.md', 'components/button.md']);
});

test('hashTree: two identical trees hash identically', () => {
  const one = scratch();
  const two = scratch();
  for (const dir of [one, two]) {
    mkdirSync(join(dir, 'components'));
    writeFileSync(join(dir, 'SKILL.md'), 'front matter');
    writeFileSync(join(dir, 'components', 'button.md'), 'button');
  }
  assert.deepEqual([...hashTree(one).entries()], [...hashTree(two).entries()]);
});

test('readTextFiles: returns repo-relative paths and skips vendored trees', () => {
  const dir = mkdtempSync(join(tmpdir(), 'io-test-'));
  mkdirSync(join(dir, 'includes'), { recursive: true });
  mkdirSync(join(dir, 'node_modules', 'x'), { recursive: true });
  writeFileSync(join(dir, 'includes', 'admin.php'), '<?php // admin');
  writeFileSync(join(dir, 'node_modules', 'x', 'ignore.php'), '<?php // vendored');

  const files = readTextFiles(dir, ['.php']);
  assert.deepEqual(files.map((f) => f.path), ['includes/admin.php']);
  assert.match(files[0].content, /admin/);
});

test('findThemeStylesheet: finds a root style.css that declares "Theme Name:"', () => {
  const dir = scratch();
  writeFileSync(join(dir, 'style.css'), '/*\nTheme Name: BlueWorx\nVersion: 2.0.0\n*/\n');
  assert.equal(findThemeStylesheet(dir), 'style.css');
});

test('findThemeStylesheet: null without a style.css, or one with no theme header', () => {
  assert.equal(findThemeStylesheet(scratch()), null);
  const dir = scratch();
  writeFileSync(join(dir, 'style.css'), 'body { color: red }');
  assert.equal(findThemeStylesheet(dir), null);
});

test('findThemeStylesheet: ignores a style.css nested below the root', () => {
  const dir = scratch();
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'style.css'), '/*\nTheme Name: Nested\n*/');
  assert.equal(findThemeStylesheet(dir), null);
});

test('parsePhpHeaderVersion: reads the Version line of a theme style.css', () => {
  const css = [
    '/*',
    'Theme Name: BlueWorx',
    'Requires PHP: 8.0',
    'Version: 2.0.0',
    'Text Domain: blueworx-labs-wordpress',
    '*/',
  ].join('\r\n');
  assert.equal(parsePhpHeaderVersion(css), '2.0.0');
});
