# Locking our public repos

Our repos are public only so client sites can fetch plugin updates without a
token. Strangers must not be able to change anything in them: open an issue, open
a pull request, or comment.

## The choice

We keep the repos public and limit everything to people with access, using
GitHub's organisation-wide **interaction limit** set to "collaborators only".

| Option | Verdict |
|---|---|
| Private repos plus a read-only token on every site | Rejected. Every site needs the token, and rotating it means editing `wp-config.php` on each one. Today's sites have none. |
| **Public repos, interactions limited to collaborators** | **Chosen.** One setting for the whole organisation, applies to repos created later, nothing changes on client sites. |
| Private code, releases from a separate public repo | Rejected. A second repo per plugin and a release step to copy zips across, for no gain over the limit. |

What each requirement needs:

- **Strangers can't open, edit or comment.** The limit blocks new issues, pull
  requests and comments from anyone who is not a collaborator or organisation member.
- **Plugin updates still install.** Nothing about reading a public repo or its
  releases changes. No token is needed on client sites.
- **Forge's GitHub sync still works.** Issues stay switched on. The limit
  does not apply to organisation members and collaborators, so the account Forge
  syncs with must be one of them. `--apply` does not check this; step 3 under
  "Done when" does. The script warns if any repo has Issues off.

Wikis, projects and discussions are switched off on every public repo too, because
they are other places a stranger could write.

## The limit runs out

GitHub caps an interaction limit at **six months**. After that the repos are open
again. Renew it at least every five months by running the script below with
`--apply`. Every `--apply` sets the limit again for a fresh six months, so running
it early is safe. The script also warns
when fewer than 30 days remain, so running it without `--apply` each month is the
reminder. A scheduled workflow that does this is a possible follow-up; it needs an
organisation owner's token stored as a secret, so Luke decides that.

## Using the script

[`scripts/lock-public-repos.mjs`](../scripts/lock-public-repos.mjs) needs only
Node. Give it tokens in the environment, never in a file.

```bash
# 1. See what would change. Changes nothing.
GITHUB_TOKEN=<org owner token> node scripts/lock-public-repos.mjs

# 2. Lock everything, and renew the limit for a fresh six months.
GITHUB_TOKEN=<org owner token> node scripts/lock-public-repos.mjs --apply

# 3. Prove it from a second GitHub account that is not in the organisation.
STRANGER_TOKEN=<that account's token> node scripts/lock-public-repos.mjs --check
```

- `GITHUB_TOKEN`: an organisation owner's token with `admin:org` and repo admin rights.
- `STRANGER_TOKEN`: a **classic** token (`public_repo` scope) from an account with
  no access. A fine-grained token is refused up front: it can never write to our
  public repos, so its refusals would prove nothing.
- The check tries to open an issue and add a comment (on a thread that is not
  locked) on every public repo, and expects each to be refused *because of the
  limit*. A refusal for any other reason (a rate limit, an unexplained 403 or 404)
  is "inconclusive", and so is a repo with no thread to comment on. Neither is a
  pass. If an attempt gets through it says so, then closes or deletes what it
  made. If it cannot clean up, it prints the link to remove by hand.
- Exit code 0 means all good, 1 means something needs doing or a stranger got
  through, 2 means it could not reach GitHub.

## Done when

1. Run step 2, then step 3. Step 3 must end with "Every attempt was blocked."
2. On a client site, **Dashboard → Updates → Check again** still lists a newer
   plugin version (once a release is out).
3. In Forge, change an issue's linked card and see it update on GitHub, and the other way round.

## Limits to know about

- Anyone can still read the code and fork the repos. That is what public means.
- The interaction limit is the only lock used. Nothing here relies on a separate
  "who can open pull requests" setting.
- A new repo is covered by the limit at once. A new repo made public by mistake
  shows up in the script's next run.
