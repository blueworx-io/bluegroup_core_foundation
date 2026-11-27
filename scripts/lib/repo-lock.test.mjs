import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyLock,
  getLimit,
  githubRequest,
  isFineGrainedToken,
  limitProblemForCheck,
  judgeProbe,
  listPublicRepos,
  lostConnection,
  planLock,
  probeAsStranger,
  probeFailures,
  vetStranger,
  writeRouteProblems,
} from './repo-lock.mjs';

const NOW = new Date('2026-11-24T00:00:00Z');
const daysFromNow = (d) => new Date(NOW.getTime() + d * 86400000);

const repo = (name, extra = {}) => ({
  name,
  archived: false,
  has_issues: true,
  has_wiki: false,
  has_projects: false,
  has_discussions: false,
  ...extra,
});
const goodLimit = (days = 150) => ({ limit: 'collaborators_only', expiresAt: daysFromNow(days) });

// A fake GitHub: records calls, answers from a table keyed "METHOD path".
function fakeApi(table) {
  const calls = [];
  const request = async (method, path, body) => {
    calls.push({ method, path, body });
    const hit = table[`${method} ${path}`];
    const res = typeof hit === 'function' ? hit(body) : hit;
    return res ?? { status: 404, body: { message: 'Not Found' }, next: null };
  };
  return { request, calls };
}

test('no limit at all is a problem', () => {
  const plan = planLock({ repos: [repo('a')], limit: null, now: NOW });
  assert.equal(plan.needsLimit, true);
  assert.equal(plan.ok, false);
});

test('a looser limit than collaborators only is a problem', () => {
  for (const limit of ['existing_users', 'contributors_only']) {
    const plan = planLock({ repos: [repo('a')], limit: { limit, expiresAt: daysFromNow(100) }, now: NOW });
    assert.equal(plan.needsLimit, true, limit);
  }
});

test('an expired or nearly expired limit is renewed', () => {
  assert.equal(planLock({ repos: [], limit: goodLimit(-1), now: NOW }).needsLimit, true);
  assert.equal(planLock({ repos: [], limit: goodLimit(10), now: NOW }).needsLimit, true);
  assert.equal(planLock({ repos: [], limit: goodLimit(61), now: NOW }).needsLimit, false);
});

test('a good limit and tidy repos need nothing', () => {
  const plan = planLock({ repos: [repo('a'), repo('b')], limit: goodLimit(), now: NOW });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.repoFixes, []);
});

test('wiki, projects and discussions are switched off, issues are left on', () => {
  const plan = planLock({
    repos: [repo('a', { has_wiki: true, has_discussions: true })],
    limit: goodLimit(),
    now: NOW,
  });
  assert.deepEqual(plan.repoFixes, [{ name: 'a', changes: { has_wiki: false, has_discussions: false } }]);
  assert.ok(!('has_issues' in plan.repoFixes[0].changes));
});

test('a repo with Issues off is warned about, because Forge needs them', () => {
  const plan = planLock({ repos: [repo('a', { has_issues: false })], limit: goodLimit(), now: NOW });
  assert.match(plan.warnings[0], /Forge/);
});

test('archived repos are not edited', () => {
  const plan = planLock({ repos: [repo('old', { archived: true, has_wiki: true })], limit: goodLimit(), now: NOW });
  assert.deepEqual(plan.repoFixes, []);
  assert.match(plan.warnings[0], /archived/);
});

test('listPublicRepos follows pages and drops private repos', async () => {
  const { request } = fakeApi({
    'GET /orgs/o/repos?type=public&per_page=100': {
      status: 200,
      body: [{ name: 'one', private: false }, { name: 'secret', private: true }],
      next: '/orgs/o/repos?page=2',
    },
    'GET /orgs/o/repos?page=2': { status: 200, body: [{ name: 'two', private: false }], next: null },
  });
  const repos = await listPublicRepos(request, 'o');
  assert.deepEqual(repos.map((r) => r.name), ['one', 'two']);
});

test('listPublicRepos stops with a clear message when GitHub says no', async () => {
  const { request } = fakeApi({ 'GET /orgs/o/repos?type=public&per_page=100': { status: 401, body: { message: 'Bad credentials' } } });
  await assert.rejects(listPublicRepos(request, 'o'), /HTTP 401: Bad credentials/);
});

