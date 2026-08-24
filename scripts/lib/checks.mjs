// Pure guardrail checks. Each returns { ok: boolean, message: string }
// (approvedDeps also returns offenders: string[]). No I/O here — callers
// gather inputs (git/fs) and pass them in, which keeps these unit-testable.

import { compareSemver, parseSemver } from './semver.mjs';
import { classifyAdminFile, findViolations } from './admin-ui.mjs';

export function versionBumped({ current, base }) {
  if (base === null || base === undefined) {
    return { ok: true, message: `No base version found (first build) — version bump check skipped. Current: ${current ?? 'none'}.` };
  }
  if (!current) {
    return { ok: false, message: 'No current version found to compare.' };
  }
  if (compareSemver(current, base) === 1) {
    return { ok: true, message: `Version bumped ${base} → ${current}.` };
  }
  return { ok: false, message: `Version not bumped: base is ${base}, current is ${current}. Bump it above the base branch.` };
}

// Two accepted shapes. The historical one is "CHANGELOG.md is in the diff",
// which forces every branch to write to the top of one shared file and so makes
// any two open branches conflict on the same lines. A project can instead keep
// per-change fragments in a directory, where each branch owns its own file and
// the conflict cannot arise; a release step folds them into CHANGELOG.md.
//
// A project with no such directory can never match the second branch, so its
// behaviour is unchanged.
export function changelogUpdated({ changedFiles, changelogPath, changelogDir }) {
  if (changedFiles.includes(changelogPath)) {
    return { ok: true, message: `${changelogPath} was updated.` };
  }

  if (changelogDir) {
    const prefix = `${changelogDir.replace(/\/+$/, '')}/`;
    // The directory's own README documents the format; editing it is not an entry.
    const fragments = changedFiles.filter(
      (f) => f.startsWith(prefix) && f !== `${prefix}README.md`,
    );
    if (fragments.length > 0) {
      return { ok: true, message: `Changelog fragment(s) added: ${fragments.join(', ')}.` };
    }
    return {
      ok: false,
      message:
        `Neither ${changelogPath} nor a file under ${prefix} was changed in this PR.\n` +
        `  Add a fragment (${prefix}<branch-name>.md) or update ${changelogPath} directly.`,
    };
  }

  return { ok: false, message: `${changelogPath} was not updated in this PR. Update it alongside the version bump.` };
}

export function approvedDeps({ pkg, approved }) {
  const offenders = [];
  for (const group of ['dependencies', 'devDependencies']) {
    const declared = Object.keys(pkg?.[group] ?? {});
    const allow = toNameSet(approved?.[group]);
    for (const name of declared) {
      if (!allow.has(name)) offenders.push(`${group}: ${name}`);
    }
  }
  if (offenders.length === 0) {
    return { ok: true, message: 'All dependencies are on the approved list.', offenders };
  }
  return {
    ok: false,
    offenders,
    message: `Unapproved dependencies (add them to approved-deps.json):\n  ${offenders.join('\n  ')}`,
  };
}

export function pluginVersionSync({ headerVersion, pkgVersion }) {
  if (pkgVersion === null || pkgVersion === undefined) {
    return { ok: true, message: `No package.json version to sync (plugin header is ${headerVersion}).` };
  }
  if (headerVersion === pkgVersion) {
    return { ok: true, message: `Plugin header and package.json agree (${headerVersion}).` };
  }
  return { ok: false, message: `Version mismatch: plugin header ${headerVersion} vs package.json ${pkgVersion}.` };
}

export function pluginZip({ zipFiles, slug }) {
  if (zipFiles.length <= 1) {
    const detail = zipFiles.length === 0
      ? `No "${slug}" zip present (allowed).`
      : `Exactly one "${slug}" zip present: ${zipFiles[0]}.`;
    return { ok: true, message: detail };
  }
  return {
    ok: false,
    message: `More than one "${slug}" zip present — only the current version's zip should exist:\n  ${zipFiles.join('\n  ')}`,
  };
}

