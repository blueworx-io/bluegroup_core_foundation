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
// A fallback inside the var() of a theme name — var(--color-surface, #f4f6fa) —
// is left alone: it is how the worked example runs on a site with no theme, and
// the name is still the theme's. A fallback on any other variable is judged.
// The old BlueWorx plugin's one file of theme names sits outside
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
const COLOUR_PROPERTY = /^(?:--[\w-]+|[$@][\w-]+|color|background(?:-color|-image)?|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-color)?|border-image(?:-source)?|outline(?:-color)?|fill|stroke|stop-color|flood-color|lighting-color|box-shadow|text-shadow|text-decoration(?:-color)?|text-emphasis(?:-color)?|caret-color|accent-color|column-rule(?:-color)?|scrollbar-color|filter|drop-shadow|-webkit-text-(?:fill|stroke)(?:-color)?|-webkit-tap-highlight-color)$/i;

const COLOUR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(/gi;
const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})(?![0-9a-z_-])/i;
const CSS_WIDE = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer']);
const COLOUR_WORD_OK = new Set(['transparent', 'currentcolor', 'none', 'auto', ...CSS_WIDE]);

// Theme-name families a section may only use, never define.
const THEME_NAME = /^--(?:color|font|text)-/i;

// Stand-ins for a var() of a theme name once it has been read: a theme colour,
// and any other theme name.
const THEME_COLOUR = '__TC__';
const THEME_OTHER = '__TV__';
const THEME_TOKENS = /__T[CV]__/g;

// Index just past the bracket that closes the one opened right before `from`.
function closeOf(value, from) {
  let depth = 1;
  let i = from;
  while (i < value.length && depth > 0) {
    if (value[i] === '(') depth += 1;
    else if (value[i] === ')') depth -= 1;
    i += 1;
  }
  return i;
}

// Removes every `name( ... )` call from `value`, respecting nested brackets.
function removeCalls(value, name) {
  const re = new RegExp(`${name}\\s*\\(`, 'gi');
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(value)) !== null) {
    const end = closeOf(value, re.lastIndex);
    out += value.slice(last, m.index);
    last = end;
    re.lastIndex = end;
  }
  return out + value.slice(last);
}

// Reads the var() calls in a value. A var() of a theme name becomes a token and
// its fallback is left unread — the name is still the theme's. A var() of any
// other name is replaced by its fallback, so a typed-in value hiding behind an
// unrelated variable is still seen. `names` are the variables the value reads.
function readVars(value, names = []) {
  const re = /\bvar\s*\(/gi;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(value)) !== null) {
    const end = closeOf(value, re.lastIndex);
    const inner = value.slice(re.lastIndex, end - 1);
    const comma = inner.indexOf(',');
    const name = (comma === -1 ? inner : inner.slice(0, comma)).trim().toLowerCase();
    names.push(name);
    out += value.slice(last, m.index);
    if (THEME_NAME.test(name)) out += ` ${name.startsWith('--color-') ? THEME_COLOUR : THEME_OTHER} `;
    else if (comma !== -1) out += ` ${readVars(inner.slice(comma + 1), names).text} `;
    last = end;
    re.lastIndex = end;
  }
  return { text: out + value.slice(last), names };
}

// What the section typed itself: the value with urls, !important and (unless
// asked to keep them) strings taken out, and its var() calls read.
function typed(value, { strings = false } = {}) {
  let v = value.replace(/!important/gi, ' ');
  if (!strings) v = v.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, ' ');
  v = removeCalls(v, 'url');
  const { text, names } = readVars(v);
  return { rest: text.trim(), names };
}

// Colour functions in `text`, outermost only: rgb(255 0 0), oklch(...).
function colourCalls(text) {
  const re = new RegExp(COLOUR_FUNCTION.source, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const end = closeOf(text, re.lastIndex);
    out.push({ name: m[0], body: text.slice(re.lastIndex, end - 1) });
    re.lastIndex = end;
  }
  return out;
}

// A hard-coded colour function in `text`, as a plain-words problem, or null.
// rgb(from var(--color-primary) r g b / 50%) reads a theme colour and passes,
// but only the source: any colour written inside it is judged too.
function colourFunctionProblem(text) {
  for (const call of colourCalls(text)) {
    if (/^\s*from\b/i.test(call.body) && call.body.includes(THEME_COLOUR)) {
      const inner = colourFunctionProblem(call.body);
      if (inner) return inner;
      continue;
    }
    return `a typed-in colour (${call.name.trim()}…) — use a theme colour such as var(--color-primary)`;
  }
  return null;
}