test('getLimit reads none, and a set limit', async () => {
  const none = fakeApi({ 'GET /orgs/o/interaction-limits': { status: 200, body: {} } });
  assert.equal(await getLimit(none.request, 'o'), null);
  const set = fakeApi({
    'GET /orgs/o/interaction-limits': { status: 200, body: { limit: 'collaborators_only', expires_at: '2027-01-01T00:00:00Z' } },
  });
  const got = await getLimit(set.request, 'o');
  assert.equal(got.limit, 'collaborators_only');
  assert.equal(got.expiresAt.toISOString(), '2027-01-01T00:00:00.000Z');
});

test('applyLock sets the limit for six months and patches only the repos that need it', async () => {
  const { request, calls } = fakeApi({
    'PUT /orgs/o/interaction-limits': { status: 200, body: {} },
    'PATCH /repos/o/a': { status: 200, body: {} },
  });
  const plan = planLock({ repos: [repo('a', { has_wiki: true }), repo('b')], limit: null, now: NOW });
  await applyLock(request, 'o', plan);
  assert.deepEqual(calls[0], { method: 'PUT', path: '/orgs/o/interaction-limits', body: { limit: 'collaborators_only', expiry: 'six_months' } });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].body, { has_wiki: false });
});

test('applyLock does nothing when nothing is wrong', async () => {
  const { request, calls } = fakeApi({});
  const plan = planLock({ repos: [repo('a')], limit: goodLimit(), now: NOW });
  assert.deepEqual(await applyLock(request, 'o', plan), []);
  assert.equal(calls.length, 0);
});

const LOCKED = { status: 403, body: { message: 'Unable to create: interactions are limited to collaborators.' } };

test('judgeProbe: only a refusal that names the limit proves the lock', () => {
  assert.equal(judgeProbe(201), 'open');
  assert.equal(judgeProbe(403, LOCKED.body.message), 'blocked');
  assert.equal(judgeProbe(401), 'bad-token');
  assert.equal(judgeProbe(500), 'unclear');
});

test('judgeProbe: rate limits, bare 403/404 and token refusals are inconclusive', () => {
  assert.equal(judgeProbe(403, 'API rate limit exceeded for user'), 'unclear');
  assert.equal(judgeProbe(403, 'You have exceeded a secondary rate limit'), 'unclear');
  assert.equal(judgeProbe(403, 'Resource not accessible by personal access token'), 'unclear');
  assert.equal(judgeProbe(403), 'unclear');
  assert.equal(judgeProbe(404, 'Not Found'), 'unclear');
});

test('a fine-grained token is recognised, a classic one is not', () => {
  assert.equal(isFineGrainedToken('github_pat_abc'), true);
  assert.equal(isFineGrainedToken('ghp_abc'), false);
});

test('probeAsStranger reports blocked everywhere when the lock holds', async () => {
  const { request } = fakeApi({
    'POST /repos/o/a/issues': LOCKED,
    'GET /repos/o/a/issues?state=all&per_page=30': { status: 200, body: [{ number: 7 }] },
    'POST /repos/o/a/issues/7/comments': LOCKED,
  });
  const results = await probeAsStranger(request, 'o', [repo('a')]);
  assert.equal(results.length, 2);
  assert.deepEqual(probeFailures(results), []);
});

test('probeAsStranger skips a locked thread and comments on an unlocked one', async () => {
  const { request, calls } = fakeApi({
    'POST /repos/o/a/issues': LOCKED,
    'GET /repos/o/a/issues?state=all&per_page=30': { status: 200, body: [{ number: 7, locked: true }, { number: 6, locked: false }] },
    'POST /repos/o/a/issues/6/comments': LOCKED,
  });
  await probeAsStranger(request, 'o', [repo('a')]);
  assert.ok(calls.some((c) => c.path === '/repos/o/a/issues/6/comments'));
  assert.ok(!calls.some((c) => c.path === '/repos/o/a/issues/7/comments'));
});

