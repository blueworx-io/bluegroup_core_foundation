// What the browser half actually draws, kind by kind.
//
// The schema's KINDS list and this file's controls are two halves of one
// closed list, and nothing was holding them together: a kind the schema
// accepted but the browser had no case for rendered as a bare text box that
// saved nonsense, and nobody found out. So the table below is read against
// Schema.php's own KINDS at run time — add a kind there and this fails until
// the browser draws it and the table says what it draws.
//
// Rendering happens against a fake wp.element rather than a browser: its
// createElement records the tree it is handed, and render() below walks that
// tree calling every function component it finds. No dependency, no build
// step, and the assertions are on element type and class, never on markup.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const schemaPhp = readFileSync(join(repo, '.claude/skills/blueworx-admin-design/editor/php/v1/Schema.php'), 'utf8');

// Pulls a `const NAME = [ 'a', 'b' ];` list straight out of the PHP, so the
// two halves are compared against one another rather than against a copy.
function phpConstList(name) {
  const block = schemaPhp.match(new RegExp(`const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  assert.ok(block, `Schema.php no longer declares ${name}`);
  return [...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

const KINDS = phpConstList('KINDS');
const REPEATER_KINDS = phpConstList('REPEATER_KINDS');

/* --- A wp.element with no browser under it --------------------------------- */

const element = {
  Fragment: 'Fragment',
  createElement(type, props, ...children) {
    return { type, props: props || {}, children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false) };
  },
  useState(initial) {
    return [typeof initial === 'function' ? initial() : initial, () => {}];
  },
  useRef(initial) {
    return { current: initial === undefined ? null : initial };
  },
  useEffect() {},
};

globalThis.wp = { element };

const pe = require('../../.claude/skills/blueworx-admin-design/editor/blueworx-page-editor.js');
const h = element.createElement;

// Calls every function component in the tree, so a control returned by a
// nested component (Control, ComplexControl, Repeater, Tokens) is really in
// the result rather than sitting unevaluated as a function reference.
function render(node) {
  if (node === null || typeof node !== 'object') return node;
  if (typeof node.type === 'function') {
    return render(node.type(Object.assign({}, node.props, node.children.length ? { children: node.children } : {})));
  }
  return { type: node.type, props: node.props, children: node.children.map(render) };
}

function walk(node, visit) {
  if (node === null || typeof node !== 'object') return;
  visit(node);
  (node.children || []).forEach((child) => walk(child, visit));
}

function hasControl(tree, type, className) {
  let found = false;
  walk(tree, (node) => {
    if (node.type !== type) return;
    const classes = String(node.props.className || '').split(/\s+/);
    if (classes.indexOf(className) !== -1) found = true;
  });
  return found;
}

function textOf(tree) {
  const parts = [];
  walk(tree, (node) => {
    (node.children || []).forEach((child) => {
      if (typeof child === 'string') parts.push(child);
    });
  });
  return parts.join(' ');
}

const record = () => ({ values: {}, errors: {}, setValue() {} });

/* --- What each kind draws --------------------------------------------------- */

const DRAWS = {
  text: ['input', 'bw-input'],
  textarea: ['textarea', 'bw-textarea'],
  richtext: ['div', 'bw-richtext'],
  number: ['input', 'bw-input'],
  range: ['div', 'bw-range'],
  colour: ['div', 'bw-colorfield'],
  date: ['input', 'bw-input'],
  datetime: ['input', 'bw-input'],
  copytext: ['div', 'bw-copyfield'],
  select: ['select', 'bw-select__el'],
  radio: ['div', 'bw-radiogroup'],
  checkboxes: ['div', 'bw-radiogroup'],
  toggle: ['label', 'bw-switch'],
  tokens: ['div', 'bw-tokens'],
  scrolllist: ['div', 'bw-scrolllist'],
  media: ['div', 'bw-media'],
  file: ['div', 'bw-upload'],
  repeater: ['div', 'bw-repeater'],
  record: ['select', 'bw-select__el'],
  facts: ['dl', 'bw-dl'],
  table: ['table', 'bw-table'],
  gantt: ['div', 'bw-gantt'],
  title: ['input', 'bw-titleinput'],
  slug: ['div', 'bw-permalink'],
};

// The minimum a field of each kind needs to be drawable at all.
function fieldFor(kind) {
  const field = { id: 'f_' + kind, kind, label: 'A ' + kind, help: '', required: false, wide: false };
  if (['select', 'radio', 'checkboxes', 'scrolllist', 'record'].indexOf(kind) !== -1) {
    field.options = [{ value: 'a', label: 'A' }];
  }
  if (kind === 'repeater') field.fields = [{ id: 'cell', kind: 'text', label: 'Cell' }];
  if (kind === 'facts') field.rows = [{ label: 'Members', value: '318' }];
  if (kind === 'table') {
    field.columns = ['Day'];
    field.rows = [['Monday']];
  }
  return field;
}

test('every kind the schema accepts has a control the browser draws', () => {
  assert.deepEqual(
    KINDS.filter((kind) => !DRAWS[kind]),
    [],
    'Schema::KINDS has a kind this test does not know what the browser draws for',
  );
  assert.deepEqual(
    Object.keys(DRAWS).filter((kind) => KINDS.indexOf(kind) === -1),
    [],
    'this test expects a kind Schema::KINDS no longer has',
  );
});

for (const kind of KINDS) {
  test(`a ${kind} field renders its own control`, () => {
    const [type, className] = DRAWS[kind];
    const tree = render(h(pe.Field, { field: fieldFor(kind), record: record() }));
    assert.equal(hasControl(tree, type, className), true, `a ${kind} field drew no ${type}.${className}`);
  });
}

test('a number field is a number input, not a text box', () => {
  const tree = render(h(pe.Field, { field: fieldFor('number'), record: record() }));
  let type = null;
  walk(tree, (node) => {
    if (node.type === 'input' && String(node.props.className || '').indexOf('bw-input') !== -1) type = node.props.type;
  });
  assert.equal(type, 'number');
});

test('a field the user may not change is drawn disabled', () => {
  const field = Object.assign(fieldFor('text'), { readonly: true });
  const tree = render(h(pe.Field, { field, record: record() }));
  let disabled = false;
  walk(tree, (node) => {
    if (node.type === 'input' && node.props.disabled) disabled = true;
  });
  assert.equal(disabled, true);
});

/* --- Repeater cells --------------------------------------------------------- */

// What each cell kind must actually draw. Read against Schema.php's own
// REPEATER_KINDS below, so widening that list fails here until Repeater() has
// a case for the new kind — which is the whole reason the list is narrow.
const CELL_CONTROLS = {
  text: (node) => node.type === 'input' && node.props.type === 'text',
  number: (node) => node.type === 'input' && node.props.type === 'number',
  textarea: (node) => node.type === 'textarea',
  select: (node) => node.type === 'select',
  toggle: (node) => node.type === 'input' && node.props.type === 'checkbox',
  media: (node) => node.type === 'button' && String(node.props.className || '').indexOf('bw-btn') !== -1,
};

test('every kind legal as a repeater cell renders its own control in the row', () => {
  const missing = REPEATER_KINDS.filter((kind) => !CELL_CONTROLS[kind]);
  assert.deepEqual(missing, [], 'a kind was added to REPEATER_KINDS with no control expected for it here');

  REPEATER_KINDS.forEach((kind) => {
    const field = {
      id: 'sessions',
      kind: 'repeater',
      label: 'Sessions',
      fields: [{ id: 'cell', kind, label: 'A ' + kind, options: [{ value: 'a', label: 'A' }] }],
    };
    const tree = render(h(pe.Repeater, { field, value: [{}], onChange() {} }));

    let found = false;
    walk(tree, (node) => {
      if (CELL_CONTROLS[kind](node)) found = true;
    });
    assert.ok(found, `a ${kind} cell draws no control of its own — it would render as a text box and save whatever was typed`);
  });
});

/* --- Suggestions ------------------------------------------------------------ */

test('a text field offering suggestions renders a datalist the input points at', () => {
  const field = {
    id: 'href',
    kind: 'text',
    label: 'Link',
    suggestions: [{ value: '/about/', label: 'About' }],
  };
  const tree = render(h(pe.Field, { field, record: { values: { href: '' }, errors: {}, setValue() {} } }));

  let input = null;
  let list = null;
  walk(tree, (node) => {
    if (node.type === 'input') input = node;
    if (node.type === 'datalist') list = node;
  });

  assert.ok(list, 'no datalist rendered');
  assert.ok(input, 'no input rendered');
  assert.equal(input.props.list, list.props.id, 'the input does not point at the list');
  assert.equal(list.children.length, 1);
});

test('a text field with no suggestions renders no datalist and no list attribute', () => {
  const field = { id: 'name', kind: 'text', label: 'Name' };
  const tree = render(h(pe.Field, { field, record: { values: { name: '' }, errors: {}, setValue() {} } }));

  let input = null;
  let list = null;
  walk(tree, (node) => {
    if (node.type === 'input') input = node;
    if (node.type === 'datalist') list = node;
  });

  assert.equal(list, null);
  assert.equal(input.props.list, undefined);
});

test('a repeater text cell offers its suggestions too', () => {
  const field = {
    id: 'tiles',
    kind: 'repeater',
    label: 'Tiles',
    fields: [{ id: 'href', kind: 'text', label: 'Link', suggestions: [{ value: '/about/', label: 'About' }] }],
  };
  const tree = render(h(pe.Repeater, { field, value: [{}], onChange() {} }));

  let input = null;
  let list = null;
  walk(tree, (node) => {
    if (node.type === 'input') input = node;
    if (node.type === 'datalist') list = node;
  });

  assert.ok(list, 'no datalist in the row');
  assert.equal(input.props.list, list.props.id);
});

/* --- The conditional field's note ------------------------------------------- */

test('a conditional field names its dependency even when that field is on another tab', () => {
  const schema = {
    tabs: [
      { id: 'a', label: 'A', panels: [{ id: 'p1', title: 'One', fields: [{ id: 'announce', kind: 'toggle', label: 'Announcement bar' }] }] },
      {
        id: 'b',
        label: 'B',
        panels: [{
          id: 'p2',
          title: 'Two',
          fields: [{ id: 'banner', kind: 'text', label: 'Banner text', depends_on: { field: 'announce', value: true } }],
        }],
      },
    ],
  };
  const rec = Object.assign(record(), { schema, values: { announce: true } });
  const tree = render(h(pe.Panel, { panel: schema.tabs[1].panels[0], record: rec }));

  assert.equal(hasControl(tree, 'div', 'bw-conditional'), true);
  assert.match(textOf(tree), /Announcement bar/, 'the note must name the field, not print its raw id');
});
