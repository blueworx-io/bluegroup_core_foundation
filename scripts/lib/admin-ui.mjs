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
// wires up an admin hook. Tracing the actual callback would need a PHP parser;
// same-file is close enough, and it errs towards checking more rather than less.
export function adminAssetPaths(phpFiles) {
  const out = new Set();
  for (const { content } of phpFiles) {
    if (!/admin_enqueue_scripts/.test(content)) continue;
    for (const m of content.matchAll(/["']([^"']+\.(?:css|jsx?|tsx?))["']/g)) {
      out.add(normalisePath(m[1]));
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
