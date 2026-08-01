#!/usr/bin/env node
// Headless: fails the build unless this PR has a healthy Netlify preview deploy.
//
// Two assertions, and both matter:
//   1. Netlify reported the deploy-preview commit status as success. A stale
//      preview from an earlier push would answer a request perfectly well, so
//      reachability alone proves nothing about *this* commit.
//   2. The preview URL actually answers. A status can say success while the
//      site 404s behind a deploy-protection wall or a bad redirect.
//
// Env:
//   GH_TOKEN / GITHUB_TOKEN  required, to read commit statuses
//   GITHUB_REPOSITORY        owner/repo (set by Actions)
//   COMMIT_SHA               the PR head sha to read statuses from
//   PREVIEW_URL              optional override; otherwise the status target_url
//   TIMEOUT_SECONDS          how long to wait for Netlify to report (default 600)
//   POLL_SECONDS             gap between polls (default 15)

import { netlifyPreview } from './lib/checks.mjs';

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const sha = process.env.COMMIT_SHA;
const override = (process.env.PREVIEW_URL || '').trim();
const timeoutMs = Number(process.env.TIMEOUT_SECONDS || 600) * 1000;
const pollMs = Number(process.env.POLL_SECONDS || 15) * 1000;

if (!token || !repo || !sha) {
  fail('Missing GH_TOKEN, GITHUB_REPOSITORY or COMMIT_SHA — cannot read the preview status.');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function statuses() {
  const res = await fetch(`https://api.github.com/repos/${repo}/commits/${sha}/statuses?per_page=100`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) fail(`GitHub returned ${res.status} reading commit statuses for ${sha}.`);
  return res.json();
}

const deadline = Date.now() + timeoutMs;
let verdict = await pollForVerdict();

async function pollForVerdict() {
  let last;
  for (;;) {
    last = netlifyPreview({ statuses: await statuses() });
    if (!last.pending) return last;
    if (Date.now() >= deadline) {
      return {
        ...last,
        message:
          `${last.message}\n  Gave up after ${Math.round(timeoutMs / 1000)}s. ` +
          'A headless project must deploy a preview on every PR — if Netlify is not connected to this repo, ' +
          'connect it or set require_netlify_preview: false and say why in the caller workflow.',
      };
    }
    console.log(`${last.message} Waiting ${pollMs / 1000}s…`);
    await sleep(pollMs);
  }
}

if (!verdict.ok) fail(verdict.message);
console.log(verdict.message);

// Reachability. The status says Netlify finished; this says the result is
// something a reviewer can actually open.
const url = override || verdict.url;
if (!url) fail('The preview deploy succeeded but reported no URL, and no netlify_preview_url was set.');

let lastError = 'no attempt made';
for (let attempt = 1; attempt <= 3; attempt += 1) {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (res.ok) {
      console.log(`Preview reachable: ${url} responded ${res.status}.`);
      process.exit(0);
    }
    lastError = `responded ${res.status}`;
  } catch (err) {
    lastError = err?.message ?? String(err);
  }
  if (attempt < 3) await sleep(5000);
}
fail(`The preview deploy succeeded but ${url} is not reachable — ${lastError}.`);

function fail(message) {
  console.error(`::error title=Netlify preview check failed::${message.split('\n')[0]}`);
  console.error(message);
  process.exit(1);
}
