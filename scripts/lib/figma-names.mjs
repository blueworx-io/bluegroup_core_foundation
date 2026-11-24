// Figma names: a client's Figma file must use exactly the theme's names for
// colours, fonts, sizes, spacing and corners. In Figma they are variables named
// color/primary, space/4; in the theme they are --color-primary, --space-4.
// This compares the two and lists what is missing, extra or misnamed. Pure
// logic (plus one fetch you can swap out) — the CLI in check-figma-names.mjs
// reads the files.
//
// The rule is in CLAUDE.md.template, "Client Figma files". A Figma name turns
// into its theme name by changing every "/" to "-" and putting "--" in front,
// so color/text/muted and color/text-muted are both --color-text-muted. A
// name is only right when it comes out as a name the theme has.

import { declarations } from './section-styles.mjs';

// The theme's groups, as they start a name: --color-*, --font-*, --text-* (sizes),
// --space-*, --radius-* (corners). The same --font-*, --text-* and --color-*
// the section styles check allows.
export const THEME_GROUPS = ['color', 'font', 'text', 'space', 'radius'];

const THEME_NAME = new RegExp(`^--(?:${THEME_GROUPS.join('|')})-[A-Za-z0-9_-]+$`);

// Names a designer is likely to type for a group, so a near miss can say what
// the right name is. Only used to suggest — they are never accepted.
const GROUP_ALIASES = new Map([
  ['colour', 'color'], ['colours', 'color'], ['colors', 'color'],
  ['fonts', 'font'],
  ['size', 'text'], ['sizes', 'text'], ['texts', 'text'],
  ['spacing', 'space'], ['spaces', 'space'],
  ['corner', 'radius'], ['corners', 'radius'], ['radii', 'radius'],
]);

