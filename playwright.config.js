// Playwright config for the page editor's end-to-end pass (Task 20). Points at
// the disposable WordPress the harness provisions — see
// docs/wordpress-test-harness.md and scripts/wp-test-env.mjs. No package.json
// in this repo, so this file is picked up by `npx playwright test` reading
// straight off npm's on-demand package cache.
// No `defineConfig()` wrapper: that helper is just identity plus TypeScript
// inference, and importing it here would require '@playwright/test' to
// resolve from this repo's own (deliberately absent) node_modules — the
// config file loads before Playwright's runner gets a chance to special-case
// that specifier the way it does for spec files. A plain object works fine.
module.exports = {
  testDir: '.wp-test/tests',
  // The specs sign in and toggle site-wide record state; running them in
  // parallel would make one spec's save race another's, same reason the
  // shared harness docs pin this everywhere else.
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8881',
  },
};
