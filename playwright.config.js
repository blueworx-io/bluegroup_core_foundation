// Playwright config for the page editor's end-to-end pass (Task 20). Points
// at the disposable WordPress the harness provisions — see
// docs/wordpress-test-harness.md and scripts/wp-test-env.mjs.
//
// This repo has no package.json and must not gain one, so there is no local
// `node_modules` for this file — or the spec files under .wp-test/tests/ —
// to resolve `require('@playwright/test')` against. `npx @playwright/test`
// runs a CLI fine, but from its OWN separate on-demand cache: pointing
// NODE_PATH at a different local install than the CLI itself came from loads
// two physical copies of the same package, and Playwright refuses to run
// with "test.beforeAll() did not expect to be called here" — its own way of
// detecting exactly this. Installing the browser through a different copy
// again (e.g. `npx playwright install`) is the same mistake a second time.
// The fix is one disposable local install, used for the CLI, the module
// resolution and the browser download alike.
//
// Prerequisites: PHP on PATH with pdo_sqlite (wp-test-env.mjs checks and
// fails clearly if not), and port 8881 free — that is what the harness
// serves on and what PLAYWRIGHT_BASE_URL below points at.
//
// In Git Bash (this repo's commands are written for it; see
// docs/wordpress-test-harness.md for the PowerShell equivalent):
//
//   npm install --no-save --prefix .wp-test/.pw @playwright/test   # once per checkout
//   .wp-test/.pw/node_modules/.bin/playwright install chromium    # once per checkout
//
//   node scripts/stage-example-plugin.mjs
//   node scripts/wp-test-env.mjs up --plugin .wp-test/example-plugin
//   NODE_PATH="$(pwd)/.wp-test/.pw/node_modules" \
//     PLAYWRIGHT_BASE_URL=http://127.0.0.1:8881 \
//     WP_ADMIN_USER=admin WP_ADMIN_PASS=wptest-admin-pw \
//     .wp-test/.pw/node_modules/.bin/playwright test --workers=1
//   node scripts/wp-test-env.mjs down
//
// Staging still has to run before `up`: wp-test-env.mjs activates the plugin
// as part of coming up, and that fatals immediately if the library it
// requires is not there yet — untouched here on purpose (see item 5 in the
// task report). globalSetup below stages again automatically before the
// suite itself starts, which is what actually matters day to day: without
// it, editing the library and re-running just the suite (harness already
// up from before) would silently test yesterday's copy. Running the script
// by hand stays useful on top of both — for poking at the screen outside
// the suite entirely.
//
// `.wp-test/.pw/` is gitignored (see .gitignore's .wp-test/* denylist) — a
// disposable local install, not a dependency declaration. This is also why
// `defineConfig()` is not imported below: that helper is just identity plus
// TypeScript inference, and importing it here would hit the exact same
// resolution problem the spec files have. A plain object works fine.
module.exports = {
  testDir: '.wp-test/tests',
  globalSetup: require.resolve('./scripts/playwright-global-setup.mjs'),
  // The specs sign in and toggle site-wide record state; running them in
  // parallel would make one spec's save race another's, same reason the
  // shared harness docs pin this everywhere else.
  workers: 1,
  retries: 0,
  reporter: 'list',
  // Three times Playwright's default 30s, for the whole suite rather than a
  // handful of hand-picked tests.
  //
  // A WordPress admin screen is not a page, it is a couple of hundred
  // requests, and the server answering them is `php -S`, which answers one at
  // a time. A spec that signs in and opens the editor twice can spend 20-odd
  // seconds doing nothing wrong. The specs that first crossed the line did so
  // only when the suite grew — they pass on their own and time out in a full
  // run, which is the shape of a budget problem, not a bug in whichever spec
  // happened to notice.
  //
  // This does not slow a passing run down: a spec that finishes in 8 seconds
  // still finishes in 8 seconds. It only changes how long a genuinely stuck
  // one waits before it is called stuck.
  timeout: 90000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8881',
  },
  // Never starts a server itself — `command` is a deliberate no-op, and
  // `reuseExistingServer: true` means Playwright only ever polls `url`. Its
  // entire job is to fail with one clear "the server never came up" error
  // when the harness (wp-test-env.mjs) was not started first, instead of
  // every spec in the file failing its own way with a connection-refused
  // error that reads like eight different bugs. `timeout` is generous
  // because "already up" is the only path that matters in practice —
  // reuseExistingServer means a genuinely running harness returns almost
  // immediately, so this only ever costs real time on the failure path it
  // exists for, and a harness still finishing WordPress's own install step
  // should not be mistaken for one that was never started at all.
  webServer: {
    command: '"' + process.execPath + '" -e "process.exit(0)"',
    url: (process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8881') + '/wp-login.php',
    reuseExistingServer: true,
    timeout: 60000,
  },
};
