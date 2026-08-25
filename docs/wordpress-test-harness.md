# The local WordPress test harness

Every WordPress plugin project tests against a **disposable WordPress the run owns
outright** — provisioned by [`scripts/wp-test-env.mjs`](../scripts/wp-test-env.mjs).
No Docker, no MySQL, no hosted staging.

```bash
node ../bluegroup_core_foundation/scripts/wp-test-env.mjs up --plugin .
```

That downloads WordPress, wires up the SQLite drop-in, links your plugin, installs
and activates it, and serves it on `http://127.0.0.1:8881` on whatever PHP you
already have. Then:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:8881 \
WP_ADMIN_USER=admin WP_ADMIN_PASS=wptest-admin-pw \
  npx playwright test --workers=1
```

Tear down with `... wp-test-env.mjs down`. Both `up` and `down` reconcile against
whatever `php` is actually listening on the port, not just the pid they last
recorded — so an orphan left by an interrupted run (on Windows two servers can
bind one port and requests then route to whichever answers first) is cleaned up
rather than left holding the port. Only `php` processes on that port are ever
killed.

## Browsing the site without signing in

The admin password above is what the test suite needs. For simply looking at a
plugin's screens it means going through wp-login every time, and for a plugin that
gates its whole front end behind a login there is no way to click around as a
visitor would at all.

```bash
node ../bluegroup_core_foundation/scripts/wp-test-env.mjs up --plugin . --open
```

Every request on that site is then the admin — wp-admin, the front end, and REST
saves, which keep working because the flag signs the request in early enough for
the nonce to be computed for the same user. (Hand-rolling this with an auth cookie
is the version that breaks: the cookie arrives after the nonce, so every save comes
back 403.)

**Turn it off by running `up` again without `--open`** — the generated file is
removed and the site signs in through wp-login as before. It lives in `.wp-test/`,
never in the plugin, so it cannot reach a release.

Leave it off when running the suite. Specs that assert what a signed-out visitor
sees will pass against a site where nobody is ever signed out.

## Why this exists

WordPress CI used to point Playwright at a staging URL. When that URL was a
placeholder, every spec skipped itself — and `npx playwright test` exits 0 when
everything skips, so **CI reported green while running zero tests**. One project
had 40 tests skipping for the entire life of the suite. The first time they ran
for real they surfaced two genuine bugs and two tests that could never have
passed.

A hosted staging site does not fix this. It is shared mutable state, it drifts,
it can be down, and nothing about a green tick tells you whether it was reachable.
An instance the run creates and destroys cannot silently degrade: if it fails to
come up, the run fails loudly.

## Using it in CI

Set one input. `preview_url` becomes unnecessary:

```yaml
jobs:
  guardrails:
    uses: blueworx-io/bluegroup_core_foundation/.github/workflows/ci-wordpress.yml@v1
    with:
      plugin_slug: my-plugin
      use_local_wordpress: true
      foundation_ref: v1
    secrets: inherit
```

The workflow provisions the instance, points Playwright at it, injects the
harness's own admin credentials, tears it down afterwards, and uploads the PHP
and WordPress debug logs as an artifact if the run fails. You no longer need
`WP_ADMIN_USER` / `WP_ADMIN_PASS` secrets for a local run.

**Add `.wp-test/` to the project's `.gitignore`.** It is a full WordPress tree.

### Sharding a slow suite

Once a suite is long enough to be the reason PRs are slow, split it across
runners with `shards`:

```yaml
    with:
      plugin_slug: my-plugin
      use_local_wordpress: true
      shards: 3
```

Each shard is a **separate runner with its own WordPress**, which is the whole
reason this works. The suites pin `workers: 1` because specs toggle site-wide
state — feature flags, menu order, protection settings — and running them
concurrently against one site makes one spec's "off" another's "on". Raising
`workers` would do exactly that; raising `shards` gives each group its own site
instead, so nothing is shared to corrupt. Leave `workers: 1` alone.

Playwright decides the split, so the shards are roughly even but not identical,
and wall clock lands near the slowest shard rather than `total / shards`.

Two things to know:

- **`shards: 1` is the default and changes nothing.** The test command is run
  without a `--shard` argument at all, exactly as before this existed.
- **Sharding requires `use_local_wordpress: true`.** The workflow refuses to
  shard against a `preview_url`, because that is one shared site and the shards
  would corrupt each other. This fails the run rather than producing quiet
  nonsense.

The zero-tests gate is applied to the **sum** across shards, not per shard: with
more shards than spec files one shard can legitimately get an empty slice, but
every shard asserting nothing still fails the build. Each shard uploads its JSON
report and the `guardrails` job adds them up.

## Requirements

- **PHP on PATH with `pdo_sqlite`.** The script checks and fails with a clear
  message if either is missing. CI installs the extension via `setup-php`.
- **Node 20+** for `fetch`.
- **bsdtar or unzip** to extract. On Windows the script uses `System32\tar.exe`
  deliberately — GNU tar in Git Bash cannot read zip files.

## What it sets up, and why each part matters

Each of these was a real failure before it was handled. Do not remove them
casually.

| Setting | Why |
|---|---|
| Pretty permalinks (`/%postname%/`) | Plain permalinks make `/wp-json/` return HTML. Every REST spec then fails with `Unexpected token '<'`, which looks like a broken endpoint. |
| `BLUEWORX_LABS_JWT_SECRET` defined | The headless auth endpoints return `503 blueworx_auth_unconfigured` without it, so auth specs fail for the wrong reason. |
| `WP_DEBUG_DISPLAY` **off**, `WP_DEBUG_LOG` on | The SQLite drop-in emits notices on large transients. Rendered into a REST body they corrupt the JSON. Errors go to `wp-content/debug.log` instead. |
| Plugin linked, not copied | Junction on Windows (no admin rights needed), symlink elsewhere. Your edits are live — no re-provision between runs. |
| `--workers=1` | PHP's built-in server is single-threaded, and `PHP_CLI_SERVER_WORKERS` is not supported on Windows. Parallel workers cause spurious timeouts. |

## Gotchas worth knowing

- **A custom login slug will break login.** If the plugin moves the login screen
  (Blueworx Labs uses `admin_login` and 301s `wp-login.php` away), pass
  `wp_login_path` in CI or `WP_LOGIN_PATH` locally, or every admin spec fails at
  the sign-in step.
- **The suite is slower here than you expect** — roughly 9 minutes for ~40 tests
  at one worker. That is the cost of a single-threaded server; it is still far
  cheaper than maintaining staging.
- **Default content is 1 post and 1 page.** Tests that depend on counts, or on a
  third-party plugin's menu existing, will behave differently than on a populated
  staging site. Prefer tests that create what they need over tests that assume
  ambient state — the latter pass or fail based on what happens to be installed.
- **`up` is idempotent.** It reuses an existing install and only redoes what is
  missing. Delete `.wp-test/` for a genuinely clean slate.

## What this is not

It is not a production mirror. It is real WordPress on real PHP, but on SQLite
rather than MySQL, served by PHP's built-in server. Behaviour that depends on
MySQL specifics, on real cron, or on outbound mail will not be representative.
For those, test against a real host — but do not make that the everyday gate.
