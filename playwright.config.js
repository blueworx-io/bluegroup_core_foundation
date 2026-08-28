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
// detecting exactly this. The fix is to run the CLI from the same local
// install NODE_PATH points at, not through npx at all. The exact commands,
// once per checkout and then on every run:
//
//   npm install --no-save --prefix .wp-test/.pw @playwright/test
//   npx --yes playwright install chromium
//
//   node scripts/stage-example-plugin.mjs
//   node scripts/wp-test-env.mjs up --plugin .wp-test/example-plugin
//   NODE_PATH="$(pwd)/.wp-test/.pw/node_modules" \
//     PLAYWRIGHT_BASE_URL=http://127.0.0.1:8881 \
//     WP_ADMIN_USER=admin WP_ADMIN_PASS=wptest-admin-pw \
//     .wp-test/.pw/node_modules/.bin/playwright test --workers=1
//   node scripts/wp-test-env.mjs down
//
// `.wp-test/.pw/` is gitignored (see .gitignore's .wp-test/* denylist) — a
// disposable local install, not a dependency declaration. This is also why
// `defineConfig()` is not imported below: that helper is just identity plus
// TypeScript inference, and importing it here would hit the exact same
// resolution problem the spec files have. A plain object works fine.
module.exports = {
  testDir: '.wp-test/tests',
  // The specs sign in and toggle site-wide record state; running them in
  // parallel would make one spec's save race another's, same reason the
  // shared harness docs pin this everywhere else.
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8881',
  },
  // Never starts a server itself — `command` is a deliberate no-op, and
  // `reuseExistingServer: true` means Playwright only ever polls `url`. Its
  // entire job is to fail with one clear "the server never came up" error
  // when the harness (wp-test-env.mjs) was not started first, instead of
  // every spec in the file failing its own way with a connection-refused
  // error that reads like eight different bugs.
  webServer: {
    command: process.execPath + ' -e "process.exit(0)"',
    url: (process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8881') + '/wp-login.php',
    reuseExistingServer: true,
    timeout: 5000,
  },
};