test('probeAsStranger says so when there is no unlocked thread to comment on', async () => {
  for (const lookup of [
    { status: 200, body: [] },
    { status: 200, body: [{ number: 7, locked: true }] },
    { status: 500, body: { message: 'oops' } },
  ]) {
    const { request } = fakeApi({ 'POST /repos/o/a/issues': LOCKED, 'GET /repos/o/a/issues?state=all&per_page=30': lookup });
    const failures = probeFailures(await probeAsStranger(request, 'o', [repo('a')]));
    assert.equal(failures.length, 1);
    assert.match(failures[0], /Not tested/);
  }
});

test('an unexplained 403 is reported as inconclusive with what GitHub said', async () => {
  const { request } = fakeApi({
    'POST /repos/o/a/issues': { status: 403, body: { message: 'API rate limit exceeded' } },
    'GET /repos/o/a/issues?state=all&per_page=30': { status: 200, body: [{ number: 7 }] },
    'POST /repos/o/a/issues/7/comments': LOCKED,
  });
  const failures = probeFailures(await probeAsStranger(request, 'o', [repo('a')]));
  assert.equal(failures.length, 1);
  assert.match(failures[0], /inconclusive.*API rate limit exceeded/);
});

test('failed cleanup of a test issue or comment prints a link to remove it', async () => {
  const { request } = fakeApi({
    'POST /repos/o/a/issues': { status: 201, body: { number: 9, html_url: 'https://github.com/o/a/issues/9' } },
    'PATCH /repos/o/a/issues/9': { status: 403, body: {} },
    'GET /repos/o/a/issues?state=all&per_page=30': { status: 200, body: [{ number: 3 }] },
    'POST /repos/o/a/issues/3/comments': { status: 201, body: { id: 55, html_url: 'https://github.com/o/a/issues/3#issuecomment-55' } },
    'DELETE /repos/o/a/issues/comments/55': { status: 403, body: {} },
  });
  const failures = probeFailures(await probeAsStranger(request, 'o', [repo('a')])).join('\n');
  assert.match(failures, /Remove it by hand: https:\/\/github.com\/o\/a\/issues\/9\b/);
  assert.match(failures, /Remove it by hand: https:\/\/github.com\/o\/a\/issues\/3#issuecomment-55/);
});

test('renew forces the limit to be set again even when plenty of time is left', async () => {
  const quiet = planLock({ repos: [repo('a')], limit: goodLimit(120), now: NOW });
  assert.equal(quiet.ok, true);
  const renew = planLock({ repos: [repo('a')], limit: goodLimit(120), now: NOW, renew: true });
  assert.equal(renew.needsLimit, true);
  const { request, calls } = fakeApi({ 'PUT /orgs/o/interaction-limits': { status: 200, body: {} } });
  await applyLock(request, 'o', renew);
  assert.equal(calls[0].body.expiry, 'six_months');
});

test('probeAsStranger catches a repo that is open, and cleans up what it created', async () => {
  const { request, calls } = fakeApi({
    'POST /repos/o/a/issues': { status: 201, body: { number: 9 } },
    'PATCH /repos/o/a/issues/9': { status: 200, body: {} },
    'GET /repos/o/a/issues?state=all&per_page=30': { status: 200, body: [{ number: 9 }] },
    'POST /repos/o/a/issues/9/comments': { status: 201, body: { id: 55 } },
    'DELETE /repos/o/a/issues/comments/55': { status: 204, body: null },
  });
  const failures = probeFailures(await probeAsStranger(request, 'o', [repo('a')]));
  assert.equal(failures.length, 2);
  assert.match(failures[0], /a stranger could open an issue/);
  assert.ok(calls.some((c) => c.method === 'PATCH' && c.body.state === 'closed'));
  assert.ok(calls.some((c) => c.method === 'DELETE'));
});

test('a rejected stranger token is not mistaken for a locked repo', () => {
  const failures = probeFailures([{ repo: 'a', action: 'open an issue', verdict: 'bad-token', status: 401 }]);
  assert.match(failures[0], /not tested/);
});

test('githubRequest sends the token, parses JSON and reads the next page link', async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, init };
    return {
      status: 200,
      text: async () => '[{"name":"x"}]',
      headers: { get: () => '<https://api.github.com/next>; rel="next"' },
    };
  };
  const res = await githubRequest({ token: 't', fetchImpl })('GET', '/orgs/o/repos');
  assert.equal(seen.url, 'https://api.github.com/orgs/o/repos');
  assert.equal(seen.init.headers.Authorization, 'Bearer t');
  assert.deepEqual(res.body, [{ name: 'x' }]);
  assert.equal(res.next, 'https://api.github.com/next');
});