// The bodies of gradient functions in `text`: colours in them are colours in
// any property (list-style-image, mask-image), not only in the usual ones.
function gradientBodies(text) {
  const re = /\b(?:repeating-)?(?:linear|radial|conic)-gradient\s*\(/gi;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const end = closeOf(text, re.lastIndex);
    out.push(text.slice(re.lastIndex, end - 1));
    re.lastIndex = end;
  }
  return out.join(' ');
}

// Judges one declaration, returning a plain-words problem or null.
export function judgeDeclaration(prop, rawValue) {
  const property = prop.trim().toLowerCase();
  const value = rawValue.trim();
  const { rest, names } = typed(value);
  const left = rest.replace(THEME_TOKENS, ' ').trim();

  // A theme name defined inside a section: only the theme (or the old
  // plugin's one names file) defines those, and a section only ever makes one
  // another name in the same family (--color-x from --color-y).
  const family = property.match(THEME_NAME)?.[0];
  if (family && (names.length === 0 || left !== '' || names.some((n) => !n.startsWith(family)))) {
    return `defines ${property} itself — a section uses the theme's names and never defines them`;
  }

  // Colours.
  if (HEX.test(rest)) return `a typed-in colour (${rest.match(HEX)[0]}) — use a theme colour such as var(--color-primary)`;
  const call = colourFunctionProblem(rest);
  if (call) return call;
  // Whole words only: fade-to-black is an animation name, not a colour.
  const scanned = COLOUR_PROPERTY.test(property) ? rest : gradientBodies(rest);
  for (const word of scanned.toLowerCase().match(/(?<![\w#$@.-])-?[a-z_][\w-]*/g) ?? []) {
    if (NAMED_COLOURS.has(word) && !COLOUR_WORD_OK.has(word)) {
      return `a typed-in colour (${word}) — use a theme colour such as var(--color-primary)`;
    }
  }

  // Fonts.
  if (property === 'font-family' || property === 'font') {
    const fontRest = typed(value, { strings: true }).rest;
    const words = fontRest.replace(THEME_TOKENS, ' ').replace(/[,\s]+/g, ' ').trim();
    if (words === '' || CSS_WIDE.has(words.toLowerCase())) {
      return names.every((n) => n.startsWith('--font-')) ? null : 'a font that is not one of the theme\'s --font-* names';
    }
    if (property === 'font-family') return `a typed-in font (${words}) — use a theme font such as var(--font-heading)`;
    return 'the font shorthand types a font and size in — use font-family and font-size with the theme\'s names';
  }

  // Sizes.
  if (property === 'font-size') {
    if (names.some((n) => !n.startsWith('--text-'))) return 'a size that is not one of the theme\'s --text-* names';
    // What is left once the theme names and the sums between them are removed:
    // nothing, or a keyword like inherit. Anything else is a typed-in size.
    const sums = left
      .replace(/\b(?:calc|clamp|min|max)\s*\(/gi, '(')
      .replace(/[()*/+,\-\s]/g, ' ')
      .replace(/\b\d*\.?\d+\b/g, ' ')
      .trim();
    if (CSS_WIDE.has(sums.toLowerCase())) return null;
    if (sums === '' && (names.length > 0 || left === '0')) return null;
    return `a typed-in size (${value}) — use a theme size such as var(--text-lead)`;
  }

  return null;
}

// Every `property: value` in a piece of CSS or SCSS, with its line number. A
// small scanner rather than a pattern, so text in strings and comments is never
// mistaken for a declaration and SCSS's nested properties (font: { size: 1px })
// keep their full name.
export function declarations(css, { lineOffset = 0, scss = false } = {}) {
  const out = [];
  const prefixes = [];
  let text = '';
  let startLine = 0;
  let line = 1;
  const stack = []; // names of the open ( ... ), so url(//cdn) is not a comment
  const newlines = (s) => (s.match(/\n/g) ?? []).length;
  const take = (chunk) => {
    if (startLine === 0 && /\S/.test(chunk)) startLine = line;
    text += chunk;
    line += newlines(chunk);
  };
  const flush = (closer) => {
    const stmt = text.trim();
    if (closer === '{') {
      // SCSS nested properties: `font: {` and `font: 16px Arial {`. A selector
      // such as a:hover has no space after its colon.
      const nested = scss ? stmt.match(/^([\w-]+)\s*:(?:\s+(\S[\s\S]*))?$/) : null;
      if (nested && (nested[2] !== undefined || stmt.endsWith(':'))) {
        if (nested[2] !== undefined) out.push({ prop: prefixes.join('') + nested[1], value: nested[2], line: startLine + lineOffset });
        prefixes.push(`${nested[1]}-`);
      } else {
        prefixes.push('');
      }
    } else {
      const m = stmt.match(/^([$@]?[\w-]+)\s*:\s*([\s\S]+)$/);
      if (m) out.push({ prop: prefixes.join('') + m[1], value: m[2], line: startLine + lineOffset });
      if (closer === '}') prefixes.pop();
    }
    text = '';
    startLine = 0;
  };

  for (let i = 0; i < css.length; i += 1) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      const stop = end === -1 ? css.length : end + 2;
      line += newlines(css.slice(i, stop));
      text += ' ';
      i = stop - 1;
    } else if (scss && c === '/' && css[i + 1] === '/' && !stack.includes('url')) {
      const end = css.indexOf('\n', i);
      i = (end === -1 ? css.length : end) - 1;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== c) j += css[j] === '\\' ? 2 : 1;
      take(css.slice(i, j + 1));
      i = j;
    } else if (scss && c === '#' && css[i + 1] === '{') {
      // Sass interpolation, #{$size}px: part of the value, not a block.
      const end = css.indexOf('}', i);
      const stop = end === -1 ? css.length : end + 1;
      take(css.slice(i, stop));
      i = stop - 1;
    } else if (stack.length === 0 && (c === ';' || c === '{' || c === '}')) {
      flush(c);
    } else {
      if (c === '(') stack.push((text.match(/([\w-]+)\s*$/)?.[1] ?? '').toLowerCase());
      else if (c === ')') stack.pop();
      take(c);
    }
  }
  flush(';');
  return out;
}

const blank = (s) => s.replace(/[^\n]/g, ' ');
const html = (s) => s.replace(/<!--[\s\S]*?-->/g, blank);

// A render.php with everything that is PHP code blanked out, except the text of
// string literals — markup a render file prints (echo '<div style="…">') is as
// much its styling as the HTML around the PHP. Variables inside a string, and
// anything else that is only known at run time, are blanked too. Same length
// as the input, so line numbers still match.
function markupOf(php, { keepCode = false } = {}) {
  let out = '';
  let last = 0;
  for (const tag of php.matchAll(/<\?(?:php|=)([\s\S]*?)(?:\?>|$)/g)) {
    const open = tag[0].startsWith('<?=') ? 3 : 5;
    const code = tag[1];
    const close = tag[0].length - open - code.length;
    let kept = '';
    let at = 0;
    for (const tok of code.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g)) {
      kept += keepCode ? code.slice(at, tok.index) : blank(code.slice(at, tok.index));
      const quote = tok[0][0];
      if (keepCode && (quote === "'" || quote === '"')) {
        kept += tok[0];
      } else if (quote === "'" || quote === '"') {
        let body = tok[0].slice(1, -1);
        if (quote === '"') body = body.replace(/\{\$[^}]*\}|\$\w+(?:->\w+|\[[^\]]*\])*/g, blank);
        kept += ` ${body.replace(/\\(["'])/g, ' $1')} `;
      } else {
        kept += blank(tok[0]);
      }
      at = tok.index + tok[0].length;
    }
    kept += keepCode ? code.slice(at) : blank(code.slice(at));
    out += html(php.slice(last, tag.index)) + blank(tag[0].slice(0, open)) + kept + blank(tag[0].slice(tag[0].length - close));
    last = tag.index + tag[0].length;
  }
  return out + html(php.slice(last));
}

