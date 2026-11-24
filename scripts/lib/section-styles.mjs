// Section styles: a section's look must come from the theme's named styles
// (var(--color-primary), var(--font-heading), var(--text-lead)), never from a
// colour, font or size typed into the section itself. Pure logic only — the
// CLI in check-section-styles.mjs reads the files.
//
// What counts as a section file: a stylesheet (.css/.scss) or render.php under
// a blocks/ folder. In those files we judge, per declaration:
//
//   - colours: a hex, rgb()/hsl()/oklch()-style or named colour anywhere,
//   - fonts: font-family, and the font shorthand, must be a --font-* name,
//   - sizes: font-size must be a --text-* name (calc() of those is fine),
//   - a section never defines a theme name of its own (--color-x: #fff).
//
// A var() fallback — var(--color-surface, #f4f6fa) — is left alone: it is how
// the worked example runs on a site with no theme, and the name is still the
// theme's. The old BlueWorx plugin's one file of theme names sits outside
// blocks/, so it is never judged; SECTION_NAMES_FILE exempts it if it doesn't.

const NAMED_COLOURS = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown ' +
    'burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan ' +
    'darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid ' +
    'darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet ' +
    'deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ' +
    'ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki ' +
    'lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow ' +
    'lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
    'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine ' +
    'mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise ' +
    'mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab ' +
    'orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru ' +
    'pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown ' +
    'seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan ' +
    'teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'
  ).split(' '),
);

// Properties whose value can be a colour, so a bare colour word (red) in them
// is a colour. Hex and colour functions are caught in every property.
const COLOUR_PROPERTY = /^(?:--[\w-]+|color|background(?:-color|-image)?|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-color)?|outline(?:-color)?|fill|stroke|stop-color|flood-color|lighting-color|box-shadow|text-shadow|text-decoration(?:-color)?|text-emphasis(?:-color)?|caret-color|accent-color|column-rule(?:-color)?|scrollbar-color|filter|drop-shadow|-webkit-text-(?:fill|stroke)(?:-color)?|-webkit-tap-highlight-color)$/i;

const COLOUR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(/i;
const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})(?![0-9a-z_-])/i;
const CSS_WIDE = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer']);
const COLOUR_WORD_OK = new Set(['transparent', 'currentcolor', 'none', 'auto', ...CSS_WIDE]);

// Theme-name families a section may only use, never define.
const THEME_NAME = /^--(?:color|font|text)-/i;

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

// Removes every `name( ... )` call from `value`, respecting nested brackets.
// With `keepArgs` the arguments stay (so calc(var(--text-a) * 2) can be read
// through) and only the wrapper goes.
function removeCalls(value, name, { keepArgs = false } = {}) {
  const re = new RegExp(`${name}\\s*\\(`, 'gi');
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(value)) !== null) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < value.length && depth > 0) {
      if (value[i] === '(') depth += 1;
      else if (value[i] === ')') depth -= 1;
      i += 1;
    }
    out += value.slice(last, m.index);
    if (keepArgs) out += ` ${value.slice(re.lastIndex, depth === 0 ? i - 1 : i)} `;
    last = i;
    re.lastIndex = i;
  }
  return out + value.slice(last);
}

// The value with strings, urls and var() calls (fallbacks included) taken out,
// so what is left is only what the section typed itself.
function typed(value, { strings = false } = {}) {
  let v = value.replace(/!important/gi, ' ');
  if (!strings) v = v.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, ' ');
  v = removeCalls(v, 'url');
  v = removeCalls(v, 'var');
  return v.trim();
}