test('the renewal warning is wide enough for a monthly check', () => {
  assert.equal(planLock({ repos: [], limit: goodLimit(59), now: NOW }).needsLimit, true);
  assert.equal(planLock({ repos: [], limit: goodLimit(61), now: NOW }).needsLimit, false);
});

test('generic words like "temporarily restricted" are not proof of the lock', () => {
  assert.equal(judgeProbe(403, 'Account temporarily restricted'), 'unclear');
  assert.equal(judgeProbe(403, 'Only collaborators can do this'), 'unclear');
});

test('limitProblemForCheck accepts only an unexpired collaborators-only limit', () => {
  assert.equal(limitProblemForCheck(goodLimit(100), NOW), null);
  assert.match(limitProblemForCheck(null, NOW), /No interaction limit/);
  assert.match(limitProblemForCheck({ limit: 'contributors_only', expiresAt: daysFromNow(100) }, NOW), /contributors_only/);
  assert.match(limitProblemForCheck(goodLimit(-1), NOW), /expired/);
});

test('a dropped connection during cleanup still reports the link', async () => {
  const table = {
    'POST /repos/o/a/issues': { status: 201, body: { number: 9, html_url: 'https://github.com/o/a/issues/9' } },
    'GET /repos/o/a/issues?state=all&per_page=30': { status: 200, body: [{ number: 3 }] },
    'POST /repos/o/a/issues/3/comments': LOCKED,
  };
  const request = async (method, path) => {
    if (method === 'PATCH') throw new Error('fetch failed');
    return table[`${method} ${path}`];
  };
  const failures = probeFailures(await probeAsStranger(request, 'o', [repo('a')])).join('\n');
  assert.match(failures, /no reply.*https:\/\/github.com\/o\/a\/issues\/9/);
});

test('an unlocked thread is found on a later page', async () => {
  const { request, calls } = fakeApi({
    'POST /repos/o/a/issues': LOCKED,
    'GET /repos/o/a/issues?state=all&per_page=30': { status: 200, body: [{ number: 7, locked: true }], next: '/repos/o/a/issues?page=2' },
    'GET /repos/o/a/issues?page=2': { status: 200, body: [{ number: 2, locked: false }], next: null },
    'POST /repos/o/a/issues/2/comments': LOCKED,
  });
  const results = await probeAsStranger(request, 'o', [repo('a')]);
  assert.deepEqual(probeFailures(results), []);
  assert.ok(calls.some((c) => c.path === '/repos/o/a/issues/2/comments'));
});

test('every thread locked on every page is reported as not tested', async () => {
  const { request } = fakeApi({
    'POST /repos/o/a/issues': LOCKED,
    'GET /repos/o/a/issues?state=all&per_page=30': { status: 200, body: [{ number: 7, locked: true }], next: '/repos/o/a/issues?page=2' },
    'GET /repos/o/a/issues?page=2': { status: 200, body: [{ number: 6, locked: true }], next: null },
  });
  const failures = probeFailures(await probeAsStranger(request, 'o', [repo('a')]));
  assert.match(failures[0], /Not tested/);
});

test('a repo with a wiki, projects or discussions on is reported by the check', () => {
  const lines = writeRouteProblems([repo('a', { has_wiki: true }), repo('b'), repo('c', { has_projects: true, has_discussions: true })]);
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^a: wiki is switched on/);
  assert.deepEqual(writeRouteProblems([repo('a'), repo('old', { archived: true, has_wiki: true })]), []);
});

