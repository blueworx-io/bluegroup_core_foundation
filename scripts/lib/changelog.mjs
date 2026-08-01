// Assembling per-change changelog fragments into a Keep a Changelog file.
// Pure — no I/O, no clock. The CLI (scripts/assemble-changelog.mjs) reads the
// files and supplies the version and date.
//
// This is the other half of changelogUpdated()'s fragment branch in checks.mjs.
// That check lets a PR record its entry as its own file so two open branches
// never conflict on the top of CHANGELOG.md; this folds those files back in on
// the default branch, where there is no parallel branch to conflict with.

// Keep a Changelog's order. Emitted in this order regardless of fragment order.
export const CATEGORIES = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security'];

// One fragment's text -> [{ category, body }]. Throws, naming the file, rather
// than filing an unrecognised heading silently under something else.
export function parseFragment(text, filename) {
  const blocks = [];
  let current = null;

  for (const line of text.split('\n')) {
    const heading = line.match(/^###\s+(\S+)\s*$/);
    if (heading && CATEGORIES.includes(heading[1])) {
      current = { category: heading[1], lines: [] };
      blocks.push(current);
      continue;
    }
    if (heading) {
      throw new Error(
        `${filename}: "${line.trim()}" is not a recognised category. Use one of: ${CATEGORIES.join(', ')}.`,
      );
    }
    if (current) current.lines.push(line);
    else if (line.trim() !== '') {
      throw new Error(
        `${filename}: content before any "### Category" heading. A fragment must start with one of: ${CATEGORIES.join(', ')}.`,
      );
    }
  }

  if (blocks.length === 0) {
    throw new Error(
      `${filename}: no "### Category" heading found. A fragment must start with one of: ${CATEGORIES.join(', ')}.`,
    );
  }
  return blocks.map((b) => ({ category: b.category, body: b.lines.join('\n').trim() }));
}

// Returns the new changelog contents. `fragments` is [{ name, text }].
export function assemble({ changelog, fragments, version, date }) {
  if (fragments.length === 0) return changelog;

  // Filename order, so a category's entries land in a stable, reviewable order.
  const sorted = [...fragments].sort((a, b) => a.name.localeCompare(b.name));

  const byCategory = new Map();
  for (const fragment of sorted) {
    for (const block of parseFragment(fragment.text, fragment.name)) {
      if (!byCategory.has(block.category)) byCategory.set(block.category, []);
      byCategory.get(block.category).push(block.body);
    }
  }

  const body = CATEGORIES.filter((c) => byCategory.has(c))
    .map((c) => `### ${c}\n${byCategory.get(c).join('\n')}`)
    .join('\n\n');

  const existing = changelog.indexOf(`## [${version}]`);
  if (existing !== -1) {
    // This version already has a section — merge into its end rather than
    // emitting a second heading for one version.
    const next = changelog.indexOf('\n## [', existing + 1);
    const atEnd = next === -1;
    const end = atEnd ? changelog.length : next + 1;
    const before = changelog.slice(0, end).replace(/\n+$/, '\n');
    // A following heading needs a blank line before it; the end of the file
    // needs no extra trailing newline.
    const after = atEnd ? '' : `\n${changelog.slice(end)}`;
    return `${before}\n${body}\n${after}`;
  }

  const section = `## [${version}] - ${date}\n\n${body}\n`;
  const first = changelog.indexOf('\n## [');
  if (first === -1) return `${changelog.replace(/\n+$/, '')}\n\n${section}`;
  // Trim the preamble's own trailing blank line before re-joining, so a
  // preamble that already ends in one does not end up with two.
  const preamble = changelog.slice(0, first).replace(/\n+$/, '');
  return `${preamble}\n\n${section}\n${changelog.slice(first + 1)}`;
}