// What must never reach a live site, checked against the staged tree rather
// than against the intent that produced it. The exclude list is a denylist of
// top-level paths; this is the second line, and it is the one that catches the
// case a human misses — a dev directory nested inside a shipped one, which no
// top-level exclude touches.
//
// Segments match a whole path component anywhere in the tree. Files match a
// basename, with * matching within one component.
const FORBIDDEN_SEGMENTS = [
  '.git', '.github', '.foundation', '.claude', '.superpowers',
  'node_modules', 'preview', 'tests', 'test-results', 'playwright-report',
];
const FORBIDDEN_FILES = [
  '*.spec.js', '*.spec.ts', '*.test.js', '*.test.mjs',
  'playwright.config.*', 'package.json', 'package-lock.json',
  'composer.json', 'composer.lock', 'approved-deps.json',
  'phpunit.xml', 'phpunit.xml.dist', 'phpcs.xml', 'phpcs.xml.dist', '.phpcs.xml',
  'CLAUDE.md', 'AGENTS.md', '.env', '.env.*', '.npmrc', '*.pem', '*.key', '*.zip',
];

// `entries` are archive-style paths, each expected to start "<slug>/". Passing
// the zip's own entry list (unzip -Z1) and passing a staged tree's relative
// paths are the same input, which is why one function serves both callers.
export function pluginZipContent({ entries, slug }) {
  const paths = (entries ?? []).map((e) => String(e).replace(/\/+$/, '')).filter(Boolean);

  if (paths.length === 0) {
    return { ok: false, offenders: [], message: 'The staged plugin tree is empty — nothing would ship.' };
  }

  const offenders = [];
  const outside = paths.filter((p) => !p.startsWith(`${slug}/`) && p !== slug);
  for (const p of outside) offenders.push(`${p} (outside ${slug}/)`);

  for (const p of paths) {
    const parts = p.split('/').slice(1); // drop the leading <slug>
    const dirs = parts.slice(0, -1);
    const base = parts[parts.length - 1];
    if (!base) continue;

    const segment = dirs.find((d) => FORBIDDEN_SEGMENTS.includes(d));
    if (segment) {
      offenders.push(`${p} (inside a "${segment}" directory)`);
      continue;
    }
    if (parts.length === 1 && FORBIDDEN_SEGMENTS.includes(base)) {
      offenders.push(`${p} (a "${base}" directory)`);
      continue;
    }
    const pattern = FORBIDDEN_FILES.find((f) => globMatches(f, base));
    if (pattern) offenders.push(`${p} (matches "${pattern}")`);
  }

  const unique = [...new Set(offenders)];
  if (unique.length > 0) {
    return {
      ok: false,
      offenders: unique,
      message:
        'These would ship to a live site and must not:\n  ' + unique.join('\n  ') +
        '\n  Add the path to scripts/plugin-zip-excludes.txt, or to the exclude_paths input if it is project-specific.',
    };
  }

  const mainFile = paths.some((p) => p === `${slug}/${slug}.php`);
  return {
    ok: true,
    offenders: [],
    message:
      `${paths.length} entries would ship, none forbidden` +
      (mainFile ? `, and ${slug}/${slug}.php is present.` : '.'),
  };
}

function globMatches(pattern, value) {
  const rx = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$');
  return rx.test(value);
}

// A tag whose version disagrees with the plugin header publishes a Release that
// looks healthy but is never offered to sites: the update checker reads the
// header from the plugin's main file at the tagged ref, compares it to what's
// installed, sees no difference, and reports "up to date" forever. Fail loudly
// here instead.
export function releaseTag({ tag, headerVersion, pluginFile }) {
  if (!pluginFile) {
    return { ok: false, message: 'No plugin main file (with "Plugin Name:") found — cannot verify the release tag.' };
  }
  if (!tag) {
    return { ok: false, message: 'No release tag supplied (RELEASE_TAG is empty).' };
  }
  if (!headerVersion) {
    return {
      ok: false,
      message: `No "Version:" header found in ${pluginFile}. Add one — the update checker reads it to decide whether a site is out of date.`,
    };
  }
  if (!parseSemver(tag)) {
    return { ok: false, message: `Release tag "${tag}" is not valid semver. Tag releases as v1.2.3.` };
  }
  if (!parseSemver(headerVersion)) {
    return { ok: false, message: `Version header "${headerVersion}" in ${pluginFile} is not valid semver.` };
  }
  if (compareSemver(tag, headerVersion) !== 0) {
    return {
      ok: false,
      message:
        `Release tag ${tag} does not match the plugin header version ${headerVersion} in ${pluginFile}.\n` +
        '  Sites compare the header at the released tag against what they have installed, so a\n' +
        '  mismatch publishes a Release that is never offered as an update. Fix one and re-tag.',
    };
  }
  return { ok: true, message: `Release tag ${tag} matches the plugin header version in ${pluginFile}.` };
}

