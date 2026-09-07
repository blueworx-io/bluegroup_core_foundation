// The design system's version is what decides which copy loads on a site with
// two BlueWorx plugins (see the skill's design-system.php). A stylesheet change
// that ships under an unchanged version never reaches a site where an older copy
// is already installed — it ties, and the tie goes to whoever registered first.
// So the two move together, and this is what says so.

import { compareSemver } from './semver.mjs';

export function parseDesignSystemVersion(php) {
  const m = /blueworx_admin_design_register\(\s*'([0-9]+\.[0-9]+\.[0-9]+)'/.exec(php ?? '');
  return m ? m[1] : '';
}

// `baseVersion` alone cannot tell "the file was new on this PR" apart from
// "something failed to read it" — both come back as ''. The first is fine (the
// PR that creates design-system.php has nothing to compare against); the
// second is the exact silent-pass hole a shallow checkout opens. So the two
// facts the caller can actually observe from git — did the base ref resolve
// at all, and did the registrar exist there — are passed in separately, and
// only the "existed but unreadable" case fails.
export function designSystemVersionBump({
  styleChanged,
  baseVersion,
  headVersion,
  baseRefExists,
  baseRegistrarExisted,
  baseRef,
}) {
  if (!styleChanged) {
    return { ok: true, message: 'Design system version: styles.css unchanged — nothing to bump.' };
  }
  if (!headVersion) {
    return { ok: false, message: 'Design system version: could not read the version from design-system.php.' };
  }
  // A ref that won't resolve is what a shallow checkout looks like: this guard
  // has no history to compare against and would otherwise pass every PR
  // without ever saying so. That must be loud, not a quiet pass.
  if (!baseRefExists) {
    return {
      ok: false,
      message: `Design system version: could not resolve ${baseRef || 'the base ref'} — the checkout is probably shallow, so this guard has no history to compare against.`,
    };
  }
  // The registrar genuinely did not exist on the base — e.g. this is the PR
  // that introduces design-system.php. Nothing to compare against, and that
  // is not a problem.
  if (!baseRegistrarExisted) {
    return {
      ok: true,
      message: `Design system version: ${headVersion} is the first version of the registrar — nothing to compare against.`,
    };
  }
  // The registrar existed on the base but its version could not be read —
  // the ref resolved and the file was there, so this is not the "brand new
  // file" case above. Usually means the register call's shape changed in a
  // way the regex no longer matches. Fail loud rather than silently treating
  // it the same as "nothing to compare".
  if (!baseVersion) {
    return {
      ok: false,
      message: 'Design system version: could not read the version design-system.php had on the base branch — check the ref and the register call\'s shape.',
    };
  }
  if (compareSemver(headVersion, baseVersion) < 0) {
    return { ok: false, message: `Design system version: ${headVersion} is backwards from ${baseVersion}.` };
  }
  if (baseVersion === headVersion) {
    return {
      ok: false,
      message: [
        `Design system version: styles.css changed but the version is still ${headVersion}.`,
        '',
        "Bump the version in the register call at the bottom of",
        '.claude/skills/blueworx-admin-design/design-system.php — a stylesheet change',
        'under an unchanged version never reaches a site that already has an older',
        'copy of the design system installed.',
      ].join('\n'),
    };
  }
  return { ok: true, message: `Design system version: ${baseVersion} → ${headVersion}.` };
}
