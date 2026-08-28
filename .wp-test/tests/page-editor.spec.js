const { test, expect } = require('@playwright/test');

// The library refuses an id that is not a real post of the screen's own post
// type (see Editor::authoriseRecord()), so unlike an early draft of this
// suite we cannot just point at a hardcoded id. beforeAll below signs in,
// harvests a REST nonce from the editor's own bootstrap payload, and creates
// a fresh "bwx_sport" post through the REST API — the example plugin's
// worked-example post is left alone, so a manual poke at it never leaks into
// this run.
const USER = process.env.WP_ADMIN_USER || 'admin';
const PASS = process.env.WP_ADMIN_PASS || 'wptest-admin-pw';

let screen;

test.beforeAll(async ({ browser, baseURL }) => {
  // Every test in this file loads storageState from the path below (see
  // test.use()) — including, by default, the very context this hook creates
  // to go and produce that file in the first place. Overriding it back to
  // "no state yet" here breaks that chicken-and-egg loop.
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();

  await page.goto('/wp-login.php');
  await page.fill('#user_login', USER);
  await page.fill('#user_pass', PASS);
  await page.click('#wp-submit');

  // Any load of the editor's own admin screen enqueues the bootstrap payload
  // (see Screen::assets()) regardless of whether the id in the URL resolves,
  // so this is enough to harvest a working REST nonce without a post to edit
  // yet.
  await page.goto('/wp-admin/admin.php?page=bwx-sport-editor');
  const nonce = await page.evaluate(() => window.blueworxPageEditor.nonce);

  const created = await page.request.post('/wp-json/wp/v2/bwx_sport', {
    headers: { 'X-WP-Nonce': nonce },
    data: { title: 'Playwright fixture sport', status: 'publish' },
  });
  expect(created.ok(), 'creating the fixture record the suite edits').toBeTruthy();
  const post = await created.json();

  screen = `/wp-admin/admin.php?page=bwx-sport-editor&id=${post.id}`;

  await context.storageState({ path: '.wp-test/tests/.auth-state.json' });
  await context.close();
});

test.use({ storageState: '.wp-test/tests/.auth-state.json' });

test.beforeEach(async ({ page }) => {
  await page.goto(screen);
});

test('the screen opens clean, with one save bar', async ({ page }) => {
  await expect(page.locator('.bw-savebar')).toHaveCount(1);
  await expect(page.locator('.bw-savebar__hint')).toContainText('Everything is saved.');
  await expect(page.locator('.bw-savebar .bw-btn--primary')).toBeDisabled();
});

test('changing a field wakes the save bar and names the tab', async ({ page }) => {
  await page.fill('#name', 'Rugby');
  await expect(page.locator('.bw-savebar__hint')).toContainText('Content');
  await expect(page.locator('.bw-savebar .bw-btn--primary')).toBeEnabled();
});

test('switching tab keeps the change and does not save', async ({ page }) => {
  await page.fill('#name', 'Rugby');
  await page.getByRole('tab', { name: /Publish & settings/ }).click();
  await expect(page.locator('.bw-savebar .bw-btn--primary')).toBeEnabled();
  await page.getByRole('tab', { name: /Content/ }).click();
  await expect(page.locator('#name')).toHaveValue('Rugby');
});

test('an invalid save writes nothing and says where to look', async ({ page }) => {
  await page.fill('#name', 'Rugby');
  await page.fill('#contact', 'dan');
  await page.click('.bw-savebar .bw-btn--primary');

  await expect(page.locator('.bw-notice--danger')).toContainText('Nothing was saved');
  await expect(page.locator('.bw-field__error')).toContainText('domain');

  await page.reload();
  await expect(page.locator('#name')).not.toHaveValue('Rugby');
});

test('a valid save writes and the screen goes clean', async ({ page }) => {
  await page.fill('#name', 'Rugby');
  await page.fill('#contact', 'dan@coastalbloom.co');
  await page.click('.bw-savebar .bw-btn--primary');

  await expect(page.locator('.bw-notice--success')).toBeVisible();
  await expect(page.locator('.bw-savebar__hint')).toContainText('Everything is saved.');

  await page.reload();
  await expect(page.locator('#name')).toHaveValue('Rugby');
});

// The example screen's dependent field: a "Banner text" field that only
// exists while "Announcement bar" is on (see Task 19's schema and
// Schema::checkDependencies()). Rewritten from the brief's version, which
// used the "Training times" panel's own hideable switch to stand in for a
// dependent field — that panel switch is a different mechanism
// (Schema::PANEL_SWITCH_SUFFIX), not a depends_on field, so it never actually
// exercised this path. With a real dependent field now on the example screen,
// this tests the real thing.
test('a dependent field appears only while its condition holds', async ({ page }) => {
  await expect(page.locator('#announcement_text')).toHaveCount(0);

  await page.locator('#announcement_enabled').check();

  await expect(page.locator('#announcement_text')).toBeVisible();
  await expect(page.locator('.bw-conditional')).toContainText('Shown because "Announcement bar" is on.');
});

test('a repeater row can be added, reordered and removed from the keyboard', async ({ page }) => {
  await page.click('text=Add a row');
  await page.fill('#day-0', 'Monday');
  await page.click('text=Add a row');
  await page.fill('#day-1', 'Tuesday');

  await page.locator('[aria-label="Move up"]').nth(1).click();
  await expect(page.locator('#day-0')).toHaveValue('Tuesday');

  await page.locator('[aria-label="Remove this row"]').first().click();
  await expect(page.locator('#day-0')).toHaveValue('Monday');
});

// The hideable panel's own shown/hidden switch has regressed four separate
// times during this build (see Schema::PANEL_SWITCH_SUFFIX and the browser's
// Panel()), so this pins the whole round trip in a real browser: switch it
// off, save, reload, and it must still read off. The switch's own invisible
// checkbox previously had no click target of its own — see the
// blueworx-admin-design.css fix to `.bw-switch input` and `.bw-switch` — so
// this also stands in as the regression test for that.
test('a hideable panel switched off, saved and reloaded is still off', async ({ page }) => {
  const panelSwitch = page.locator('.bw-card:has-text("Training times") .bw-switch input');
  await expect(panelSwitch).toBeChecked();

  await panelSwitch.uncheck();
  await expect(page.locator('.bw-card:has-text("Training times") .bw-switch__label')).toContainText('Hidden');

  await page.click('.bw-savebar .bw-btn--primary');
  await expect(page.locator('.bw-notice--success')).toBeVisible();

  await page.reload();
  await expect(page.locator('.bw-card:has-text("Training times") .bw-switch input')).not.toBeChecked();
  await expect(page.locator('.bw-card:has-text("Training times") .bw-switch__label')).toContainText('Hidden');
});
