const { test, expect } = require('@playwright/test');
const path = require('node:path');

// The library refuses an id that is not a real post of the screen's own post
// type (see Editor::authoriseRecord()), so unlike an early draft of this
// suite we cannot just point at a hardcoded id. beforeAll below signs in,
// harvests a REST nonce from the editor's own bootstrap payload, and creates
// a fresh "bwx_sport" post through the REST API — the example plugin's own
// dev-fixture convenience is left alone, so a manual poke at it never leaks
// into this run.
const USER = process.env.WP_ADMIN_USER || 'admin';
const PASS = process.env.WP_ADMIN_PASS || 'wptest-admin-pw';

// Anchored to this file's own location, not process.cwd() — a bare relative
// string here reads and writes the wrong file the moment the suite is run
// from anywhere other than the repo root.
const AUTH_STATE = path.join(__dirname, '.auth-state.json');

let screen;

test.beforeAll(async ({ browser, baseURL }) => {
  // Every test in this file loads storageState from AUTH_STATE (see
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

  await context.storageState({ path: AUTH_STATE });
  await context.close();
});

test.use({ storageState: AUTH_STATE });

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

  // An implementation that autosaved on tab switch — nobody asked for this,
  // but nothing above would have caught it — would still pass everything
  // before this line. Reloading is the only way to tell "kept in memory"
  // from "written to the server".
  await page.reload();
  await expect(page.locator('#name')).toHaveValue('');
});

test('an invalid save writes nothing and says where to look', async ({ page }) => {
  await page.fill('#name', 'Rugby');
  await page.fill('#contact', 'dan');
  await page.click('.bw-savebar .bw-btn--primary');

  await expect(page.locator('.bw-notice--danger')).toContainText('Nothing was saved');
  await expect(page.locator('.bw-field__error')).toContainText('domain');

  // Not `.not.toHaveValue('Rugby')`: that also passes if the field failed to
  // hydrate, or the screen never loaded — and it inverts under
  // --repeat-each, since a later test in this file saves 'Rugby' to this
  // same shared fixture. Asserting the exact value the store's own default
  // produces is the only version that actually proves nothing was written.
  await page.reload();
  await expect(page.locator('#name')).toHaveValue('');
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
// Schema::checkDependencies()). This replaced the brief's original version,
// which used the "Training times" panel's own hideable switch to stand in
// for a dependent field — that panel switch is a different mechanism
// (Schema::PANEL_SWITCH_SUFFIX), not a depends_on field, so it never actually
// exercised this path. With a real dependent field now on the example
// screen, this tests the real thing.
test('a dependent field appears only while its condition holds', async ({ page }) => {
  await expect(page.locator('#announcement_text')).toHaveCount(0);

  await page.locator('#announcement_enabled').check();

  await expect(page.locator('#announcement_text')).toBeVisible();
  await expect(page.locator('.bw-conditional')).toContainText('Shown because "Announcement bar" is on.');
});

// Pins Screen::assets() actually calling wp_enqueue_media() for a screen
// whose schema has a 'media'/'file' field — found by hand (the button
// silently did nothing when clicked) and, until now, checked by nothing.
test('the media library is available on a screen with a media field', async ({ page }) => {
  const hasMediaApi = await page.evaluate(() => typeof window.wp !== 'undefined' && typeof window.wp.media === 'function');
  expect(hasMediaApi).toBe(true);
});

// Pins the icon module actually running. Found by hand: the browser called a
// window.lucide that never existed (the shape of a different npm package),
// and the module that does exist was never enqueued at all — every icon was
// a bare, empty box. blueworx-admin-icons.js turns [data-lucide] elements
// into an inline <svg> once it runs, so an <svg> child is the proof.
test('an icon actually renders an SVG, not an empty box', async ({ page }) => {
  await expect(page.locator('.bw-savebar__hint .bw-icon svg')).toHaveCount(1);
});

// Pins the switch thumb — the missing <span class="bw-switch__thumb">, found
// by hand alongside the click-target CSS bug (see the hideable-panel test
// below). Every switch on the screen showed as a bare pill with no knob.
test('a switch has a visible thumb', async ({ page }) => {
  await expect(page.locator('.bw-card:has-text("Training times") .bw-switch__thumb')).toBeVisible();
});

// Driven from the keyboard rather than the mouse: this repeater's add/move/
// remove controls are real <button> elements specifically so a keyboard user
// can reach them, which is the whole reason the brief chose buttons over
// drag-and-drop. A click-only version of this test would pass just as well
// against a repeater no keyboard could ever operate.
test('a repeater row can be added, reordered and removed from the keyboard', async ({ page }) => {
  const addRow = page.getByRole('button', { name: 'Add a row' });

  await addRow.focus();
  await page.keyboard.press('Enter');
  await page.locator('#day-0').focus();
  await page.keyboard.type('Monday');

  await addRow.focus();
  await page.keyboard.press('Enter');
  await page.locator('#day-1').focus();
  await page.keyboard.type('Tuesday');

  const moveUp = page.locator('[aria-label="Move up"]').nth(1);
  await moveUp.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#day-0')).toHaveValue('Tuesday');

  const removeFirst = page.locator('[aria-label="Remove this row"]').first();
  await removeFirst.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#day-0')).toHaveValue('Monday');
});

// The hideable panel's own shown/hidden switch has regressed four separate
// times during this build (see Schema::PANEL_SWITCH_SUFFIX and the browser's
// Panel()), so this pins the whole round trip in a real browser: switch it
// off, save, reload, and it must still read off — and its fields must
// actually be gone, not just its label reading "Hidden". The switch's own
// invisible checkbox previously had no click target of its own — see the
// blueworx-admin-design.css fix to `.bw-switch input` and `.bw-switch` — so
// this also stands in as the regression test for that.
test('a hideable panel switched off, saved and reloaded is still off', async ({ page }) => {
  const card = page.locator('.bw-card:has-text("Training times")');
  const panelSwitch = card.locator('.bw-switch input');
  await expect(panelSwitch).toBeChecked();
  await expect(card.locator('.bw-card__body')).toHaveCount(1);

  await panelSwitch.uncheck();
  await expect(card.locator('.bw-switch__label')).toContainText('Hidden');
  await expect(card.locator('.bw-card__body')).toHaveCount(0);

  await page.click('.bw-savebar .bw-btn--primary');
  await expect(page.locator('.bw-notice--success')).toBeVisible();

  await page.reload();
  await expect(card.locator('.bw-switch input')).not.toBeChecked();
  await expect(card.locator('.bw-switch__label')).toContainText('Hidden');
  await expect(card.locator('.bw-card__body')).toHaveCount(0);
});
