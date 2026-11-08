const { test, expect } = require('@playwright/test');
const path = require('node:path');

// Pages are edited in WordPress's block editor; our own page editor is for
// records and settings. This file proves the two live happily on one site:
// a basic page written in the block editor shows on the live site, a page
// changed through the REST API (the way Claude's connection edits it) still
// opens cleanly in the editor, an editor-role login can change a page, and
// the BlueWorx editor example screen still loads beside it all.
const USER = process.env.WP_ADMIN_USER || 'admin';
const PASS = process.env.WP_ADMIN_PASS || 'wptest-admin-pw';
// The BlueWorx theme moves the sign-in page to /admin_login; the shared CI
// passes the path in, the same way a plugin's own suite reads it.
const LOGIN_PATH = '/' + (process.env.WP_LOGIN_PATH || 'wp-login.php').replace(/^\/+/, '');
const AUTH_STATE = path.join(__dirname, '.auth-state-pages.json');

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  await signIn(page, USER, PASS);
  await context.storageState({ path: AUTH_STATE });
  await context.close();
});

test.use({ storageState: AUTH_STATE });

let consoleErrors = [];
test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
});
test.afterEach(async () => {
  expect(consoleErrors, 'the page threw in the browser').toEqual([]);
});

async function signIn(page, user, pass) {
  await page.goto(LOGIN_PATH);
  await page.fill('#user_login', user);
  await page.fill('#user_pass', pass);
  await page.click('#wp-submit');
  await expect(page.locator('body')).toHaveClass(/wp-admin|wp-core-ui/);
}

// The REST nonce comes from any admin screen's wpApiSettings. Pages are
// created through REST so each test owns a fresh one and never sees another
// test's edits.
async function restNonce(page) {
  await page.goto('/wp-admin/index.php');
  return page.evaluate(() => window.wpApiSettings && window.wpApiSettings.nonce);
}

const PARAGRAPH = (text) => `<!-- wp:paragraph --><p>${text}</p><!-- /wp:paragraph -->`;

async function freshPage(page, title = 'Playwright basic page') {
  const nonce = await restNonce(page);
  const created = await page.request.post('/wp-json/wp/v2/pages', {
    headers: { 'X-WP-Nonce': nonce },
    data: { title, status: 'publish', content: PARAGRAPH('First words on the page.') },
  });
  expect(created.ok(), 'creating the page this test edits').toBeTruthy();
  return { nonce, post: await created.json() };
}

// The welcome guide and the "pattern" chooser get in the way of a fresh user.
async function openBlockEditor(page, id) {
  await page.goto(`/wp-admin/post.php?post=${id}&action=edit`);
  const canvas = page.frameLocator('iframe[name="editor-canvas"]');
  // A user's first visit gets the "Welcome to the editor" tour, which sits
  // over the canvas and swallows every click until it is closed. It appears
  // a moment after the page does, so wait for it briefly rather than check once.
  const guide = page.getByRole('dialog', { name: /welcome/i });
  await guide.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (await guide.isVisible()) {
    await guide.getByRole('button', { name: /close/i }).click();
    await expect(guide).toBeHidden();
  }
  // The first editor load on a fresh site is slow: give it a real wait.
  await expect(canvas.locator('.editor-styles-wrapper')).toBeVisible({ timeout: 30000 });
  return canvas;
}

async function update(page) {
  await page.getByRole('button', { name: /^(Update|Save)$/ }).click();
  // A first save on a fresh site can take a while; the snackbar is the proof.
  await expect(page.getByText(/updated\.|Page updated/i).first()).toBeVisible({ timeout: 30000 });
}

test('a page written in the block editor shows on the live site', async ({ page }) => {
  const { post } = await freshPage(page);
  const canvas = await openBlockEditor(page, post.id);

  const paragraph = canvas.locator('p[data-type="core/paragraph"], .wp-block-paragraph').first();
  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Typed in the block editor.');
  await update(page);

  await page.goto(post.link);
  await expect(page.locator('body')).toContainText('First words on the page. Typed in the block editor.');
});

test('a page edited through the REST API renders, and opens again without a block warning', async ({ page }) => {
  const { nonce, post } = await freshPage(page);

  const current = await page.request.get(`/wp-json/wp/v2/pages/${post.id}?context=edit`, { headers: { 'X-WP-Nonce': nonce } });
  const raw = (await current.json()).content.raw;
  const saved = await page.request.post(`/wp-json/wp/v2/pages/${post.id}`, {
    headers: { 'X-WP-Nonce': nonce },
    data: { content: raw + PARAGRAPH('Added by the API.') },
  });
  expect(saved.ok(), 'saving through REST').toBeTruthy();

  await page.goto(post.link);
  await expect(page.locator('body')).toContainText('First words on the page.');
  await expect(page.locator('body')).toContainText('Added by the API.');

  const canvas = await openBlockEditor(page, post.id);
  await expect(canvas.locator('.block-editor-warning')).toHaveCount(0);
  await expect(canvas.locator('.wp-block-paragraph')).toHaveCount(2);
});

test('a BlueWorx editor screen and a basic page live on the same site', async ({ page }) => {
  const { post } = await freshPage(page);

  await page.goto('/wp-admin/admin.php?page=bwx-sport-editor');
  const nonce = await page.evaluate(() => window.blueworxPageEditor.nonce);
  const sport = await page.request.post('/wp-json/wp/v2/bwx_sport', {
    headers: { 'X-WP-Nonce': nonce },
    data: { title: 'Playwright fixture sport', status: 'publish' },
  });
  expect(sport.ok()).toBeTruthy();
  await page.goto(`/wp-admin/admin.php?page=bwx-sport-editor&id=${(await sport.json()).id}`);
  await expect(page.locator('.bw-pagehead')).toBeVisible();
  await expect(page.locator('.bw-savebar')).toHaveCount(1);

  await openBlockEditor(page, post.id);
  await expect(page.locator('.bw-savebar')).toHaveCount(0);
});

test('an editor-role login can change a basic page', async ({ page, browser }) => {
  const { nonce, post } = await freshPage(page);
  const login = 'pw-editor-' + Date.now();
  const password = 'pw-editor-' + Date.now() + '!Aa';
  const user = await page.request.post('/wp-json/wp/v2/users', {
    headers: { 'X-WP-Nonce': nonce },
    data: { username: login, email: `${login}@example.test`, password, roles: ['editor'] },
  });
  expect(user.ok(), 'creating the editor-role user').toBeTruthy();

  const context = await browser.newContext({ storageState: undefined });
  const client = await context.newPage();
  await signIn(client, login, password);
  const canvas = await openBlockEditor(client, post.id);
  const paragraph = canvas.locator('.wp-block-paragraph').first();
  await paragraph.click();
  await client.keyboard.press('End');
  await client.keyboard.type(' Changed by the client.');
  await update(client);
  await context.close();

  await page.goto(post.link);
  await expect(page.locator('body')).toContainText('Changed by the client.');
});
