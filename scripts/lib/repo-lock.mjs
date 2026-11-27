// Locks the organisation's public repos so only people with access can open
// issues, open pull requests or comment, while the repos stay public (client
// sites fetch plugin updates from them without a token) and Issues stay switched
// on (Forge's GitHub sync needs them).
//
// The lock is GitHub's organisation-wide "interaction limit", set to
// `collaborators_only`. GitHub caps it at six months, so it has to be renewed:
// `planLock` flags a limit that is missing, wrong, or close to running out.
//
// Everything that decides something is pure and tested here. The only network
// call is `request`, passed in, so tests never touch GitHub.

export const LIMIT = 'collaborators_only';
export const EXPIRY = 'six_months';
// Renew when fewer days than this are left on the limit. Wide enough that a check
// run once a month (up to 31 days apart) always sees the warning before it lapses.
export const RENEW_WITHIN_DAYS = 60;

// Switched off on every public repo: strangers could write to these too.
// Issues are deliberately NOT here — Forge's sync needs them.
export const REPO_SETTINGS = { has_wiki: false, has_projects: false, has_discussions: false };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Builds the function the script uses to talk to GitHub.
 * @param {{token: string, fetchImpl?: typeof fetch}} options
 * @returns {(method: string, path: string, body?: object) => Promise<{status: number, body: any, next: string|null}>}
 */
