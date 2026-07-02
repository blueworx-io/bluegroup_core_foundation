// Zero-dependency SemVer parsing and comparison.
// Supports MAJOR.MINOR.PATCH with an optional -prerelease and +build,
// tolerating a leading "v". Build metadata is ignored for ordering.

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseSemver(value) {
  const m = String(value).trim().replace(/^v/i, '').match(SEMVER_RE);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: m[4] ?? null,
  };
}

// Returns -1 if a < b, 0 if equal, 1 if a > b. Throws on invalid input.
export function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa) throw new Error(`Invalid semver: ${a}`);
  if (!pb) throw new Error(`Invalid semver: ${b}`);

  for (const key of ['major', 'minor', 'patch']) {
    if (pa[key] !== pb[key]) return pa[key] < pb[key] ? -1 : 1;
  }

  // A version with no prerelease has higher precedence than one that has.
  if (pa.pre === null && pb.pre === null) return 0;
  if (pa.pre === null) return 1;
  if (pb.pre === null) return -1;
  return comparePrerelease(pa.pre, pb.pre);
}

function comparePrerelease(a, b) {
  const ai = a.split('.');
  const bi = b.split('.');
  const len = Math.max(ai.length, bi.length);
  for (let i = 0; i < len; i++) {
    const x = ai[i];
    const y = bi[i];
    if (x === undefined) return -1; // fewer identifiers ⇒ lower precedence
    if (y === undefined) return 1;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn && yn) {
      const d = Number(x) - Number(y);
      if (d !== 0) return d < 0 ? -1 : 1;
    } else if (xn) {
      return -1; // numeric identifiers rank below non-numeric
    } else if (yn) {
      return 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}