// Headless projects deploy every PR to a Netlify preview, and that preview is a
// required check: merging a headless PR whose preview never built means merging
// something nobody has seen running.
//
// Netlify reports the deploy as a commit status on the PR head, context
// "netlify/<site>/deploy-preview". GitHub keeps every status ever posted for a
// commit, so a context that was pending and then succeeded appears twice —
// latest-per-context is the only reading that reflects reality.
//
// A commit with no Netlify status at all is deliberately *pending*, not failed:
// the caller polls, and only a timeout turns "never reported" into a failure.
// Treating it as failed immediately would fail every PR in the seconds before
// Netlify first posts.
export function netlifyPreview({ statuses }) {
  const netlify = (statuses ?? []).filter((s) => String(s?.context ?? '').startsWith('netlify/'));

  if (netlify.length === 0) {
    return { ok: false, pending: true, url: null, message: 'No Netlify status posted for this commit yet.' };
  }

  const latest = new Map();
  for (const s of netlify) {
    const seen = latest.get(s.context);
    if (!seen || String(s.updated_at ?? '') >= String(seen.updated_at ?? '')) latest.set(s.context, s);
  }
  const current = [...latest.values()];

  const failed = current.filter((s) => s.state === 'failure' || s.state === 'error');
  if (failed.length > 0) {
    return {
      ok: false,
      pending: false,
      url: failed[0].target_url ?? null,
      message:
        'The Netlify preview deploy failed:\n  ' +
        failed.map((s) => `${s.context}: ${s.state}${s.target_url ? ` — ${s.target_url}` : ''}`).join('\n  ') +
        '\n  A headless PR cannot be merged on a preview nobody can open.',
    };
  }

  const waiting = current.filter((s) => s.state !== 'success');
  if (waiting.length > 0) {
    return {
      ok: false,
      pending: true,
      url: null,
      message: 'Waiting on: ' + waiting.map((s) => `${s.context} (${s.state})`).join(', '),
    };
  }

  const deploy = current.find((s) => s.context.endsWith('/deploy-preview')) ?? current[0];
  return {
    ok: true,
    pending: false,
    url: deploy.target_url ?? null,
    message: `Netlify preview deployed: ${current.map((s) => s.context).join(', ')}.`,
  };
}

// A Playwright run that executes nothing still exits 0, so a suite that skips
// itself wholesale reports green having asserted nothing. Skipped tests do not
// count as executed — that is the failure mode this exists to catch.
export function testsExecuted({ report }) {
  return verdict(countOutcomes(report));
}

// The sharded form of the same gate. Playwright's --shard splits one suite
// across N runners, so no single shard's report is the suite — the gate has to
// be applied to the sum. A shard that executes nothing is not, on its own, a
// failure (with more shards than spec files one of them legitimately gets an
// empty slice); every shard executing nothing is precisely the failure this
// exists to catch, and summing first is what keeps that distinction.
//
// An empty `reports` array means no shard produced a report at all — a broken
// upload or a job that died before writing one. That is never a pass: it is the
// same "cannot verify anything ran" state as a missing single report.
export function testsExecutedAcross({ reports }) {
  if (!Array.isArray(reports) || 0 === reports.length) {
    return {
      ok: false,
      counts: { executed: 0, skipped: 0, total: 0 },
      message:
        'No Playwright JSON report was collected from any shard, so the number of tests that ran cannot be verified.\n' +
        '  Every shard should upload its report; check the upload step and that test_command keeps the json reporter.',
    };
  }

  const counts = reports
    .map((report) => countOutcomes(report))
    .reduce(
      (total, c) => ({
        executed: total.executed + c.executed,
        skipped: total.skipped + c.skipped,
        total: total.total + c.total,
      }),
      { executed: 0, skipped: 0, total: 0 },
    );

  return verdict(counts);
}