function varNames(value) {
  return [...value.matchAll(/var\(\s*(--[\w-]+)/gi)].map((m) => m[1].toLowerCase());
}

// Judges one declaration, returning a plain-words problem or null.
export function judgeDeclaration(prop, rawValue) {
  const property = prop.trim().toLowerCase();
  const value = rawValue.trim();
  const rest = typed(value);

  // A theme name defined inside a section: only the theme (or the old
  // plugin's one names file) defines those.
  if (THEME_NAME.test(property) && varNames(value).length === 0) {
    return `defines ${property} itself — a section uses the theme's names and never defines them`;
  }

  // Colours.
  if (HEX.test(rest)) return `a typed-in colour (${rest.match(HEX)[0]}) — use a theme colour such as var(--color-primary)`;
  const fn = removeCalls(rest, 'color-mix', { keepArgs: true });
  if (COLOUR_FUNCTION.test(fn)) {
    // rgb(from var(--color-primary) r g b / 50%) reads a theme colour; the
    // var() is gone from `fn`, so check the original text for it.
    const reads = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(\s*from\b/i.test(value) && varNames(value).length > 0;
    if (!reads) return `a typed-in colour (${fn.match(COLOUR_FUNCTION)[0]}…) — use a theme colour such as var(--color-primary)`;
  }
  if (COLOUR_PROPERTY.test(property)) {
    for (const word of fn.toLowerCase().match(/[a-z]+/g) ?? []) {
      if (NAMED_COLOURS.has(word) && !COLOUR_WORD_OK.has(word)) {
        return `a typed-in colour (${word}) — use a theme colour such as var(--color-primary)`;
      }
    }
  }

  // Fonts.
  if (property === 'font-family' || property === 'font') {
    const words = typed(value, { strings: true }).replace(/[,\s]+/g, ' ').trim();
    if (words === '' || CSS_WIDE.has(words.toLowerCase())) {
      return varNames(value).every((n) => n.startsWith('--font-')) ? null : 'a font that is not one of the theme\'s --font-* names';
    }
    if (property === 'font-family') return `a typed-in font (${words}) — use a theme font such as var(--font-heading)`;
    return 'the font shorthand types a font and size in — use font-family and font-size with the theme\'s names';
  }

  // Sizes.
  if (property === 'font-size') {
    const names = varNames(value);
    if (names.some((n) => !n.startsWith('--text-'))) return 'a size that is not one of the theme\'s --text-* names';
    // What is left once the theme names and the sums between them are removed:
    // nothing, or a keyword like inherit. Anything else is a typed-in size.
    const left = removeCalls(rest, '(?:calc|clamp|min|max)', { keepArgs: true })
      .replace(/[()*/+,\-\s]/g, ' ')
      .replace(/\b\d*\.?\d+\b/g, ' ')
      .trim();
    if (CSS_WIDE.has(left.toLowerCase())) return null;
    if (left === '' && (names.length > 0 || rest === '0')) return null;
    return `a typed-in size (${rest || value}) — use a theme size such as var(--text-lead)`;
  }

  return null;
}

// Every `property: value` in a piece of CSS, with its line number.
export function declarations(css, lineOffset = 0) {
  const clean = stripComments(css);
  const out = [];
  const re = /([\w-]+)\s*:\s*([^;{}]+?)\s*(?=;|\}|$)/g;
  let m;
  while ((m = re.exec(clean)) !== null) {
    const line = clean.slice(0, m.index).split('\n').length + lineOffset;
    if (m[2].trim() !== '') out.push({ prop: m[1], value: m[2], line });
  }
  return out;
}

// CSS carried inside a render.php: <style> blocks, style="" attributes and
// SVG paint attributes. PHP tags are blanked first, so a value that comes from
// code is never mistaken for a typed-in one.
export function phpStyles(php) {
  const src = php.replace(/<\?(?:php|=)[\s\S]*?\?>/g, (tag) => tag.replace(/[^\n]/g, ' '));
  const out = [];
  const lineAt = (index) => src.slice(0, index).split('\n').length - 1;
  for (const m of src.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    out.push(...declarations(m[1], lineAt(m.index + m[0].indexOf(m[1]))));
  }
  for (const m of src.matchAll(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    out.push(...declarations(m[1] ?? m[2], lineAt(m.index)));
  }
  for (const m of src.matchAll(/\b(fill|stroke|stop-color|flood-color|lighting-color|bgcolor)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    out.push({ prop: m[1].toLowerCase() === 'bgcolor' ? 'background-color' : m[1], value: m[2] ?? m[3], line: lineAt(m.index) + 1 });
  }
  return out;
}

// Files this check judges: stylesheets and render.php under a blocks/ folder.
export function isSectionFile(path) {
  const p = path.replace(/\\/g, '/');
  if (!/(?:^|\/)blocks\//.test(p)) return false;
  if (/(?:^|\/)(?:node_modules|vendor|build)\//.test(p)) return false;
  return /\.(?:css|scss|pcss)$/i.test(p) || /(?:^|\/)render\.php$/i.test(p);
}

// files: [{ path, content }]. namesFile: the old plugin's one file of theme
// names, if it lives under blocks/ and so would otherwise be judged.
export function sectionStyles({ files, namesFile = '' }) {
  const names = namesFile.replace(/\\/g, '/').replace(/^\.\//, '');
  const judged = files.filter((f) => isSectionFile(f.path) && f.path.replace(/\\/g, '/') !== names);
  const problems = [];
  for (const file of judged) {
    const found = /\.php$/i.test(file.path) ? phpStyles(file.content) : declarations(file.content);
    for (const d of found) {
      const why = judgeDeclaration(d.prop, d.value);
      if (why) problems.push(`${file.path}:${d.line} — ${d.prop}: ${d.value.trim().replace(/\s+/g, ' ')} → ${why}`);
    }
  }

  if (judged.length === 0) {
    return { ok: true, problems, message: 'Section styles: no section stylesheets or render files to judge.' };
  }
  if (problems.length === 0) {
    return { ok: true, problems, message: `Section styles: ${judged.length} section file(s) use only the theme's colours, fonts and sizes.` };
  }
  const message = [
    `Section styles: ${problems.length} typed-in colour, font or size in a section.`,
    ...problems.map((p) => `  - ${p}`),
    '',
    'A section looks the way the theme says. Use its names: var(--color-primary),',
    'var(--font-heading), var(--text-lead). If the theme has no name for what the',
    'design needs, add the name to the theme (and the design file) first, then use it.',
  ].join('\n');
  return { ok: false, problems, message };
}
