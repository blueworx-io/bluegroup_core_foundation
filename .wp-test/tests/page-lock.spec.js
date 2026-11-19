const { test, expect } = require('@playwright/test');
const path = require('node:path');

// The shared page lock, end to end: a page is locked as it is created, a
// client can change its words but not its sections, and the editor shows a
// client only what they can use. The example plugin carries the lock exactly
// as a theme or plugin does; the BlueWorx theme on the test site still has its
// own older lock, so this also proves the shared copy takes over from it.
const USER = process.env.WP_ADMIN_USER || 'admin';
const PASS = process.env.WP_ADMIN_PASS || 'wptest-admin-pw';
const LOGIN_PATH = '/' + (process.env.WP_LOGIN_PATH || 'wp-login.php').replace(/^\/+/, '');
const AUTH_STATE = path.join(__dirname, '.auth-state-lock.json');
const META = '_blueworx_page_lock';

const hero = (heading) => `<!-- wp:bwx/section-hero ${JSON.stringify({ heading, text: 'Words.' })} /-->`;
const LAYOUT = hero('First section') + hero('Second section');

let client = { login: '', password: '' };

async function signIn(page, user, pass) {
  await page.goto(LOGIN_PATH);
  await page.fill('#user_login', user);
  await page.fill('#user_pass', pass);
  await page.click('#wp-submit');
  await expect(page.locator('body')).toHaveClass(/wp-admin|wp-core-ui/);
}

// WordPress's own nonce endpoint: works for any login, wherever the theme
// sends that login after signing in.
async function nonceFor(page) {
  const res = await page.request.get('/wp-admin/admin-ajax.php?action=rest-nonce');
  expect(res.ok(), 'fetching a REST nonce').toBeTruthy();
  return (await res.text()).trim();
}

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  await signIn(page, USER, PASS);
  await context.storageState({ path: AUTH_STATE });

  const stamp = Date.now();
  client = { login: `pw-client-${stamp}`, password: `pw-client-${stamp}!Aa` };
  const made = await page.request.post('/wp-json/wp/v2/users', {
    headers: { 'X-WP-Nonce': await nonceFor(page) },
    data: { username: client.login, email: `${client.login}@example.test`, password: client.password, roles: ['editor'] },
  });
  expect(made.ok(), 'creating the client login').toBeTruthy();
  await context.close();
});

test.use({ storageState: AUTH_STATE });

let pageErrors = [];
test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});
test.afterEach(async () => {
  expect(pageErrors, 'the page threw in the browser').toEqual([]);
});

async function asClient(browser) {
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signIn(page, client.login, client.password);
  return { context, page, nonce: await nonceFor(page) };
}

