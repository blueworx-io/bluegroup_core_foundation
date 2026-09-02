const { test, expect } = require('@playwright/test');
const path = require('node:path');

// The library refuses an id that is not a real post of the screen's own post
// type (see Editor::authoriseRecord()), so unlike an early draft of this
// suite we cannot just point at a hardcoded id. beforeAll below only signs
// in; beforeEach then creates a fresh "bwx_sport" post through the REST API
// for EACH test — a single fixture shared across the whole file meant a
// later test's write (e.g. saving 'Rugby' into #post_title) was still there for an
// earlier-looking test under --repeat-each, since beforeAll only ever runs
// once per file. A record per test is the only way one test can never see
// another's writes. The example plugin's own dev-fixture convenience is left
// alone throughout, so a manual poke at it never leaks into this run either.
const USER = process.env.WP_ADMIN_USER || 'admin';
const PASS = process.env.WP_ADMIN_PASS || 'wptest-admin-pw';

// Anchored to this file's own location, not process.cwd() — a bare relative
// string here reads and writes the wrong file the moment the suite is run
// from anywhere other than the repo root.
const AUTH_STATE = path.join(__dirname, '.auth-state.json');

test.beforeAll(async ({ browser }) => {
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

  await context.storageState({ path: AUTH_STATE });
  await context.close();
});

test.use({ storageState: AUTH_STATE });

// Creates one fresh "bwx_sport" post and returns the editor URL for it. Any
// load of the editor's own admin screen enqueues the bootstrap payload (see
// Screen::assets()) regardless of whether the id in the URL resolves, so
// loading the bare screen first is enough to harvest a working REST nonce
// without a post to edit yet.
async function freshScreen(page) {
  await page.goto('/wp-admin/admin.php?page=bwx-sport-editor');
  const nonce = await page.evaluate(() => window.blueworxPageEditor.nonce);

  const created = await page.request.post('/wp-json/wp/v2/bwx_sport', {
    headers: { 'X-WP-Nonce': nonce },
    data: { title: 'Playwright fixture sport', status: 'publish' },
  });
  expect(created.ok(), 'creating the fixture record this test edits').toBeTruthy();
  const post = await created.json();

  return `/wp-admin/admin.php?page=bwx-sport-editor&id=${post.id}`;
}

test.beforeEach(async ({ page }) => {
  await page.goto(await freshScreen(page));
});

test('the screen opens clean, with one save bar', async ({ page }) => {
  await expect(page.locator('.bw-savebar')).toHaveCount(1);
  await expect(page.locator('.bw-savebar__hint')).toContainText('Everything is saved.');
  await expect(page.locator('.bw-savebar .bw-btn--primary')).toBeDisabled();
});

test('changing a field wakes the save bar and names the tab', async ({ page }) => {
  await page.fill('#post_title', 'Rugby');
  await expect(page.locator('.bw-savebar__hint')).toContainText('Content');
  await expect(page.locator('.bw-savebar .bw-btn--primary')).toBeEnabled();
});

test('switching tab keeps the change and does not save', async ({ page }) => {
  await page.fill('#post_title', 'Rugby');
  await page.getByRole('tab', { name: /Publish & settings/ }).click();
  await expect(page.locator('.bw-savebar .bw-btn--primary')).toBeEnabled();
  await page.getByRole('tab', { name: /Content/ }).click();
  await expect(page.locator('#post_title')).toHaveValue('Rugby');

  // An implementation that autosaved on tab switch — nobody asked for this,
  // but nothing above would have caught it — would still pass everything
  // before this line. Reloading is the only way to tell "kept in memory"
  // from "written to the server".
  await page.reload();
  await expect(page.locator('#post_title')).toHaveValue('Playwright fixture sport');
});

