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

export function designSystemVersionBump({ styleChanged, baseVersion, headVersion }) {
  if (!styleChanged) {
    return { ok: true, message: 'Design system version: styles.css unchanged — nothing to bump.' };
  }
  if (!headVersion) {
    return { ok: false, message: 'Design system version: could not read the version from design-system.php.' };
  }
  if (baseVersion && compareSemver(headVersion, baseVersion) < 0) {
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
