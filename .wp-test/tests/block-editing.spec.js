const { test, expect } = require('@playwright/test');
const path = require('node:path');

// The test page: the whole route, end to end. A page built from standard
// blocks plus the worked section block, edited in the block editor and
// through the REST API, and seen on the live page each time. This is the
// proof that content lives in the page and layout lives in the plugin.
const USER = process.env.WP_ADMIN_USER || 'admin';
const PASS = process.env.WP_ADMIN_PASS || 'wptest-admin-pw';
const LOGIN_PATH = '/' + (process.env.WP_LOGIN_PATH || 'wp-login.php').replace(/^\/+/, '');
const AUTH_STATE = path.join(__dirname, '.auth-state-blocks.json');

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  await page.goto(LOGIN_PATH);
  await page.fill('#user_login', USER);
  await page.fill('#user_pass', PASS);
  await page.click('#wp-submit');
  await expect(page.locator('body')).toHaveClass(/wp-admin|wp-core-ui/);
  await context.storageState({ path: AUTH_STATE });
  await context.close();
});

test.use({ storageState: AUTH_STATE });

let pageErrors = [];
test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  // See the theme's tests/helpers.js: without this a link click can freeze
  // headless Chromium's rendering for the rest of the test.
  await page.emulateMedia({ reducedMotion: 'reduce' });
});
test.afterEach(async () => {
  expect(pageErrors, 'the page threw in the browser').toEqual([]);
});

const HERO = {
  eyebrow: 'Welcome',
  heading: 'A section the plugin draws',
  text: 'Change these words; the layout stays the plugin\'s.',
  buttonLabel: 'Find out more',
  buttonUrl: 'https://example.test/more',
};

// An image WordPress itself ships, so the page needs no upload.
const IMAGE_URL = '/wp-includes/images/w-logo-blue.png';

const CONTENT = [
  `<!-- wp:bwx/section-hero ${JSON.stringify(HERO)} /-->`,
  '<!-- wp:heading --><h2 class="wp-block-heading">The test page</h2><!-- /wp:heading -->',
  '<!-- wp:paragraph --><p>Words anyone can edit.</p><!-- /wp:paragraph -->',
  `<!-- wp:image --><figure class="wp-block-image"><img src="${IMAGE_URL}" alt="The WordPress mark"/></figure><!-- /wp:image -->`,
].join('');

async function restNonce(page) {
  await page.goto('/wp-admin/index.php');
  return page.evaluate(() => window.wpApiSettings && window.wpApiSettings.nonce);
}

async function freshPage(page) {
  const nonce = await restNonce(page);
  const created = await page.request.post('/wp-json/wp/v2/pages', {
    headers: { 'X-WP-Nonce': nonce },
    data: { title: 'The test page', status: 'publish', content: CONTENT },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  return { nonce, post: await created.json() };
}

async function openEditor(page, id) {
  await page.goto(`/wp-admin/post.php?post=${id}&action=edit`);
  const canvas = page.frameLocator('iframe[name="editor-canvas"]');
  await expect(canvas.locator('.editor-styles-wrapper')).toBeVisible({ timeout: 60000 });
  const overlay = page.locator('.components-modal__screen-overlay');
  const deadline = Date.now() + 30000;
  let clearFor = 0;
  while (Date.now() < deadline && clearFor < 2) {
    if (await overlay.count()) {
      clearFor = 0;
      const dialog = page.getByRole('dialog').first();
      const takeOver = dialog.getByRole('link', { name: /take over/i }).or(dialog.getByRole('button', { name: /take over/i }));
      if (await takeOver.count()) {
        await takeOver.first().click();
        await expect(canvas.locator('.editor-styles-wrapper')).toBeVisible({ timeout: 60000 });
      } else {
        await dialog.getByRole('button', { name: /^close$/i }).first().click();
      }
      await overlay.first().waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    } else {
      clearFor += 1;
    }
    await page.waitForTimeout(1000);
  }
  await expect(overlay).toHaveCount(0);
  return canvas;
}

async function update(page) {
  await page.getByRole('button', { name: /^(Update|Save)$/ }).click();
  await expect(page.getByText(/updated\.|Page updated/i).first()).toBeVisible({ timeout: 30000 });
}

test('the test page renders every part, with the section drawn by the plugin', async ({ page }) => {
  const { nonce, post } = await freshPage(page);

  await page.goto(post.link);
  const hero = page.locator('.bwx-hero');
  await expect(hero).toBeVisible();
  await expect(hero.locator('.bwx-hero__heading')).toHaveText(HERO.heading);
  await expect(hero.locator('.bwx-hero__button')).toHaveAttribute('href', HERO.buttonUrl);
  await expect(page.locator('h2.wp-block-heading')).toHaveText('The test page');
  await expect(page.locator('.wp-block-image img')).toHaveAttribute('alt', 'The WordPress mark');

  // The saved page carries the section's words and nothing of its markup:
  // that is what lets a change to render.php reach pages already built.
  const saved = await page.request.get(`/wp-json/wp/v2/pages/${post.id}?context=edit`, { headers: { 'X-WP-Nonce': nonce } });
  const raw = (await saved.json()).content.raw;
  expect(raw).toContain('<!-- wp:bwx/section-hero');
  expect(raw).not.toContain('bwx-hero__heading');
});

test('edits made in the block editor show on the live page', async ({ page }) => {
  const { post } = await freshPage(page);
  const canvas = await openEditor(page, post.id);

  // A standard block: the heading. Select all of it and retype, so where the
  // click happened to land the caret does not matter.
  const heading = canvas.locator('h2.wp-block-heading');
  await heading.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('The test page, edited');

  // The section's own words, in place.
  const sectionHeading = canvas.locator('.bwx-hero__heading');
  await sectionHeading.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(`${HERO.heading} today`);

  // And a section field in the sidebar.
  await page.getByRole('tab', { name: 'Block' }).click().catch(() => {});
  const label = page.getByLabel('Button label');
  await expect(label).toBeVisible();
  await label.fill('Read on');

  await update(page);

  await page.goto(post.link);
  await expect(page.locator('h2.wp-block-heading')).toHaveText('The test page, edited');
  await expect(page.locator('.bwx-hero__heading')).toHaveText(`${HERO.heading} today`);
  await expect(page.locator('.bwx-hero__button')).toHaveText('Read on');
});

test('a page edited through the REST API, the way Claude does it, still renders and opens cleanly', async ({ page }) => {
  const { nonce, post } = await freshPage(page);

  const current = await page.request.get(`/wp-json/wp/v2/pages/${post.id}?context=edit`, { headers: { 'X-WP-Nonce': nonce } });
  const raw = (await current.json()).content.raw;
  const changed = raw
    .replace('"heading":"A section the plugin draws"', '"heading":"Rewritten by the API"')
    .replace('Words anyone can edit.', 'Words the API edited.');
  expect(changed).not.toBe(raw);
  const saved = await page.request.post(`/wp-json/wp/v2/pages/${post.id}`, {
    headers: { 'X-WP-Nonce': nonce },
    data: { content: changed },
  });
  expect(saved.ok(), await saved.text()).toBeTruthy();

  await page.goto(post.link);
  await expect(page.locator('.bwx-hero__heading')).toHaveText('Rewritten by the API');
  await expect(page.locator('body')).toContainText('Words the API edited.');

  const canvas = await openEditor(page, post.id);
  await expect(canvas.locator('.block-editor-warning')).toHaveCount(0);
  await expect(canvas.locator('.bwx-hero__heading')).toHaveText('Rewritten by the API');
});