// CSS carried inside a render.php: <style> blocks, style="" attributes, a
// 'style' => '…' entry given to the block wrapper, and SVG paint attributes.
export function phpStyles(php) {
  const src = markupOf(php);
  const out = [];
  const lineAt = (text, index) => text.slice(0, index).split('\n').length - 1;
  for (const m of src.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    out.push(...declarations(m[1], { lineOffset: lineAt(src, m.index + m[0].indexOf(m[1])) }));
  }
  for (const m of src.matchAll(/(?<=\s)style\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    out.push(...declarations(m[1] ?? m[2], { lineOffset: lineAt(src, m.index) }));
  }
  const code = markupOf(php, { keepCode: true });
  for (const m of code.matchAll(/(['"])style\1\s*=>\s*(['"])((?:(?!\2)[^\\]|\\.)*)\2/g)) {
    out.push(...declarations(m[3], { lineOffset: lineAt(code, m.index) }));
  }
  for (const m of src.matchAll(/(?<=\s)(fill|stroke|stop-color|flood-color|lighting-color|bgcolor|font-family|font-size)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    out.push({ prop: m[1].toLowerCase() === 'bgcolor' ? 'background-color' : m[1], value: m[2] ?? m[3], line: lineAt(src, m.index) + 1 });
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
    const found = /\.php$/i.test(file.path) ? phpStyles(file.content) : declarations(file.content, { scss: /\.(?:scss|pcss)$/i.test(file.path) });
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