export function githubRequest({ token, fetchImpl = fetch }) {
  return async function request(method, path, body) {
    const url = path.startsWith('https://') ? path : `https://api.github.com${path}`;
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'blueworx-repo-lock',
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetchImpl(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    const link = res.headers?.get?.('link') ?? '';
    const next = /<([^>]+)>;\s*rel="next"/.exec(link)?.[1] ?? null;
    return { status: res.status, body: parsed, next };
  };
}

async function mustSucceed(response, what) {
  if (response.status >= 200 && response.status < 300) return response;
  const detail = typeof response.body?.message === 'string' ? `: ${response.body.message}` : '';
  throw new Error(`${what} failed (HTTP ${response.status}${detail})`);
}

/** Every repo in the organisation that is not private, archived or not. */
export async function listPublicRepos(request, org) {
  const repos = [];
  let path = `/orgs/${org}/repos?type=public&per_page=100`;
  while (path) {
    const res = await mustSucceed(await request('GET', path), 'Listing the repos');
    repos.push(...res.body.filter((r) => !r.private));
    path = res.next;
  }
  return repos.map((r) => ({
    name: r.name,
    archived: Boolean(r.archived),
    has_issues: r.has_issues !== false,
    has_wiki: Boolean(r.has_wiki),
    has_projects: Boolean(r.has_projects),
    has_discussions: Boolean(r.has_discussions),
  }));
}

/** The organisation's current interaction limit, or null when there is none. */
export async function getLimit(request, org) {
  const res = await mustSucceed(await request('GET', `/orgs/${org}/interaction-limits`), 'Reading the limit');
  const b = res.body;
  if (!b || !b.limit) return null;
  return { limit: b.limit, expiresAt: b.expires_at ? new Date(b.expires_at) : null };
}

/**
 * Decides what has to change. Pure.
 * `renew` forces the limit to be set again, so a full six months start from now.
 * @param {{repos: object[], limit: {limit: string, expiresAt: Date|null}|null, now: Date, renew?: boolean}} input
 */
export function planLock({ repos, limit, now, renew = false }) {
  const daysLeft = limit?.expiresAt ? (limit.expiresAt.getTime() - now.getTime()) / DAY_MS : null;
  let limitProblem = null;
  if (!limit) limitProblem = 'No limit is set, so anyone with a GitHub account can open issues, pull requests and comments.';
  else if (limit.limit !== LIMIT) limitProblem = `The limit is "${limit.limit}", which still lets some outsiders in. It must be "${LIMIT}".`;
  else if (daysLeft !== null && daysLeft < 0) limitProblem = 'The limit has expired.';
  else if (daysLeft !== null && daysLeft < RENEW_WITHIN_DAYS) {
    limitProblem = `The limit runs out in ${Math.floor(daysLeft)} days. Renew it.`;
  } else if (renew) limitProblem = 'Renewing the limit for a full six months from today.';

  const repoFixes = [];
  const warnings = [];
  for (const repo of repos) {
    const changes = {};
    for (const [key, want] of Object.entries(REPO_SETTINGS)) {
      if (repo[key] !== want) changes[key] = want;
    }
    // Archived repos are read-only already, and GitHub refuses to edit them.
    if (repo.archived) {
      if (Object.keys(changes).length) warnings.push(`${repo.name} is archived, so its settings were left alone.`);
    } else if (Object.keys(changes).length) {
      repoFixes.push({ name: repo.name, changes });
    }
    if (!repo.has_issues && !repo.archived) {
      warnings.push(`${repo.name} has Issues switched off. Forge's GitHub sync needs them on.`);
    }
  }

  return {
    limitProblem,
    needsLimit: limitProblem !== null,
    daysLeft,
    repoFixes,
    warnings,
    ok: limitProblem === null && repoFixes.length === 0,
  };
}

/** Sets the limit and switches off the other write routes. Returns what it did. */
export async function applyLock(request, org, plan) {
  const done = [];
  if (plan.needsLimit) {
    await mustSucceed(await request('PUT', `/orgs/${org}/interaction-limits`, { limit: LIMIT, expiry: EXPIRY }), 'Setting the limit');
    done.push(`Limited ${org} to collaborators only for six months.`);
  }
  for (const fix of plan.repoFixes) {
    await mustSucceed(await request('PATCH', `/repos/${org}/${fix.name}`, fix.changes), `Updating ${fix.name}`);
    done.push(`${fix.name}: switched off ${Object.keys(fix.changes).map((k) => k.replace('has_', '')).join(', ')}.`);
  }
  return done;
}

// What GitHub says when it refuses for a reason that is NOT the lock: rate limits
// (also sent as 403), and a token that is simply not allowed to write to a repo
// outside its own account (what a fine-grained token always gets).
const NOT_THE_LOCK = /rate limit|abuse|secondary|resource not accessible|personal access token|fine-grained|bad credentials|requires authentication/i;
// What a refusal because of an interaction limit says. Generic words such as
// "restricted" are not enough. Which limit is active is checked separately with
// `limitProblemForCheck`, because a "prior contributors" limit refuses in the same words.
const THE_LOCK = /interaction|limited to/i;

/**
 * Before trusting a stranger's refusals, the active setting must be the right one.
 * Pure. Returns a plain problem, or null when the limit is collaborators only
 * and has not run out.
 */
export function limitProblemForCheck(limit, now) {
  if (!limit) return 'No interaction limit is set, so the refusals cannot come from the lock.';
  if (limit.limit !== LIMIT) return `The active limit is "${limit.limit}", not "${LIMIT}", so some outsiders can still write.`;
  if (limit.expiresAt && limit.expiresAt.getTime() <= now.getTime()) return 'The limit has expired.';
  return null;
}

/** A fine-grained token can never write to our public repos, so it proves nothing. */
export function isFineGrainedToken(token) {
  return String(token).startsWith('github_pat_');
}

/**
 * The other places a stranger could write (wiki, projects, discussions) must be
 * switched off on every public repo, or a locked issue tracker proves little.
 * Pure. Archived repos are read-only already.
 */
export function writeRouteProblems(repos) {
  const lines = [];
  for (const repo of repos) {
    if (repo.archived) continue;
    for (const [key, want] of Object.entries(REPO_SETTINGS)) {
      if (repo[key] !== want) {
        lines.push(`${repo.name}: ${key.replace('has_', '')} is switched on, so a stranger may be able to write there. Run --apply.`);
      }
    }
  }
  return lines;
}

/**
 * Before the stranger posts anything, make sure it really is a stranger: the
 * owner's account, an organisation member or a collaborator on any repo would be
 * let in by the lock, so its successes and refusals would prove nothing.
 * `strangerRequest` carries the stranger's token, `adminRequest` the owner's.
 * Returns the account's name and the problems found (none means it is a stranger).
 */
export async function vetStranger(strangerRequest, adminRequest, org, repos) {
  let me;
  try {
    me = await strangerRequest('GET', '/user');
  } catch {
    return { login: null, problems: ['Could not reach GitHub to see whose token STRANGER_TOKEN is. Nothing was posted.'] };
  }
  const login = me.body?.login;
  if (me.status !== 200 || !login) {
    return { login: null, problems: [`GitHub did not accept STRANGER_TOKEN (HTTP ${me.status}), so nothing was posted.`] };
  }
  const problems = [];
  if (login.toLowerCase() === String(org).toLowerCase()) {
    problems.push(`STRANGER_TOKEN belongs to ${login}, the account that owns the repos. Use a different account.`);
  }
  const ask = async (path) => {
    try {
      return (await adminRequest('GET', path)).status;
    } catch {
      return 0;
    }
  };
  // A token that cannot read who has access answers 404 to everything, which would
  // look like "no access". Prove it can: the owner's own account is a collaborator.
  let adminLogin = null;
  try {
    adminLogin = (await adminRequest('GET', '/user')).body?.login ?? null;
  } catch {
    adminLogin = null;
  }
  if (repos.length > 0) {
    const canary = adminLogin ? await ask(`/repos/${org}/${repos[0].name}/collaborators/${adminLogin}`) : 0;
    if (canary !== 204) {
      return {
        login,
        problems: [
          'GITHUB_TOKEN cannot read who has access to the repos, so a "no access" answer would prove nothing. Give it Administration (read) and Members (read) on the organisation, or use a classic token with repo and read:org. Nothing was posted.',
        ],
      };
    }
  }
  // 204 means yes. For a personal account the members route answers 404, which is fine.
  const member = await ask(`/orgs/${org}/members/${login}`);
  if (member === 204) problems.push(`${login} is a member of ${org}, so the lock lets it in. Use an account with no access.`);
  else if (member !== 404) problems.push(`Could not tell whether ${login} is a member of ${org} (HTTP ${member || 'no reply'}).`);
  for (const repo of repos) {
    const status = await ask(`/repos/${org}/${repo.name}/collaborators/${login}`);
    if (status === 204) problems.push(`${login} is a collaborator on ${repo.name}, so the lock lets it in. Use an account with no access.`);
    else if (status !== 404) problems.push(`Could not tell whether ${login} has access to ${repo.name} (HTTP ${status || 'no reply'}).`);
  }
  return { login, problems };
}

/**
 * Turns a stranger's attempt into a verdict. Pure. Only a refusal that names the
 * interaction limit counts as proof. Any other refusal is "unclear", and GitHub's
 * own words are kept so the person running it can see why.
 */
export function judgeProbe(status, message = '') {
  if (status === 201) return 'open';
  if (status === 401) return 'bad-token';
  if (status === 403 && !NOT_THE_LOCK.test(message) && THE_LOCK.test(message)) return 'blocked';
  return 'unclear';
}

/**
 * Tries, as a second account with no access, to open an issue and add a comment
 * on every repo. Whatever it manages to create, it removes again. `request` must
 * carry the stranger's token, never an admin's.
 * @returns {Promise<{repo: string, action: string, verdict: string, status: number}[]>}
 */
export async function probeAsStranger(rawRequest, org, repos) {
  const results = [];
  // A dropped connection becomes a reply with status 0, so the run carries on and
  // the clean-up links already collected are never thrown away with an exception.
  const request = async (method, path, body) => {
    try {
      return await rawRequest(method, path, body);
    } catch {
      return { status: 0, body: { message: 'no reply from GitHub' }, next: null };
    }
  };
  const note = (repo, action, res) => ({
    repo,
    action,
    verdict: judgeProbe(res.status, res.body?.message),
    status: res.status,
    message: res.body?.message ?? '',
  });
  for (const repo of repos) {
    const base = `/repos/${org}/${repo.name}`;

    const issue = await request('POST', `${base}/issues`, {
      title: 'Access check (safe to ignore)',
      body: 'Created by the repo lock check. If you can see this, the repo is not locked.',
    });
    results.push(note(repo.name, 'open an issue', issue));
    if (issue.status === 201 && issue.body?.number) {
      const url = issue.body.html_url ?? `${base}/issues/${issue.body.number}`;
      await cleanUp(results, repo.name, 'close the test issue', url, 200, () =>
        request('PATCH', `${base}/issues/${issue.body.number}`, { state: 'closed' }),
      );
    }

    // A thread locked on its own refuses everyone, so it says nothing about the
    // lock: look for one that is not, on any page.
    const found = await findUnlockedThread(request, base);
    if (!found.thread) {
      results.push({ repo: repo.name, action: 'comment', verdict: 'not-run', status: found.status, message: '' });
      continue;
    }
    const target = found.thread;
    const comment = await request('POST', `${base}/issues/${target.number}/comments`, { body: 'Access check (safe to ignore).' });
    results.push(note(repo.name, 'comment', comment));
    if (comment.status === 201 && comment.body?.id) {
      const url = comment.body.html_url ?? `${base}/issues/${target.number}`;
      await cleanUp(results, repo.name, 'delete the test comment', url, 204, () =>
        request('DELETE', `${base}/issues/comments/${comment.body.id}`),
      );
    }
  }
  return results;
}

// Pages through a repo's issues and pull requests until one is not locked.
// Stops after a few pages: a repo with that many locked threads in a row is odd
// enough to be reported as "not tested".
const MAX_THREAD_PAGES = 10;
async function findUnlockedThread(request, base) {
  let path = `${base}/issues?state=all&per_page=30`;
  let status = 0;
  for (let page = 0; path && page < MAX_THREAD_PAGES; page++) {
    let res;
    res = await request('GET', path);
    status = res.status;
    if (!Array.isArray(res.body)) break;
    const thread = res.body.find((i) => i && !i.locked);
    if (thread) return { thread, status };
    path = res.next;
  }
  return { thread: undefined, status };
}

// Undoes a test post. A dropped connection or a refusal must not lose the link,
// so both are reported with it instead of ending the run.
async function cleanUp(results, repo, action, url, okStatus, run) {
  try {
    const res = await run();
    if (res.status === okStatus) return;
    results.push({ repo, action, verdict: 'cleanup-failed', status: res.status, url });
  } catch {
    results.push({ repo, action, verdict: 'cleanup-failed', status: 0, url });
  }
}

/** True when GitHub stopped answering during the check, so it must end as "could not talk to GitHub". Pure. */
export function lostConnection(results) {
  return results.some((r) => r.status === 0);
}

/** One line per repo-action that is not properly blocked. Pure. */
export function probeFailures(results) {
  return results
    .filter((r) => r.verdict !== 'blocked')
    .map((r) => {
      if (r.verdict === 'open') return `${r.repo}: a stranger could ${r.action}.`;
      if (r.verdict === 'bad-token') return `${r.repo}: GitHub rejected the stranger's token, so this was not tested.`;
      if (r.verdict === 'not-run') return `${r.repo}: could not test commenting, because no unlocked thread was found. Not tested.`;
      if (r.verdict === 'cleanup-failed') return `${r.repo}: could not ${r.action} (${r.status ? `HTTP ${r.status}` : 'no reply'}). Remove it by hand: ${r.url}`;
      const why = r.message ? ` GitHub said: "${r.message}".` : '';
      return `${r.repo}: inconclusive. Could not tell whether a stranger can ${r.action} (HTTP ${r.status}).${why}`;
    });
}