// Shared verdict so the single-report and sharded paths can never drift apart.
function verdict(counts) {
  const { executed, skipped } = counts;

  if (executed > 0) {
    const detail = skipped > 0 ? ` (${skipped} skipped)` : '';
    return { ok: true, counts, message: `${executed} test(s) executed${detail}.` };
  }

  if (skipped > 0) {
    return {
      ok: false,
      counts,
      message:
        `Every test skipped (${skipped} skipped, 0 executed). The suite asserted nothing, so this run proves nothing.\n` +
        '  Usual causes: a placeholder preview/base URL that specs guard against, or missing credentials\n' +
        '  (e.g. WP_ADMIN_USER / WP_ADMIN_PASS) that make specs skip themselves.',
    };
  }

  return {
    ok: false,
    counts,
    message:
      'No tests were found or executed. A project must have at least one Playwright test that actually runs.',
  };
}

// Prefer Playwright's own stats block; fall back to walking the suite tree for
// older report shapes. Returns { executed, skipped, total }.
function countOutcomes(report) {
  const stats = report?.stats;
  if (stats && typeof stats === 'object') {
    const expected = num(stats.expected);
    const unexpected = num(stats.unexpected);
    const flaky = num(stats.flaky);
    const skipped = num(stats.skipped);
    const executed = expected + unexpected + flaky;
    return { executed, skipped, total: executed + skipped };
  }

  let executed = 0;
  let skipped = 0;
  for (const status of walkStatuses(report?.suites)) {
    if (status === 'skipped') skipped += 1;
    else executed += 1;
  }
  return { executed, skipped, total: executed + skipped };
}

function* walkStatuses(suites) {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        for (const result of test.results ?? []) {
          if (result?.status) yield result.status;
        }
      }
    }
    yield* walkStatuses(suite.suites);
  }
}

function num(value) {
  return Number.isFinite(value) ? value : 0;
}

function toNameSet(allow) {
  if (Array.isArray(allow)) return new Set(allow);
  if (allow && typeof allow === 'object') return new Set(Object.keys(allow));
  return new Set();
}

// The design system is copied into each plugin twice, and the two copies drift
// independently: the skill folder is what Claude Code reads when building an
// admin screen, and assets/blueworx-admin-design.css is what the plugin
// actually enqueues on the page. Comparing content hashes both ways catches a
// plugin that has fallen behind AND a file hand-edited inside a plugin.
//
// Absence is deliberately not a failure on either side. The check ships before
// the design system does, and existing plugins adopt it one at a time — a
// guardrail that broke every repo on day one would just get switched off.
export function designSystemSync({
  foundationFiles,
  pluginFiles,
  canonicalCss,
  shippedCss,
  canonicalFonts = null,
  shippedFonts = null,
  skillPath = '.claude/skills/blueworx-admin-design',
  cssPath = 'assets/blueworx-admin-design.css',
  fontsPath = 'assets/fonts',
}) {
  if (foundationFiles === null) {
    return { ok: true, problems: [], message: `Design system sync: ${skillPath} is not in the foundation yet — nothing to compare.` };
  }
  if (pluginFiles === null) {
    return { ok: true, problems: [], message: `Design system sync: this plugin has no ${skillPath} — design system not adopted, skipping.` };
  }

  const problems = [];
  const names = new Set([...foundationFiles.keys(), ...pluginFiles.keys()]);
  for (const name of [...names].sort()) {
    const want = foundationFiles.get(name);
    const got = pluginFiles.get(name);
    if (got === undefined) problems.push(`${skillPath}/${name} — missing from this plugin`);
    else if (want === undefined) problems.push(`${skillPath}/${name} — not part of the design system; delete it`);
    else if (want !== got) problems.push(`${skillPath}/${name} — differs from the design system`);
  }

  if (canonicalCss === null) {
    problems.push(`${skillPath}/styles.css — missing from the design system itself; fix it in the foundation`);
  } else if (shippedCss === null) {
    problems.push(`${cssPath} — missing; the plugin must ship the stylesheet it enqueues`);
  } else if (shippedCss !== canonicalCss) {
    problems.push(`${cssPath} — differs from ${skillPath}/styles.css`);
  }

  // styles.css loads its webfonts with url("fonts/…"), relative to itself, so a
  // plugin needs them beside the stylesheet or the brand type silently falls
  // back. Unlike the skill folder, extra files here are fine: assets/fonts is
  // the plugin's own directory and may hold its front-end faces too.
  if (canonicalFonts !== null && canonicalFonts.size > 0) {
    if (shippedFonts === null) {
      problems.push(`${fontsPath} — missing; styles.css loads its webfonts from beside itself`);
    } else {
      for (const [name, want] of [...canonicalFonts.entries()].sort()) {
        const got = shippedFonts.get(name);
        if (got === undefined) problems.push(`${fontsPath}/${name} — missing from this plugin`);
        else if (got !== want) problems.push(`${fontsPath}/${name} — differs from the design system`);
      }
    }
  }

  if (problems.length === 0) {
    return { ok: true, problems, message: `Design system sync: ${skillPath} and ${cssPath} match the foundation.` };
  }

  const fix = [
    'Fix by re-pulling the design system and re-copying the stylesheet:',
    '',
    '  mkdir -p .claude/skills',
    `  rm -rf ${skillPath}`,
    '  curl -sL https://github.com/blueworx-io/bluegroup_core_foundation/archive/refs/heads/main.tar.gz \\',
    '    | tar -xz --strip-components=3 -C .claude/skills \\',
    `      bluegroup_core_foundation-main/${skillPath}`,
    `  cp ${skillPath}/styles.css ${cssPath}`,
    `  mkdir -p ${fontsPath} && cp ${skillPath}/fonts/* ${fontsPath}/`,
    '',
    'The committed folder in the foundation is the source — do not hand-edit either copy here.',
  ].join('\n');

  return {
    ok: false,
    problems,
    message: [`Design system out of sync (${problems.length} problem(s)):`, ...problems.map((p) => `  - ${p}`), '', fix].join('\n'),
  };
}

