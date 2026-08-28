// Which of a plugin's files are admin screens, and what is wrong with them.
// Pure: callers pass file contents in. Classification is by content rather
// than by folder name, because a plugin that lays itself out differently would
// otherwise escape the check entirely.

const ADMIN_PAGE_CALL = /\badd_(?:menu|submenu|options|management|theme|users|plugins|dashboard)_page\s*\(|\badd_settings_(?:section|field)\s*\(|\bregister_setting\s*\(/;
const ADMIN_HOOK = /\badmin_(?:enqueue_scripts|menu|init|notices)\b/;
const ADMIN_MARKUP = /class\s*=\s*["'][^"']*\b(?:wrap|bw-admin|bw-page)\b/;
const DS_IMPORT = /from\s+["'][^"']*blueworx-admin-design[^"']*["']/;
const BW_CLASS = /\bbw-[a-z]/;

const SKILL_DIR = '.claude/skills/blueworx-admin-design/';
const SHIPPED_CSS = 'assets/blueworx-admin-design.css';
const EDITOR_LIB_DIR = 'blueworx-page-editor/';
const SHIPPED_EDITOR_JS = 'assets/blueworx-page-editor.js';

// The only styling a plugin may keep of its own: the chrome overrides the
// system's readme documents for a full-bleed screen. Anything else in an admin
// stylesheet is a second design system growing beside the first.
const ALLOWED_ADMIN_SELECTORS = [
  /\.wrap\b/,
  /#wpcontent\b/,
  /#wpbody-content\b/,
  /#wpfooter\b/,
  /#wpadminbar\b/,
];

// `body`/`html` scoped by an attached class or id, e.g. `body.toplevel_page_x`
// — the shape the documented overrides use to scope a rule to one admin
// screen. A bare `body`/`html` with nothing attached is not this shape.
const SCOPED_BODY_OR_HTML = /^(?:body|html)(?:[.#][\w-]+)+$/;

// `0%`, `50%`, `from`, `to`, alone or as a comma-separated list — a keyframe
// step selector. It names a point in an animation, not an element on the
// page, so the chrome-override allowlist has nothing to say about it.
const KEYFRAME_SELECTOR_LIST = /^(?:from|to|\d+(?:\.\d+)?%)(?:\s*,\s*(?:from|to|\d+(?:\.\d+)?%))*$/;

// A selector is a documented chrome override only if EVERY compound in it is.
// Testing the selector as one string lets stray CSS launder itself through by
// nesting under `.wrap` — the standard WordPress admin container every
// plugin's markup already sits inside — so `.wrap .my-settings-panel` must
// not read as allowed just because `.wrap` appears somewhere in it.
function isAllowedAdminSelector(text) {
  const compounds = text.split(/\s*[,>+~]\s*|\s+/).filter(Boolean);
  return compounds.every(
    (compound) => ALLOWED_ADMIN_SELECTORS.some((re) => re.test(compound)) || SCOPED_BODY_OR_HTML.test(compound),
  );
}

// A screen counts as built from the design system if it imports it (the same
// pattern classifyAdminFile uses) or renders one of its components by name.
// A plugin re-exporting components through its own barrel file never mentions
// the design system in an import path, so a literal `bw-` string in a class
// attribute is not the only way to have built this the right way.
function rendersDsComponent(content, components) {
  if (!components) return false;
  for (const name of components) {
    if (new RegExp(`<${name}\\b`).test(content)) return true;
  }
  return false;
}

export function normalisePath(path) {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

// A plugin's admin CSS and JS is whatever it enqueues from a file that wires up
// an admin hook and nothing else (same-file rule). Tracing the actual callback
// would need a PHP parser, so the file is the unit.
//
// The same-file rule only applies when the file is unambiguously about admin.
// Plenty of plugins register both hooks in one main class, and sweeping up every
// asset path there would classify the plugin's front-end stylesheet as admin —
// failing a build over a plugin's own colours on pages this system does not
// govern. So a file that also registers the front-end hook is left to the second
// route alone.
//
// That second route catches Boilerplate-style layouts, where the hook is
// registered in one file and the assets are enqueued in another: any enqueued
// path whose own text contains "admin", from any file that calls
// wp_enqueue_style, wp_enqueue_script or wp_enqueue_script_module. It picks up
// assets/css/admin.css and can never pick up assets/css/public.css.
//
// We do not broaden the second route to every enqueue call. A missed admin
// stylesheet is recoverable; a false failure blocks a merge.
export function adminAssetPaths(phpFiles) {
  const out = new Set();
  for (const { content } of phpFiles) {
    // First route: an admin-only file — the admin hook, and no front-end hook.
    if (/\badmin_enqueue_scripts\b/.test(content) && !/\bwp_enqueue_scripts\b/.test(content)) {
      for (const m of content.matchAll(/["']([^"']+\.(?:css|jsx?|tsx?))["']/g)) {
        out.add(normalisePath(m[1]));
      }
    }
    // Second route: wp_enqueue_* call with admin in the path
    if (/\bwp_enqueue_(?:style|script|script_module)\s*\(/.test(content)) {
      for (const m of content.matchAll(/["']([^"']*admin[^"']*\.(?:css|jsx?|tsx?))["']/g)) {
        out.add(normalisePath(m[1]));
      }
    }
  }
  return out;
}

export function classifyAdminFile({ path, content, adminAssets = new Set() }) {
  const p = normalisePath(path);

  // The system is the standard; it is not a consumer of itself.
  if (p.includes(SKILL_DIR) || p === SHIPPED_CSS) return null;

  // Nor is the page editor library, which a plugin carries verbatim and is
  // forbidden to edit — CI hash-checks both copies against the foundation. A
  // finding here could only ever be fixed in the foundation, so reporting it
  // against the plugin would be a hard failure with no action behind it. The
  // exemption is here rather than only inside a single rule because any rule
  // reaching these files has the same problem.
  if (p.includes(EDITOR_LIB_DIR) || p === SHIPPED_EDITOR_JS) return null;

  if (p.endsWith('.php')) {
    if (ADMIN_PAGE_CALL.test(content) || ADMIN_HOOK.test(content) || ADMIN_MARKUP.test(content)) return 'php';
    return null;
  }
  if (/\.(?:jsx|tsx)$/.test(p)) {
    if (DS_IMPORT.test(content) || BW_CLASS.test(content) || adminAssets.has(p)) return 'jsx';
    return null;
  }
  if (p.endsWith('.css')) {
    return adminAssets.has(p) ? 'css' : null;
  }
  return null;
}

// WordPress core classes the design system exists to replace, and what to use
// instead. Deliberately specific — a bare `button` is far too common in real
// markup to flag, but `button-primary` is unambiguous.
const WP_CORE_CLASSES = {
  'button-primary': 'Button',
  'button-secondary': 'Button',
  'form-table': 'FormRow',
  'wp-list-table': 'DataTable',
  postbox: 'Card',
  'nav-tab': 'Tabs',
  'notice-success': 'Notice',
  'notice-error': 'Notice',
  'notice-warning': 'Notice',
  'notice-info': 'Notice',
};

// Three, six or eight hex digits, sitting where a CSS *value* would: at the
// start of the fragment, or preceded by whitespace, `:`, `(`, `,`, `'` or `"`
// — the last two so a quoted literal (`"#F04438"`, e.g. inside a JSX
// ternary) still counts as a colour written by hand. A URL fragment —
// `https://example.com/help#add-new`, or the same inside a comment — never
// sits after one of those, so it is never mistaken for a colour even though a
// hex-shaped run of letters (e.g. `#add`) can follow the `#`. `href="#abc"`
// would otherwise now qualify too, since a quote is one of the allowed
// preceding characters, so that specific shape is still excluded by name.
const HEX_COLOUR = /(?<!href\s*=\s*["'])(?<=^|[\s:(,'"])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/;
const FUNCTION_COLOUR = /\b(?:rgba?|hsla?)\s*\(/;
const RAW_PX = /\b\d+px\b/;
const VAR_REF = /var\(\s*(--[a-zA-Z0-9-]+)/g;

// The token escape only applies to a *real* token — one the design system
// actually declares. `var(--i-made-this-up, 13px)` must not excuse the
// hard-coded fallback sitting right there in the same declaration.
function usesRealToken(decl, vocab) {
  for (const m of decl.matchAll(VAR_REF)) {
    if (vocab.tokens.has(m[1])) return true;
  }
  return false;
}

export function findViolations({ path, kind, content, vocab, whole = true }) {
  const p = normalisePath(path);
  const problems = [];
  const lines = content.split(/\r?\n/);
  const add = (index, rule, severity, message) =>
    problems.push({ path: p, line: index + 1, rule, severity, message });

  lines.forEach((line, i) => {
    // A breakpoint is a fact about the viewport, not a design decision, so px
    // is the only sensible way to write one.
    const inBreakpoint = /@media\b/.test(line);

    // A token on one declaration must not excuse a hand-written value on the
    // next declaration in the same line, so raw-color/raw-size/raw-shadow are
    // checked per declaration, split on `;`. raw-font already tests for its
    // own specific token and does not need this.
    //
    // A `;` is not always a declaration separator — an HTML entity (`&nbsp;`)
    // or a quoted CSS `content` string can contain one too, stranding ordinary
    // prose into its own fragment. A real declaration is `property: value`, so
    // a fragment with no colon is never examined: displaying a value in text
    // is not the same as using it as a style.
    for (const decl of line.split(';')) {
      if (!decl.includes(':')) continue;
      const escaped = usesRealToken(decl, vocab);
      if (HEX_COLOUR.test(decl) || (FUNCTION_COLOUR.test(decl) && !escaped)) {
        add(i, 'raw-color', 'error', 'You have written a colour by hand — use a design system colour token, such as var(--bw-brand).');
      }
      if (!inBreakpoint && RAW_PX.test(decl) && !escaped) {
        add(i, 'raw-size', 'error', 'You have written a size by hand — use a design system spacing or control token.');
      }
      if (/box-shadow\s*:/.test(decl) && !escaped && !/box-shadow\s*:\s*none/.test(decl)) {
        add(i, 'raw-shadow', 'error', 'You have written a shadow by hand — use a design system shadow token.');
      }
    }
    if (/font-family\s*:/.test(line) && !/var\(\s*--bw-font/.test(line)) {
      add(i, 'raw-font', 'error', 'You have set a font by hand — the system provides Sora and Inter through var(--bw-font-…).');
    }
    const styleAttr = line.match(/\bstyle\s*=\s*["']/);
    const styleObj = line.match(/\bstyle\s*=\s*\{\{([\s\S]*?)\}\}/);
    if (styleAttr || (styleObj && hasHardcodedStyleValue(styleObj[1]))) {
      add(i, 'inline-style', 'error', 'You have put an inline style on this element — move the styling onto a design system class.');
    }
    if (/<svg\b/i.test(line)) {
      add(i, 'hand-svg', 'error', 'You have drawn this icon by hand — use the Icon component in React, or an i element with class bw-icon and a data-lucide name in PHP.');
    }

    // Classes only count when written literally in a class=/className= attribute,
    // and only as a whole token — never a substring, or an unrelated class like
    // "primary-nav-tab-container" would trip the nav-tab rule. This misses a
    // class assembled in PHP (`$classes[] = 'form-table';`); that is a miss, not
    // a false failure, and Task 4's catch-all still covers a screen built
    // entirely off-system.
    for (const cls of classesOn(line)) {
      if (cls.startsWith('bw-') && !vocab.classes.has(cls)) {
        add(i, 'unknown-bw-class', 'error', `You have used "${cls}", which is not a class in the design system — add the pattern to the system first, then use it here.`);
      }
      if (Object.prototype.hasOwnProperty.call(WP_CORE_CLASSES, cls)) {
        add(i, 'wp-core-class', 'error', `You have used the WordPress core class "${cls}" — use the design system's ${WP_CORE_CLASSES[cls]} instead.`);
      }
    }
  });

  if (kind === 'css') {
    lines.forEach((line, i) => {
      const selector = line.match(/^([^{}]+)\{/);
      if (!selector) return;
      const text = selector[1].trim();
      if (!text || text.startsWith('@') || text.startsWith('/*')) return;
      if (KEYFRAME_SELECTOR_LIST.test(text)) return;
      if (isAllowedAdminSelector(text)) return;
      add(i, 'stray-admin-css', 'error', `You have styled "${text}" in a plugin stylesheet — that belongs in the design system, since the only styling a plugin keeps of its own is the documented full-bleed chrome overrides.`);
    });
  }

  // The catch-all for a screen built from scratch. It is the one rule that
  // reasons about a whole file rather than a line, so it never runs on an edit
  // fragment, and it is a warning until it has proved itself on a real plugin.
  if (
    whole &&
    kind !== 'css' &&
    /class(?:Name)?\s*=/.test(content) &&
    !BW_CLASS.test(content) &&
    !DS_IMPORT.test(content) &&
    !rendersDsComponent(content, vocab.components)
  ) {
    add(0, 'no-bw-class', 'warn', 'You have built this admin screen without the design system — use its components rather than starting from scratch.');
  }

  // Tabs and a save bar on the same screen is an editor, and editors come from
  // the page editor library — one shell, one save model, one set of controls.
  // A save bar on its own is an ordinary settings screen and is left alone.
  //
  // Whole files only: an edit fragment carrying one of the two says nothing
  // about what the finished file holds.
  //
  // A failure, not a warning: every plugin repo carrying the design system was
  // swept before this was turned up, and no existing screen combined the two
  // classes. Nothing legitimate is caught, so there is nothing to soften.
  if (
    whole &&
    kind !== 'css' &&
    !p.includes(EDITOR_LIB_DIR) &&
    /class(?:Name)?\s*=\s*["'][^"']*\bbw-tabs\b/.test(content) &&
    /class(?:Name)?\s*=\s*["'][^"']*\bbw-savebar\b/.test(content)
  ) {
    add(0, 'hand-written-editor', 'error', 'You have hand-written an editor screen — tabs and a save bar together are an editor, and those come from the page editor library. Declare the screen as a field schema and let the library render it.');
  }

  return problems;
}

// The JSX object form, `style={{ … }}`, is how the design system's own
// screens set a value no class can express (`style={{ width: size }}`,
// `style={{ width: pct + '%' }}`) — that must not fail. It only fails when
// the object body contains a hard-coded literal a class-based system could
// have carried instead: a colour (hex, or an rgb/rgba/hsl/hsla call), a
// quoted length or percentage, or a bare number as a property value. This
// deliberately does not split the body into individual key: value pairs — a
// JSX style key is always an identifier, never a literal, and a ternary
// inside a value (`big ? "100px" : "50px"`) carries its own `:`, which broke
// an earlier, splitting version of this same check. An identifier, a member
// expression, a template literal, a concatenation, or a token reference
// (`var(--bw-…)`, quoted or not) never matches any of the three patterns, so
// it is left alone regardless of where in the body it sits.
const STYLE_COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\s*\(/;
const STYLE_QUOTED_LENGTH = /(['"])-?\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|vmin|vmax|pt|ch|ex|cm|mm|in|pc)\1/;
const STYLE_BARE_NUMBER_VALUE = /:\s*-?\d+(?:\.\d+)?\s*(?:,|$)/;

function hasHardcodedStyleValue(objectText) {
  return (
    STYLE_COLOUR_LITERAL.test(objectText) ||
    STYLE_QUOTED_LENGTH.test(objectText) ||
    STYLE_BARE_NUMBER_VALUE.test(objectText)
  );
}

// Every class token written out in full in a class=/className= attribute. A
// class assembled from a variable cannot be checked against the vocabulary or
// looked up by name, and guessing at it would fail good code.
function classesOn(line) {
  const out = [];
  for (const m of line.matchAll(/class(?:Name)?\s*=\s*["']([^"']*)["']/g)) {
    for (const cls of m[1].split(/\s+/)) {
      if (cls && !/[${}<>]/.test(cls)) out.push(cls);
    }
  }
  return out;
}
