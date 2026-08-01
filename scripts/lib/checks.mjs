// Pure guardrail checks. Each returns { ok: boolean, message: string }
// (approvedDeps also returns offenders: string[]). No I/O here — callers
// gather inputs (git/fs) and pass them in, which keeps these unit-testable.

import { compareSemver, parseSemver } from './semver.mjs';

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

export function changelogUpdated({ changedFiles, changelogPath }) {
  if (changedFiles.includes(changelogPath)) {
    return { ok: true, message: `${changelogPath} was updated.` };
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