// Fails when an admin screen this PR touches is not built from the shared
// blueworx-admin-design system. Only the files in the diff are judged, so a
// plugin adopts the system screen by screen and an untouched legacy screen is
// left alone until somebody works on it.
export function adminUiAdherence({ files, vocab, adminAssets = new Set(), promoteWarnings = false }) {
  if (!vocab) {
    return { ok: true, problems: [], message: 'Admin UI adherence: this plugin has no blueworx-admin-design system — skipping.' };
  }

  const problems = [];
  let screens = 0;
  for (const { path, content } of files) {
    const kind = classifyAdminFile({ path, content, adminAssets });
    if (!kind) continue;
    screens += 1;
    problems.push(...findViolations({ path, kind, content, vocab }));
  }

  const errors = problems.filter((p) => p.severity === 'error' || promoteWarnings);
  const warnings = promoteWarnings ? [] : problems.filter((p) => p.severity === 'warn');

  if (errors.length === 0 && warnings.length === 0) {
    return {
      ok: true,
      problems,
      message: `Admin UI adherence: ${screens} admin screen(s) changed, all built from the design system.`,
    };
  }

  const lines = [];
  if (errors.length > 0) {
    lines.push(`Admin UI adherence: ${errors.length} problem(s) in the admin screens this PR changes.`, '');
    for (const p of errors) lines.push(`  ${p.path}:${p.line} — ${p.message}`);
  }
  if (warnings.length > 0) {
    lines.push('', `${warnings.length} warning(s):`);
    for (const p of warnings) lines.push(`  ${p.path}:${p.line} — ${p.message}`);
  }
  // Printed only on an actual failure — a warnings-only run is ok:true, and this
  // failure-shaped block on a green run reads as a failure to anyone scanning CI
  // output.
  if (errors.length > 0) {
    lines.push(
      '',
      'Every admin screen is built from the shared design system. Invoke the',
      'blueworx-admin-design skill and take the pattern from there. If the system',
      'has no pattern for what you need, add it to the system in the foundation',
      'first, then build the screen on it. A plugin catching up mid-feature can set',
      "the workflow's admin_ui_adherence input to warn to report without failing,",
      'and should take it off again once it is caught up.',
    );
  }

  return { ok: errors.length === 0, problems, message: lines.join('\n') };
}
