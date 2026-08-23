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

export function normalisePath(path) {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

// A plugin's admin CSS and JS is whatever it enqueues from a file that also
// wires up an admin hook (same-file rule). Tracing the actual callback would need
// a PHP parser; same-file is close enough, and it errs towards checking more
// rather than less.
//
// A second route catches Boilerplate-style layouts where the hook is registered
// in one file and assets are enqueued in another (e.g., Admin class). We collect
// any enqueued asset path whose own text contains "admin" from any file that calls
// wp_enqueue_style, wp_enqueue_script, or wp_enqueue_script_module. This catches
// assets/css/admin.css without false-positiving on assets/css/public.css.
//
// We do not broaden to "any enqueue call" without the admin-in-path check. That
// would classify front-end stylesheets as admin, causing false failures on code
// this system has no business judging. A missed admin stylesheet is recoverable;
// a false failure blocks a merge.
export function adminAssetPaths(phpFiles) {
  const out = new Set();
  for (const { content } of phpFiles) {
    // First route: admin_enqueue_scripts hook in the same file
    if (/admin_enqueue_scripts/.test(content)) {
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

// Three, six or eight hex digits, and not the fragment part of a link.
const HEX_COLOUR = /(?<!href\s*=\s*["'])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/;
const FUNCTION_COLOUR = /\b(?:rgba?|hsla?)\s*\(/;
const RAW_PX = /\b\d+px\b/;
const USES_TOKEN = /var\(\s*--/;

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
    for (const decl of line.split(';')) {
      if (HEX_COLOUR.test(decl) || (FUNCTION_COLOUR.test(decl) && !USES_TOKEN.test(decl))) {
        add(i, 'raw-color', 'error', 'You have written a colour by hand — use a design system colour token, such as var(--bw-brand).');
      }
      if (!inBreakpoint && RAW_PX.test(decl) && !USES_TOKEN.test(decl)) {
        add(i, 'raw-size', 'error', 'You have written a size by hand — use a design system spacing or control token.');
      }
      if (/box-shadow\s*:/.test(decl) && !USES_TOKEN.test(decl) && !/box-shadow\s*:\s*none/.test(decl)) {
        add(i, 'raw-shadow', 'error', 'You have written a shadow by hand — use a design system shadow token.');
      }
    }
    if (/font-family\s*:/.test(line) && !/var\(\s*--bw-font/.test(line)) {
      add(i, 'raw-font', 'error', 'You have set a font by hand — the system provides Sora and Inter through var(--bw-font-…).');
    }
    if (/\bstyle\s*=\s*["']/.test(line) || /\bstyle\s*=\s*\{\{/.test(line)) {
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

  return problems;
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
