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
// Renew when fewer days than this are left on the limit.
export const RENEW_WITHIN_DAYS = 30;

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
 * @param {{repos: object[], limit: {limit: string, expiresAt: Date|null}|null, now: Date}} input
 */
export function planLock({ repos, limit, now }) {
  const daysLeft = limit?.expiresAt ? (limit.expiresAt.getTime() - now.getTime()) / DAY_MS : null;
  let limitProblem = null;
  if (!limit) limitProblem = 'No limit is set, so anyone with a GitHub account can open issues, pull requests and comments.';
  else if (limit.limit !== LIMIT) limitProblem = `The limit is "${limit.limit}", which still lets some outsiders in. It must be "${LIMIT}".`;
  else if (daysLeft !== null && daysLeft < 0) limitProblem = 'The limit has expired.';
  else if (daysLeft !== null && daysLeft < RENEW_WITHIN_DAYS) {
    limitProblem = `The limit runs out in ${Math.floor(daysLeft)} days. Renew it.`;
  }

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

/** Turns an HTTP status from a stranger's attempt into a verdict. Pure. */
export function judgeProbe(status) {
  if (status === 201) return 'open';
  if (status === 403 || status === 404) return 'blocked';
  if (status === 401) return 'bad-token';
  return 'unclear';
}

/**
 * Tries, as a second account with no access, to open an issue and add a comment
 * on every repo. Whatever it manages to create, it removes again. `request` must
 * carry the stranger's token, never an admin's.
 * @returns {Promise<{repo: string, action: string, verdict: string, status: number}[]>}
 */
export async function probeAsStranger(request, org, repos) {
  const results = [];
  for (const repo of repos) {
    const base = `/repos/${org}/${repo.name}`;

    const issue = await request('POST', `${base}/issues`, {
      title: 'Access check (safe to ignore)',
      body: 'Created by the repo lock check. If you can see this, the repo is not locked.',
    });
    results.push({ repo: repo.name, action: 'open an issue', verdict: judgeProbe(issue.status), status: issue.status });
    if (issue.status === 201 && issue.body?.number) {
      await request('PATCH', `${base}/issues/${issue.body.number}`, { state: 'closed' });
    }

    const existing = await request('GET', `${base}/issues?state=all&per_page=1`);
    const target = Array.isArray(existing.body) ? existing.body[0]?.number : undefined;
    if (target) {
      const comment = await request('POST', `${base}/issues/${target}/comments`, { body: 'Access check (safe to ignore).' });
      results.push({ repo: repo.name, action: 'comment', verdict: judgeProbe(comment.status), status: comment.status });
      if (comment.status === 201 && comment.body?.id) {
        await request('DELETE', `${base}/issues/comments/${comment.body.id}`);
      }
    }
  }
  return results;
}

/** One line per repo-action that is not properly blocked. Pure. */
export function probeFailures(results) {
  return results
    .filter((r) => r.verdict !== 'blocked')
    .map((r) => {
      if (r.verdict === 'open') return `${r.repo}: a stranger could ${r.action}.`;
      if (r.verdict === 'bad-token') return `${r.repo}: GitHub rejected the stranger's token, so this was not tested.`;
      return `${r.repo}: could not tell whether a stranger can ${r.action} (HTTP ${r.status}).`;
    });
}