// The colour, font, size, space and corner names a theme defines, from its
// stylesheets. files: [{ path, content }].
export function themeNames(files) {
  const names = new Set();
  for (const file of files) {
    if (!/\.(?:css|scss|pcss)$/i.test(file.path)) continue;
    const scss = /\.(?:scss|pcss)$/i.test(file.path);
    for (const d of declarations(file.content, { scss })) {
      if (THEME_NAME.test(d.prop)) names.add(d.prop);
    }
    // A name registered with @property (--space-4 and its initial value) is a
    // name the theme defines too.
    let code = file.content.replace(/\/\*[\s\S]*?\*\//g, ' ');
    if (scss) code = code.replace(/(^|\s)\/\/[^\n]*/g, '$1');
    for (const m of code.matchAll(/@property\s+(--[A-Za-z0-9_-]+)/g)) {
      if (THEME_NAME.test(m[1])) names.add(m[1]);
    }
  }
  return [...names].sort();
}

// --color-primary -> color/primary
const figmaForm = (cssName) => cssName.slice(2).replace('-', '/');
// color/text/muted -> --color-text-muted
const cssForm = (figmaName) => `--${figmaName.replace(/\//g, '-')}`;
// The group starts the name, then a slash: color-primary is not color/primary.
const startsWithGroup = (figmaName) => THEME_GROUPS.includes(figmaName.split('/')[0]) && figmaName.includes('/');

// What a name boils down to once case, separators and a group's other spellings
// are ignored: Colour/Primary Dark, color-primaryDark and color/primary-dark
// all boil down to color-primary-dark.
function looseKey(name) {
  const words = name
    .replace(/^--/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (words.length > 0) words[0] = GROUP_ALIASES.get(words[0]) ?? words[0];
  return words.join('-');
}

// The variable names in a Figma file, from any of:
//   - the answer to Figma's "local variables" request (what fetchFigmaVariables
//     returns), leaving out variables that come from another file's library;
//   - an exported tokens file, with groups nested: { color: { primary: { $value } } };
//   - a plain list of names, or of { name } objects.
// `collection` keeps only that collection's variables (the first kind only).
export function figmaNames(input, { collection = '' } = {}) {
  const names = new Set();
  const notVariables = () => new Error('That does not look like a file of Figma variables: expected a list of names, an exported tokens file, or Figma\'s local variables answer.');
  if (input === null || typeof input !== 'object') throw notVariables();
  // A saved error answer from Figma, such as {"error":true,"status":403}.
  if (!Array.isArray(input) && (input.error === true || (typeof input.error === 'string' && input.error !== ''))) {
    throw new Error(`That is an error answer from Figma${input.status ? ` (${input.status})` : ''}, not a file of variables.`);
  }

  if (Array.isArray(input)) {
    for (const item of input) {
      const name = typeof item === 'string' ? item : item?.name;
      if (typeof name === 'string' && name.trim() !== '') names.add(name);
    }
    return [...names].sort();
  }

  const meta = input.meta?.variables ? input.meta : input.variables && input.variableCollections ? input : null;
  if (meta) {
    const collections = meta.variableCollections ?? {};
    let wanted = null;
    if (collection) {
      const chosen = Object.entries(collections).filter(([, c]) => String(c?.name ?? '').toLowerCase() === collection.toLowerCase());
      // variableIds also lists the variables an extended collection inherits,
      // which still point at the collection they came from.
      wanted = { collections: new Set(chosen.map(([id]) => id)), variables: new Set(chosen.flatMap(([, c]) => c.variableIds ?? [])) };
      if (chosen.length === 0) {
        const have = Object.values(collections).map((c) => `"${c?.name}"`).join(', ') || 'none';
        throw new Error(`The Figma file has no variable collection called "${collection}". It has: ${have}.`);
      }
    }
    for (const [id, v] of Object.entries(meta.variables)) {
      if (!v || typeof v.name !== 'string' || v.deletedButReferenced) continue;
      if (wanted) {
        // A variable shared from a library belongs to the chosen collection when
        // that collection lists it (an extended collection inherits them).
        if (v.remote ? !wanted.variables.has(id) : !wanted.variables.has(id) && !wanted.collections.has(v.variableCollectionId)) continue;
      } else if (v.remote) {
        continue;
      }
      names.add(v.name);
    }
    return [...names].sort();
  }

  const walk = (node, path) => {
    for (const [key, child] of Object.entries(node)) {
      if (child === null || typeof child !== 'object') continue;
      // $root is a group's own variable (color/primary beside color/primary/hover).
      if (key === '$root') {
        if (path.length > 0 && '$value' in child) names.add(path.join('/'));
        continue;
      }
      if (key.startsWith('$')) continue;
      const here = [...path, key];
      // A variable has a $value; the older export has a plain value, which is
      // a number or text. A child named "value" is an object, so a group.
      const legacy = 'value' in child && (child.value === null || typeof child.value !== 'object');
      if ('$value' in child || legacy) names.add(here.join('/'));
      else walk(child, here);
    }
  };
  walk(input, []);
  return [...names].sort();
}

// The file key of a Figma link (figma.com/design/<key>/Name), or the key itself.
export function figmaKey(input) {
  const s = String(input).trim();
  // A branch has a key of its own: figma.com/design/<main key>/branch/<branch key>/Name.
  const branch = s.match(/figma\.com\/(?:design|file)\/[A-Za-z0-9]+\/branch\/([A-Za-z0-9]+)/);
  if (branch) return branch[1];
  const link = s.match(/figma\.com\/(?:design|file|board|make)\/([A-Za-z0-9]+)/);
  if (link) return link[1];
  if (/^[A-Za-z0-9]+$/.test(s)) return s;
  throw new Error(`"${s}" is not a Figma file key or link.`);
}

// Asks Figma for a file's local variables. Needs a token with the
// file_variables:read permission, and Figma only answers on an Enterprise plan;
// anyone else exports the variables to a file instead.
export async function fetchFigmaVariables({ key, token, fetchImpl = fetch }) {
  if (!token) throw new Error('Set FIGMA_TOKEN to a Figma access token to read a file, or pass an exported file with --figma instead.');
  const res = await fetchImpl(`https://api.figma.com/v1/files/${key}/variables/local`, { headers: { 'X-Figma-Token': token } });
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? `Figma could not find the file ${key} (404).`
        : `Figma refused to share the variables (${res.status}). Reading them needs a token with the file_variables:read permission on an Enterprise plan — export the variables to a file and pass it with --figma instead.`,
    );
  }
  return res.json();
}

