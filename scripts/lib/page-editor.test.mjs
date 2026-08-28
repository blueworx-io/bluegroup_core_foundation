import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pe = require('../../.claude/skills/blueworx-admin-design/editor/blueworx-page-editor.js');

const schema = {
  tabs: [
    { id: 'details', label: 'Details', panels: [
      { id: 'basics', title: 'Basics', fields: [
        { id: 'name', kind: 'text', label: 'Name' },
        { id: 'announce', kind: 'toggle', label: 'Show the announcement bar' },
        { id: 'announce_text', kind: 'text', label: 'Announcement', depends_on: { field: 'announce', value: true } },
      ] },
    ] },
    { id: 'media', label: 'Media', panels: [
      { id: 'images', title: 'Images', fields: [{ id: 'header', kind: 'media', label: 'Header image' }] },
    ] },
  ],
};

test('isDirty: identical records are clean', () => {
  assert.equal(pe.isDirty({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] }), false);
});

test('isDirty: a changed value is dirty', () => {
  assert.equal(pe.isDirty({ a: 1 }, { a: 2 }), true);
});

test('isDirty: a reordered repeater is dirty', () => {
  assert.equal(pe.isDirty({ r: [{ d: 'Mon' }, { d: 'Tue' }] }, { r: [{ d: 'Tue' }, { d: 'Mon' }] }), true);
});

test('dependencyMet: a field with no dependency always applies', () => {
  assert.equal(pe.dependencyMet({ id: 'name' }, {}), true);
});

test('dependencyMet: a dependent field applies only while its condition holds', () => {
  const field = { id: 'announce_text', depends_on: { field: 'announce', value: true } };
  assert.equal(pe.dependencyMet(field, { announce: false }), false);
  assert.equal(pe.dependencyMet(field, { announce: true }), true);
});

test('visibleFields: drops fields whose condition is false', () => {
  const panel = schema.tabs[0].panels[0];
  assert.deepEqual(pe.visibleFields(panel, { announce: false }).map((f) => f.id), ['name', 'announce']);
  assert.deepEqual(pe.visibleFields(panel, { announce: true }).map((f) => f.id), ['name', 'announce', 'announce_text']);
});

test('visibleFields: omits a panel-switch field', () => {
  const panel = { id: 'basics', fields: [
    { id: 'name', kind: 'text' },
    { id: 'basics__shown', kind: 'toggle', panel_switch: true },
  ] };
  assert.deepEqual(pe.visibleFields(panel, {}).map((f) => f.id), ['name']);
});

test('dependencyMet: a string-valued dependency compares as strings', () => {
  const field = { id: 'extra', depends_on: { field: 'side', value: 'away' } };
  assert.equal(pe.dependencyMet(field, { side: 'home' }), false);
  assert.equal(pe.dependencyMet(field, { side: 'away' }), true);
});

test('dependencyMet: a numeric value from the server satisfies a declared string', () => {
  const field = { id: 'extra', depends_on: { field: 'tier', value: '1' } };
  assert.equal(pe.dependencyMet(field, { tier: 1 }), true);
});

test('tabCount: counts the panels in the tab, not the fields', () => {
  assert.equal(pe.tabCount(schema.tabs[0], {}), 1);
});

test('countLabel: an empty group reads "empty", never "0"', () => {
  assert.equal(pe.countLabel(0), 'empty');
  assert.equal(pe.countLabel(3), '3');
});

test('dirtyTabs: names the tab a change is in', () => {
  const tabs = pe.dirtyTabs(schema, { name: 'Rugby', header: 1 }, { name: 'Hockey', header: 1 });
  assert.deepEqual(tabs, ['Details']);
});

test('firstErrorTab: finds the tab holding the first bad field', () => {
  assert.equal(pe.firstErrorTab(schema, { header: 'Pick an image.' }), 'media');
});

test('firstErrorTab: returns null when nothing is wrong', () => {
  assert.equal(pe.firstErrorTab(schema, {}), null);
});
