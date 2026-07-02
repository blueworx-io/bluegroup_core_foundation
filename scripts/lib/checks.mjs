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

function toNameSet(allow) {
  if (Array.isArray(allow)) return new Set(allow);
  if (allow && typeof allow === 'object') return new Set(Object.keys(allow));
  return new Set();
}
