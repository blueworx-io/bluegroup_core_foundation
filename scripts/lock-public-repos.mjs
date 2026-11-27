#!/usr/bin/env node
// Stops strangers changing anything in the organisation's public repos, without
// making them private: only people with access can open issues, open pull
// requests or comment. Issues stay on, so Forge's GitHub sync keeps working,
// and the repos stay public, so client sites keep fetching plugin updates.
//
//   node scripts/lock-public-repos.mjs            show what would change (changes nothing)
//   node scripts/lock-public-repos.mjs --apply    lock them, and renew the limit for a fresh six months
//   node scripts/lock-public-repos.mjs --check    prove it, as a second account with no access
//
// Environment:
//   GITHUB_TOKEN    an organisation owner's token (admin:org and repo scope). Needed for all
//                   three; --check only reads the limit with it. Never put it in a file.
//   STRANGER_TOKEN  a classic token from a second GitHub account that is NOT in the
//                   organisation. Needed for --check only.
//   LOCK_ORG        the organisation (default blueworx-io)
//
// Exits 0 when everything is as it should be, 1 when something needs doing or
// a stranger got through, 2 when it could not talk to GitHub.

import { applyLock, getLimit, githubRequest, isFineGrainedToken, limitProblemForCheck, lostConnection, listPublicRepos, planLock, probeAsStranger, probeFailures, vetStranger, writeRouteProblems } from './lib/repo-lock.mjs';

const org = process.env.LOCK_ORG || 'blueworx-io';
const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const check = args.has('--check');

async function main() {
  if (args.has('--help') || (apply && check)) {
    console.log('Usage: lock-public-repos.mjs [--apply | --check]   (see the top of this file)');
    return apply && check ? 2 : 0;
  }

  if (check) {
    const token = process.env.STRANGER_TOKEN;
    if (!token) throw new Error('--check needs STRANGER_TOKEN: a token from a second GitHub account with no access to the organisation.');
    if (isFineGrainedToken(token)) {
      throw new Error('STRANGER_TOKEN is a fine-grained token. It can never write to our public repos, so its refusals prove nothing. Use a classic token with the public_repo scope.');
    }
    // The stranger cannot read the setting, so an owner's token confirms that the
    // limit in force is collaborators only. A refusal under a looser one proves nothing.
    const adminToken = process.env.GITHUB_TOKEN;
    if (!adminToken) throw new Error('--check also needs GITHUB_TOKEN, to confirm the limit in force is collaborators only and that the stranger has no access. Read only is enough, but it must be able to read Administration and Members (a classic token with repo and read:org does).');
    const problem = limitProblemForCheck(await getLimit(githubRequest({ token: adminToken }), org), new Date());
    if (problem) {
      console.log(`PROBLEM  ${problem}`);
      return 1;
    }
    const request = githubRequest({ token });
    const adminRequest = githubRequest({ token: adminToken });
    const repos = await listPublicRepos(adminRequest, org);
    if (repos.length === 0) throw new Error(`No public repos found under ${org}.`);
    const open = repos.filter((r) => !r.archived);
    // Make sure the account is really an outsider before it posts anything.
    const vet = await vetStranger(request, adminRequest, org, open);
    if (vet.problems.length) {
      for (const line of vet.problems) console.log(`PROBLEM  ${line}`);
      console.log('Nothing was posted.');
      // GitHub not answering is "could not talk to GitHub" (2), not a problem with the lock (1).
      return vet.unreachable ? 2 : 1;
    }
    console.log(`Checking as ${vet.login}, who has no access to ${org}.`);
    const results = await probeAsStranger(request, org, open);
    // Wikis, projects and discussions are other places a stranger could write.
    const failures = [...writeRouteProblems(repos), ...probeFailures(results)];
    console.log(`Tried ${results.length} things as a stranger across ${repos.length} public repos.`);
    for (const line of failures) console.log(`PROBLEM  ${line}`);
    if (failures.length === 0) console.log('Every attempt was blocked.');
    else console.log('This is not a pass: "inconclusive" and "not tested" mean the lock was not proven.');
    // No reply from GitHub is "could not talk to GitHub" (2), not a problem with the lock (1).
    if (lostConnection(results)) {
      console.log('GitHub stopped answering during the check. Remove any links listed above by hand, then run it again.');
      return 2;
    }
    return failures.length === 0 ? 0 : 1;
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('Set GITHUB_TOKEN to an organisation owner\'s token first.');
  const request = githubRequest({ token });
  const repos = await listPublicRepos(request, org);
  if (repos.length === 0) throw new Error(`No public repos found under ${org}.`);
  const plan = planLock({ repos, limit: await getLimit(request, org), now: new Date(), renew: apply });

  console.log(`${repos.length} public repos under ${org}.`);
  if (plan.limitProblem) console.log(`TO DO    ${plan.limitProblem}`);
  else if (plan.daysLeft !== null) console.log(`OK       Limited to collaborators only; ${Math.floor(plan.daysLeft)} days left.`);
  for (const fix of plan.repoFixes) console.log(`TO DO    ${fix.name}: switch off ${Object.keys(fix.changes).map((k) => k.replace('has_', '')).join(', ')}.`);
  for (const w of plan.warnings) console.log(`WARNING  ${w}`);

  if (plan.ok) {
    console.log('Nothing to change.');
    return 0;
  }
  if (!apply) {
    console.log('\nThis was a dry run. Run again with --apply to make the changes.');
    return 1;
  }
  for (const line of await applyLock(request, org, plan)) console.log(`DONE     ${line}`);
  console.log('\nNow run it with --check and STRANGER_TOKEN to prove it. Renew within 5 months.');
  return 0;
}

// Set the exit code instead of calling process.exit(), so everything already
// printed is written out before the script ends.
main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(err.message);
    process.exitCode = 2;
  },
);