async function createPage(page, nonce, content) {
  const res = await page.request.post('/wp-json/wp/v2/pages', {
    headers: { 'X-WP-Nonce': nonce },
    data: { title: `Locked page ${Date.now()}`, status: 'publish', content },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return res.json();
}

async function savedContent(page, nonce, id) {
  const res = await page.request.get(`/wp-json/wp/v2/pages/${id}?context=edit`, { headers: { 'X-WP-Nonce': nonce } });
  return (await res.json()).content.raw;
}

async function openEditor(page, id) {
  await page.goto(`/wp-admin/post.php?post=${id}&action=edit`);
  const canvas = page.frameLocator('iframe[name="editor-canvas"]');
  await expect(canvas.locator('.editor-styles-wrapper')).toBeVisible({ timeout: 60000 });
  // Close the welcome guide or any other first-run dialog, until none has
  // shown for two seconds running: a second one can open after the first.
  const overlay = page.locator('.components-modal__screen-overlay');
  const deadline = Date.now() + 30000;
  let clearFor = 0;
  while (Date.now() < deadline && clearFor < 2) {
    if (await overlay.count()) {
      clearFor = 0;
      await page.getByRole('dialog').first().getByRole('button', { name: /^close$/i }).first().click();
      await overlay.first().waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    } else {
      clearFor += 1;
    }
    await page.waitForTimeout(1000);
  }
  await expect(overlay).toHaveCount(0);
  await page.waitForFunction(() => window.wp && wp.data && wp.data.select('core/editor').getCurrentPostId());
  return canvas;
}

test('a new page is locked as it is created, whoever creates it', async ({ page, browser }) => {
  const nonce = await nonceFor(page);
  const byAdmin = await createPage(page, nonce, LAYOUT);
  expect(byAdmin.meta[META]).toBe(true);

  const { context, page: cp, nonce: clientNonce } = await asClient(browser);
  const byClient = await createPage(cp, clientNonce, LAYOUT);
  await context.close();
  const check = await page.request.get(`/wp-json/wp/v2/pages/${byClient.id}?context=edit`, { headers: { 'X-WP-Nonce': nonce } });
  expect((await check.json()).meta[META]).toBe(true);

  // Searched by its own title: on a busy site the list runs to several screens.
  await page.goto(`/wp-admin/edit.php?post_type=page&s=${encodeURIComponent(byAdmin.title.raw)}`);
  await expect(page.locator(`#post-${byAdmin.id} .post-state`)).toContainText('Locked');
});

test('a client or Claude can change words but not sections', async ({ page, browser }) => {
  const nonce = await nonceFor(page);
  const post = await createPage(page, nonce, LAYOUT);
  const { context, page: cp, nonce: clientNonce } = await asClient(browser);

  const words = await cp.request.post(`/wp-json/wp/v2/pages/${post.id}`, {
    headers: { 'X-WP-Nonce': clientNonce },
    data: { content: hero('New words') + hero('Second section') },
  });
  expect(words.ok(), await words.text()).toBeTruthy();

  const added = await cp.request.post(`/wp-json/wp/v2/pages/${post.id}`, {
    headers: { 'X-WP-Nonce': clientNonce },
    data: { content: hero('New words') + hero('Second section') + hero('Sneaked in') },
  });
  expect(added.status()).toBe(403);
  expect(await added.text()).toContain('This page is locked');

  const unlock = await cp.request.post(`/wp-json/wp/v2/pages/${post.id}`, {
    headers: { 'X-WP-Nonce': clientNonce },
    data: { meta: { [META]: false } },
  });
  expect(unlock.ok()).toBeFalsy();
  await context.close();

  const raw = await savedContent(page, nonce, post.id);
  expect(raw).toContain('New words');
  expect(raw).not.toContain('Sneaked in');
});

test('an empty page takes its first layout once', async ({ page, browser }) => {
  const { context, page: cp, nonce } = await asClient(browser);
  const post = await createPage(cp, nonce, '');
  const first = await cp.request.post(`/wp-json/wp/v2/pages/${post.id}`, {
    headers: { 'X-WP-Nonce': nonce },
    data: { content: LAYOUT },
  });
  expect(first.ok(), await first.text()).toBeTruthy();
  const second = await cp.request.post(`/wp-json/wp/v2/pages/${post.id}`, {
    headers: { 'X-WP-Nonce': nonce },
    data: { content: LAYOUT + hero('Third') },
  });
  expect(second.status()).toBe(403);
  await context.close();
});

test('a client gets the simple editor on a locked page', async ({ page, browser }) => {
  const post = await createPage(page, await nonceFor(page), LAYOUT);
  const { context, page: cp } = await asClient(browser);
  const canvas = await openEditor(cp, post.id);

  const state = await cp.evaluate(() => ({
    code: wp.data.select('core/editor').getEditorSettings().codeEditingEnabled,
    templateLock: wp.data.select('core/block-editor').getSettings().templateLock,
    listView: (wp.data.select('core/editor').isListViewOpened || wp.data.select('core/edit-post').isListViewOpened)(),
  }));
  expect(state.code).toBe(false);
  expect(state.templateLock).toBe('all');
  expect(state.listView).toBe(true);

  await expect(cp.locator('.editor-document-tools__inserter-toggle, .edit-post-header-toolbar__inserter-toggle')).toBeHidden();
  await expect(cp.locator('.blueworx-page-lock')).toHaveCount(1);
  await expect(cp.locator('.blueworx-page-lock')).toContainText('This page is locked');

  // Words typed onto the page still save.
  const heading = canvas.locator('.bwx-hero__heading').first();
  await heading.click();
  await cp.keyboard.press('Control+A');
  await cp.keyboard.type('Typed by the client');
  await cp.getByRole('button', { name: /^(Update|Save)$/ }).click();
  await expect(cp.getByText(/updated\.|Page updated/i).first()).toBeVisible({ timeout: 30000 });
  await context.close();

  expect(await savedContent(page, await nonceFor(page), post.id)).toContain('Typed by the client');
});

test('a client is offered only section blocks on an empty page', async ({ page, browser }) => {
  const { context, page: cp, nonce } = await asClient(browser);
  const post = await createPage(cp, nonce, '');
  await openEditor(cp, post.id);
  const allowed = await cp.evaluate(() => wp.data.select('core/block-editor').getSettings().allowedBlockTypes);
  expect(allowed).toContain('bwx/section-hero');
  expect(allowed.filter((name) => name.startsWith('core/'))).toEqual([]);
  const templateLock = await cp.evaluate(() => wp.data.select('core/block-editor').getSettings().templateLock);
  expect(templateLock).toBeFalsy();
  await context.close();
});

test('an administrator gets the normal editor and the lock switch', async ({ page }) => {
  const post = await createPage(page, await nonceFor(page), LAYOUT);
  await openEditor(page, post.id);
  const settings = await page.evaluate(() => wp.data.select('core/block-editor').getSettings());
  expect(settings.templateLock).toBeFalsy();
  await expect(page.locator('.blueworx-page-lock')).toHaveCount(1);
  await expect(page.locator('.blueworx-page-lock').getByRole('checkbox', { name: 'Locked' })).toBeChecked();
});