test('a failed request later on keeps the clean-up links already collected', async () => {
  const table = {
    'POST /repos/o/a/issues': { status: 201, body: { number: 9, html_url: 'https://github.com/o/a/issues/9' } },
    'PATCH /repos/o/a/issues/9': { status: 403, body: {} },
    'GET /repos/o/a/issues?state=all&per_page=30': { status: 200, body: [{ number: 3 }] },
  };
  const request = async (method, path) => {
    if (method === 'POST' && path.endsWith('/comments')) throw new Error('fetch failed');
    return table[`${method} ${path}`] ?? LOCKED;
  };
  const failures = probeFailures(await probeAsStranger(request, 'o', [repo('a'), repo('b')])).join('\n');
  assert.match(failures, /Remove it by hand: https:\/\/github.com\/o\/a\/issues\/9\b/);
  assert.match(failures, /a: inconclusive.*comment.*HTTP 0/);
  assert.match(failures, /b: /); // the next repo is still tried
});

test('a failed thread listing is reported, not thrown', async () => {
  const request = async (method) => {
    if (method === 'GET') throw new Error('fetch failed');
    return LOCKED;
  };
  const failures = probeFailures(await probeAsStranger(request, 'o', [repo('a')]));
  assert.match(failures[0], /Not tested/);
});

// Answers the vetting calls: the stranger's own name, and what the owner sees.
function vetApi({ login = 'outsider', member = 404, collaborator = {}, canRead = true } = {}) {
  const stranger = async () => ({ status: 200, body: { login } });
  const admin = async (method, path) => {
    if (path === '/user') return { status: 200, body: { login: 'owner' } };
    if (path.endsWith('/collaborators/owner')) return { status: canRead ? 204 : 404, body: null };
    if (path === `/orgs/o/members/${login}`) return { status: member, body: null };
    const repoName = /\/repos\/o\/([^/]+)\/collaborators\//.exec(path)?.[1];
    return { status: collaborator[repoName] ?? 404, body: null };
  };
  return { stranger, admin };
}

test('an account with no access passes the check before anything is posted', async () => {
  const { stranger, admin } = vetApi();
  const vet = await vetStranger(stranger, admin, 'o', [repo('a'), repo('b')]);
  assert.deepEqual(vet, { login: 'outsider', problems: [] });
});

test('the owner, a member or a collaborator is not a stranger', async () => {
  const owner = vetApi({ login: 'O' });
  assert.match((await vetStranger(owner.stranger, owner.admin, 'o', [repo('a')])).problems[0], /owns the repos/);
  const member = vetApi({ member: 204 });
  assert.match((await vetStranger(member.stranger, member.admin, 'o', [repo('a')])).problems[0], /member of o/);
  const collab = vetApi({ collaborator: { b: 204 } });
  const found = (await vetStranger(collab.stranger, collab.admin, 'o', [repo('a'), repo('b')])).problems;
  assert.equal(found.length, 1);
  assert.match(found[0], /collaborator on b/);
});

test('a token GitHub rejects, or an unclear answer, stops the check', async () => {
  const bad = await vetStranger(async () => ({ status: 401, body: {} }), async () => ({ status: 404 }), 'o', [repo('a')]);
  assert.match(bad.problems[0], /did not accept STRANGER_TOKEN \(HTTP 401\)/);
  const down = await vetStranger(async () => { throw new Error('fetch failed'); }, async () => ({ status: 404 }), 'o', [repo('a')]);
  assert.match(down.problems[0], /Nothing was posted/);
  const unclear = vetApi({ collaborator: { a: 403 } });
  assert.match((await vetStranger(unclear.stranger, unclear.admin, 'o', [repo('a')])).problems[0], /Could not tell.*HTTP 403/);
});

test('an owner token that cannot read access lists stops the check, so a 404 is never taken as "no access"', async () => {
  const blind = vetApi({ canRead: false });
  const vet = await vetStranger(blind.stranger, blind.admin, 'o', [repo('a')]);
  assert.match(vet.problems[0], /GITHUB_TOKEN cannot read who has access.*Nothing was posted/);
  assert.equal(vet.problems.length, 1);
});

test('no reply from GitHub during the check is told apart from a lock problem', async () => {
  const request = async (method) => {
    if (method === 'POST') throw new Error('fetch failed');
    return { status: 200, body: [] };
  };
  const results = await probeAsStranger(request, 'o', [repo('a')]);
  assert.equal(lostConnection(results), true);
  assert.equal(lostConnection([{ repo: 'a', action: 'comment', verdict: 'blocked', status: 403 }]), false);
});