test('an invalid save writes nothing and says where to look', async ({ page }) => {
  await page.fill('#post_title', 'Rugby');
  await page.fill('#contact', 'dan');
  await page.click('.bw-savebar .bw-btn--primary');

  await expect(page.locator('.bw-notice--danger')).toContainText('Nothing was saved');
  await expect(page.locator('.bw-field__error')).toContainText('domain');

  // Not `.not.toHaveValue('Rugby')`: that also passes if the field failed to
  // hydrate, or the screen never loaded, or genuinely wrote some other
  // string. Asserting the exact title this test's own fixture record was
  // created with is the only version that actually proves nothing was
  // written. Each test gets its own fresh record (see freshScreen() above),
  // so this does not depend on test order or on nothing else having saved
  // 'Rugby' first — it would hold even if another test in this file had.
  await page.reload();
  await expect(page.locator('#post_title')).toHaveValue('Playwright fixture sport');
});

test('a valid save writes and the screen goes clean', async ({ page }) => {
  await page.fill('#post_title', 'Rugby');
  await page.fill('#contact', 'dan@coastalbloom.co');
  await page.click('.bw-savebar .bw-btn--primary');

  await expect(page.locator('.bw-notice--success')).toBeVisible();
  await expect(page.locator('.bw-savebar__hint')).toContainText('Everything is saved.');

  await page.reload();
  await expect(page.locator('#post_title')).toHaveValue('Rugby');
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
// against a repeater no keyboard could ever operate — and so, at first, did
// a version of this test that used .focus() to jump straight to each
// control before pressing a key: that proves the control responds to Enter,
// never that Tab can actually land on it, which is the specific claim
// "from the keyboard" makes. The block below Tabs there for real, from a
// known starting point, and fails if it never arrives.
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

  // Start at the first row's own "Move up" — a real, known-focusable point
  // already on the page — and press Tab until focus lands on the second
  // row's "Move up", the control under test. .focus()ing the starting point
  // is fine: it is not the thing being proven reachable, and something has
  // to establish where Tab begins.
  const moveUpFirstRow = page.locator('[aria-label="Move up"]').first();
  const moveUpSecondRow = page.locator('[aria-label="Move up"]').nth(1);
  await moveUpFirstRow.focus();

  let reachedByTab = false;
  for (let presses = 0; presses < 10; presses += 1) {
    await page.keyboard.press('Tab');
    if (await moveUpSecondRow.evaluate((el) => el === document.activeElement)) {
      reachedByTab = true;
      break;
    }
  }
  expect(reachedByTab, 'Tab never reached the second row’s "Move up" button').toBe(true);

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

test('a repeater row holds more than text, and every cell round-trips', async ({ page }) => {
  // The row's cells are drawn by Repeater() and cleaned by Sanitise::field()
  // per kind. What only a browser can show is the round trip: a toggle that
  // came back as the string '1' rather than a real boolean would leave the
  // screen reading dirty the moment it loaded, which no unit test sees.
  await page.getByRole('button', { name: 'Add a row' }).first().click();

  const row = page.locator('.bw-repeater__row').first();
  await row.locator('input[type=text]').first().fill('Tuesday');
  await row.locator('textarea').first().fill('Bring your own kit.');
  await row.locator('input[type=checkbox]').first().check();
  await row.locator('select').first().selectOption('beginner');

  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.bw-savebar')).toContainText('Everything is saved');

  await page.reload();
  const saved = page.locator('.bw-repeater__row').first();
  await expect(saved.locator('input[type=text]').first()).toHaveValue('Tuesday');
  await expect(saved.locator('textarea').first()).toHaveValue('Bring your own kit.');
  await expect(saved.locator('input[type=checkbox]').first()).toBeChecked();
  await expect(saved.locator('select').first()).toHaveValue('beginner');

  // Nothing came back in a shape that reads as an edit.
  await expect(page.locator('.bw-savebar')).toContainText('Everything is saved');
});

test('a text field offers its suggestions without refusing anything else', async ({ page }) => {
  const list = page.locator('datalist#more_info-suggestions');
  await expect(list.locator('option')).toHaveCount(2);
  await expect(page.locator('#more_info')).toHaveAttribute('list', 'more_info-suggestions');

  // The list is a shortcut, not a constraint: an address that is not on it
  // saves exactly like one that is.
  await page.locator('#more_info').fill('https://somewhere.else/');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.bw-savebar')).toContainText('Everything is saved');

  await page.reload();
  await expect(page.locator('#more_info')).toHaveValue('https://somewhere.else/');
});

/* --- The three controls the deck-style editors needed ----------------------- */

// Fills the Delivery tab with three coaching rows across two blocks, one of
// them excluded from the season. Returns nothing — every assertion below reads
// the screen, so a helper that returned expected figures would be asserting
// its own arithmetic rather than the editor's.
async function addDeliveryRows(page) {
  await page.getByRole('tab', { name: /Delivery/ }).click();

  const rows = [
    { title: 'Pre-season fitness', block: 'preseason', hours: '16', counts: true },
    { title: 'Weekly training', block: 'season', hours: '30', counts: true },
    { title: 'Tour', block: 'season', hours: '260', counts: false },
  ];

  for (let i = 0; i < rows.length; i++) {
    await page.locator('.bw-repeater__foot .bw-btn').click();
    await page.fill(`#title-${i}`, rows[i].title);
    await page.selectOption(`#block-${i}`, rows[i].block);
    await page.fill(`#hours-${i}`, rows[i].hours);
    if (rows[i].counts) await page.check(`#counts-${i}`);
  }
}

test('a grouped repeater draws one header per block, with that block\'s subtotal', async ({ page }) => {
  await addDeliveryRows(page);

  // Pre-season first, then In season: the order the select offers, not the
  // order the rows were typed in.
  await expect(page.locator('.bw-table__group-title')).toHaveText(['Pre-season', 'In season']);

  // 16 in the first block; 30 + 260 in the second. A subtotal counts every row
  // in its block, including one excluded from the season figure — that
  // exclusion belongs to the summary strip, not to the block.
  await expect(page.locator('.bw-table__group-total')).toHaveText(['16 hrs', '290 hrs']);
});

test('the summary strip moves as hours are typed, before anything is saved', async ({ page }) => {
  const coached = page.locator('.bw-summary__cell', { hasText: 'Coached hours' }).locator('.bw-summary__value');
  const all = page.locator('.bw-summary__cell', { hasText: 'All planned hours' }).locator('.bw-summary__value');

  await expect(coached).toHaveText('0 hrs');

  await addDeliveryRows(page);

  // 16 + 30 — the 260-hour tour is switched out of the season.
  await expect(coached).toHaveText('46 hrs');
  // Every row, whether it counts towards the season or not.
  await expect(all).toHaveText('306 hrs');

  // Nothing has been saved: the strip is worked out in the browser, which is
  // the whole reason it is declared rather than computed on the server.
  await expect(page.locator('.bw-savebar .bw-btn--primary')).toBeEnabled();
});

test('a phase bar is positioned and coloured by its own weeks and marker', async ({ page }) => {
  await page.getByRole('tab', { name: /Delivery/ }).click();

  // Two phases: the first added spans week 1, the second week 2.
  await page.locator('.bw-gantt__legend .bw-btn').click();
  await page.locator('.bw-gantt__legend .bw-btn').click();
  await expect(page.locator('.bw-gantt__row')).toHaveCount(2);

  // Edit the second into a launch milestone running weeks 4 to 7.
  await page.locator('.bw-gantt__row').nth(1).getByRole('button', { name: /^Edit/ }).click();
  await page.fill('#timeline-title', 'Season launch');
  await page.fill('#timeline-start', '4');
  await page.fill('#timeline-end', '7');
  await page.selectOption('#timeline-kind', 'launch');

  const bar = page.locator('.bw-gantt__row').nth(1).locator('.bw-gantt__bar');
  await expect(bar).toHaveClass(/bw-gantt__bar--launch/);

  // The scale runs to week 7, so weeks 4–7 start three sevenths in and fill
  // the remaining four sevenths.
  await expect(bar).toHaveAttribute('style', /left:\s*42\.857/);
  await expect(bar).toHaveAttribute('style', /width:\s*57\.142/);

  await expect(page.locator('.bw-gantt__row').nth(1).locator('.bw-gantt__range')).toContainText('Weeks 4–7');
});

test('a timeline with two launch milestones will not save, and says why', async ({ page }) => {
  await page.getByRole('tab', { name: /Delivery/ }).click();

  for (let i = 0; i < 2; i++) {
    await page.locator('.bw-gantt__legend .bw-btn').click();
    await page.locator('.bw-gantt__row').nth(i).getByRole('button', { name: /^Edit/ }).click();
    await page.fill('#timeline-title', `Launch ${i + 1}`);
    await page.selectOption('#timeline-kind', 'launch');
  }

  // post_title lives on the Content tab; the work above was on Delivery.
  await page.getByRole('tab', { name: /Content/ }).click();
  await page.fill('#post_title', 'Rugby');
  await page.click('.bw-savebar .bw-btn--primary');

  await expect(page.locator('.bw-notice--danger')).toContainText('Nothing was saved');

  // The bad field is on the tab we just left, so the error is not on screen
  // until the notice takes us back to it. That is the point of the button.
  await page.getByRole('button', { name: 'Take me to it' }).click();
  await expect(page.locator('.bw-field__error')).toContainText('one launch milestone');
});

test('a timeline and its grouped rows survive a save', async ({ page }) => {
  await addDeliveryRows(page);

  await page.locator('.bw-gantt__legend .bw-btn').click();
  await page.locator('.bw-gantt__row').first().getByRole('button', { name: /^Edit/ }).click();
  await page.fill('#timeline-title', 'Pre-season');
  await page.fill('#timeline-end', '6');

  // post_title lives on the Content tab; the work above was on Delivery.
  await page.getByRole('tab', { name: /Content/ }).click();
  await page.fill('#post_title', 'Rugby');
  await page.click('.bw-savebar .bw-btn--primary');
  await expect(page.locator('.bw-notice--success')).toBeVisible();

  await page.reload();
  await page.getByRole('tab', { name: /Delivery/ }).click();

  await expect(page.locator('.bw-table__group-total')).toHaveText(['16 hrs', '290 hrs']);
  await expect(page.locator('.bw-summary__cell', { hasText: 'Coached hours' }).locator('.bw-summary__value')).toHaveText('46 hrs');
  await expect(page.locator('.bw-gantt__range').first()).toContainText('Weeks 1–6');
});

// A fixed list is the opposite trade to readonly: the rows are settled and
// the wording is not. Both halves are worth a test, because getting only the
// first half right produces a list nobody can correct a typo in.
test('a fixed list offers no way to add, remove or reorder a row', async ({ page }) => {
  await page.getByRole('tab', { name: /Settled/ }).click();

  const rows = page.locator('.bw-repeater__row');
  await expect(rows).toHaveCount(2);

  await expect(page.getByRole('button', { name: 'Add a row' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Remove this row' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Move up' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Move down' })).toHaveCount(0);
  await expect(page.locator('.bw-repeater__grip')).toHaveCount(0);
});

test('a fixed list still edits, and the wording survives a save', async ({ page }) => {
  await page.getByRole('tab', { name: /Settled/ }).click();
  await page.fill('#item-0', 'Boots (studded)');

  await page.getByRole('tab', { name: /Content/ }).click();
  await page.fill('#post_title', 'Rugby');
  await page.click('.bw-savebar .bw-btn--primary');
  await expect(page.locator('.bw-notice--success')).toBeVisible();

  await page.reload();
  await page.getByRole('tab', { name: /Settled/ }).click();
  await expect(page.locator('#item-0')).toHaveValue('Boots (studded)');
  await expect(page.locator('.bw-repeater__row')).toHaveCount(2);
});

test('a fixed timeline keeps edit and hide, and loses the rest', async ({ page }) => {
  await page.getByRole('tab', { name: /Settled/ }).click();

  const rows = page.locator('.bw-gantt__row');
  await expect(rows).toHaveCount(2);

  // The add button lives in the legend, beside the three keys.
  await expect(page.locator('.bw-gantt__legend .bw-btn')).toHaveCount(0);
  await expect(rows.first().getByRole('button', { name: /^Move/ })).toHaveCount(0);
  await expect(rows.first().getByRole('button', { name: /^Duplicate/ })).toHaveCount(0);
  await expect(rows.first().getByRole('button', { name: /^Remove/ })).toHaveCount(0);

  await expect(rows.first().getByRole('button', { name: /^Edit/ })).toBeVisible();
  await expect(rows.first().getByRole('button', { name: /the client$/ })).toBeVisible();
});
