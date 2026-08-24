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

// The system documents two kinds of `bw-` class: ones it declares rules for in
// styles.css, and hook classes it only ever names in the readme's copy-paste
// markup, for a plugin's own chrome override to attach to (e.g. `bw-wrap`,
// paired with `.wrap.bw-wrap { margin: 0; }`). Both are part of the system's
// vocabulary — only the second kind has no CSS rule of its own — so a
// `bw-`-prefixed class named in the readme's markup counts as known even
// though styles.css never declares it. Reuses classesOn's guard against a
// templated class (containing `${}<>`) so a code sample is never absorbed
// into the allowlist.
function parseMarkupClasses(markup) {
  const out = new Set();
  for (const m of markup.matchAll(/class(?:Name)?\s*=\s*["']([^"']*)["']/g)) {
    for (const cls of m[1].split(/\s+/)) {
      if (cls && cls.startsWith('bw-') && !/[${}<>]/.test(cls)) out.add(cls);
    }
  }
  return out;
}

export function vocabulary({ css, manifest, markup = '' }) {
  const classes = parseClasses(css);
  for (const cls of parseMarkupClasses(markup)) classes.add(cls);
  return {
    tokens: parseTokens(css),
    classes,
    components: parseComponents(manifest),
  };
}