// figma: the names in the Figma file. theme: the theme's names (--color-primary).
export function compareNames({ figma, theme }) {
  // Nothing on one side is still a failure, but the list of what to add (or
  // remove) is given all the same.
  const empty = figma.length === 0
    ? 'Figma names: found no variables in the Figma file. Check it is the right file, and that its colours, fonts and sizes are Figma variables.'
    : theme.length === 0
      ? 'Figma names: found no names in the theme (--color-*, --font-*, --text-*, --space-*, --radius-*). Point --theme at the theme\'s folder.'
      : '';

  const themeSet = new Set(theme);
  const claimed = new Set();
  const left = [];
  const extra = [];
  const seen = new Set();
  for (const name of figma) {
    if (seen.has(name)) continue;
    seen.add(name);
    const css = cssForm(name);
    const exact = startsWithGroup(name) && themeSet.has(css);
    if (exact && !claimed.has(css)) claimed.add(css);
    else if (exact) extra.push(name); // a second spelling of a name already used
    else left.push(name);
  }

  const byKey = new Map();
  for (const n of theme.filter((t) => !claimed.has(t))) byKey.set(looseKey(n), [...(byKey.get(looseKey(n)) ?? []), n]);

  // Two theme names can read alike (--color-primary-dark, --color-primary_dark).
  // A name that differs from one only in case is matched to it first, so a later
  // name does not take it; after that, a name with several candidates names them all.
  const found = new Map();
  const claim = (name, caseOnly) => {
    const candidates = byKey.get(looseKey(name)) ?? [];
    const closest = candidates.filter((c) => figmaForm(c).toLowerCase() === name.toLowerCase());
    if (caseOnly && closest.length === 0) return;
    if (!caseOnly && candidates.length === 0) return;
    const named = closest.length > 0 ? closest : candidates;
    found.set(name, named.map(figmaForm).join(' or '));
    byKey.set(looseKey(name), candidates.filter((c) => c !== named[0]));
    claimed.add(named[0]);
  };
  for (const name of left) claim(name, true);
  for (const name of left) if (!found.has(name)) claim(name, false);

  const misnamed = [];
  for (const name of left) {
    if (found.has(name)) misnamed.push({ figma: name, shouldBe: found.get(name) });
    else extra.push(name);
  }
  const missing = theme.filter((n) => !claimed.has(n)).map(figmaForm);
  extra.sort();

  const ok = !empty && missing.length === 0 && extra.length === 0 && misnamed.length === 0;
  if (ok) {
    return { ok, missing, extra, misnamed, message: `Figma names: all ${theme.length} theme names are in the Figma file, named exactly as the theme names them.` };
  }

  const count = missing.length + extra.length + misnamed.length;
  const lines = empty ? [empty] : [`Figma names: ${count} mismatch(es) between the Figma file and the theme.`];
  if (missing.length) {
    lines.push('', `Missing from Figma (the theme has them, the file does not) — ${missing.length}:`);
    for (const n of missing) lines.push(`  - ${n}  (the theme's ${cssForm(n)})`);
  }
  if (extra.length) {
    lines.push('', `Extra in Figma (the theme has no name for them) — ${extra.length}:`);
    for (const n of extra) lines.push(`  - ${n}`);
  }
  if (misnamed.length) {
    lines.push('', `Misnamed in Figma (rename to the theme's name) — ${misnamed.length}:`);
    for (const m of misnamed) lines.push(`  - ${m.figma} → ${m.shouldBe}`);
  }
  if (count > 0) {
    lines.push(
      '',
      'The theme\'s names are the only ones. Rename a Figma variable to the theme\'s name, or',
      'if the design needs something new, add the name to the theme first, then to Figma.',
    );
  }
  return { ok, missing, extra, misnamed, message: lines.join('\n') };
}
