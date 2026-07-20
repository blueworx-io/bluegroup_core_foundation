// Pure guardrail checks. Each returns { ok: boolean, message: string }
// (approvedDeps also returns offenders: string[]). No I/O here — callers
// gather inputs (git/fs) and pass them in, which keeps these unit-testable.

import { compareSemver } from './semver.mjs';

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

// A Playwright run that executes nothing still exits 0, so a suite that skips
// itself wholesale reports green having asserted nothing. Skipped tests do not
// count as executed — that is the failure mode this exists to catch.
export function testsExecuted({ report }) {
  const counts = countOutcomes(report);
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
