// The design system's own vocabulary, read out of the files a plugin already
// carries. The adherence check never hard-codes a list of valid classes or
// tokens: the system gains components over time, and a hand-copied list goes
// stale without anyone noticing. Pure — the CLI does the reading.

// Strip CSS comments before parsing so class-like or token-like text inside
// comments does not widen the allowlist. A comment naming a deprecated class
// (e.g. `/* old: .bw-legacy */`) must not let that class pass the check.
function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

// `--bw-brand: #4F46E5;` -> '--bw-brand'. Declarations only; a var() use is
// not a declaration and must not widen the allowlist.
export function parseTokens(css) {
  const out = new Set();
  const cleaned = stripCssComments(css);
  for (const m of cleaned.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) out.add(m[1]);
  return out;
}

// `.bw-btn--primary{` -> 'bw-btn--primary'. Requires a letter or underscore
// after the dot, so `.05` and `.2s` in a value are not read as classes.
export function parseClasses(css) {
  const out = new Set();
  const cleaned = stripCssComments(css);
  for (const m of cleaned.matchAll(/\.([a-zA-Z_][a-zA-Z0-9_-]*)/g)) out.add(m[1]);
  return out;
}

export function parseComponents(manifest) {
  const out = new Set();
  for (const c of manifest?.components ?? []) {
    if (c?.name) out.add(c.name);
  }
  return out;
}

export function vocabulary({ css, manifest }) {
  return {
    tokens: parseTokens(css),
    classes: parseClasses(css),
    components: parseComponents(manifest),
  };
}
