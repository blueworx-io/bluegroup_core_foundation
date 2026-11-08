# Block editor for basic pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The shared rules say WordPress's block editor edits page content and the BlueWorx page editor edits settings and records, the checks stop fighting block editor code, and one test site proves a basic page and a BlueWorx editor screen work side by side under the theme.

**Architecture:** Rules change in the three places plugins read them (CLAUDE.md.template, the plugin starter prompt, the design system readme) plus the README. The admin markup checker learns that block editor code — a block registration, an editor-assets enqueue, anything under `blocks/` or `build/` — is WordPress's own UI and not judged. The foundation's Playwright suite gains a basic-page spec, and its CI checks out the public theme repo so the suite runs under the theme every site will have.

**Tech Stack:** node:test, Playwright, GitHub Actions.

**Spec:** bluegroup_core_foundation#102.

## Global Constraints

- No `package.json` in this repo. Node scripts are plain ESM.
- Only files in the PR diff are judged by the adherence check; the exemption must be in `classifyAdminFile` so both CI and the hook agree.
- The theme is checked out from `blueworx-io/blueworx_labs_wordpress_theme` (public) at `main`; it needs no install step to run.

## Review Focus

- A PHP file that both registers a block and adds an admin menu page is still an admin screen: pinned by a classify test.
- A `.jsx` under `blocks/` using `button-primary` is the block editor's business: pinned by a classify test.
- A page edited through the REST API must open again in the block editor with no "block recovery" warning: pinned by the REST round-trip test.
- An editor-role login must be able to change a basic page: pinned by the client-login test.
- The theme's admin restyling must not break the editor example suite: pinned by running the whole suite under the theme in CI.

---

### Task 1: Exempt block editor code from the admin markup checker

**Files:**
- Modify: `scripts/lib/admin-ui.mjs` (`classifyAdminFile`, constants at top)
- Test: `scripts/lib/admin-ui.test.mjs`

**Interfaces:**
- Produces: `classifyAdminFile` returns `null` for block editor files. New constants `BLOCK_EDITOR_CALL = /\bregister_block_type(?:_from_metadata)?\s*\(|\benqueue_block_editor_assets\b/` and `BLOCK_DIR = /(?:^|\/)(?:blocks|build)\//`.

- [ ] Step 1: tests — `classifyAdminFile: a block registration with an editor-assets enqueue is the block editor, not an admin screen` (PHP with `enqueue_block_editor_assets` + `register_block_type` → null); `classifyAdminFile: a block's edit script is not judged, whatever classes it uses` (`blocks/hero/edit.jsx` containing `className="button-primary bw-card"` → null); `classifyAdminFile: a file that registers a block and an admin page is still an admin screen` (both → 'php').
- [ ] Step 2: run `node --test scripts/lib/admin-ui.test.mjs`, expect 2 FAIL.
- [ ] Step 3: implement in `classifyAdminFile`: after the editor-library exemption, `if (BLOCK_DIR.test(p)) return null;` and in the PHP branch `if (BLOCK_EDITOR_CALL.test(content) && !ADMIN_PAGE_CALL.test(content) && !ADMIN_MARKUP.test(content)) return null;`.
- [ ] Step 4: run, expect PASS. Commit.

### Task 2: Write the rules

**Files:**
- Modify: `CLAUDE.md.template:88-102`, `docs/starter-prompt-wordpress-plugin.md:10-12,101-116`, `.claude/skills/blueworx-admin-design/readme.md` (`## Custom editor screens` intro), `README.md:12-13`.

- [ ] Step 1: new bullet before the custom-editor bullet, in the template and the starter prompt: **Page content is edited in WordPress's block editor.** Ordinary pages are built from standard blocks and edited there, never on a BlueWorx screen; the theme gives the editor the site's colours and fonts. Block editor code (a block registration, an editor-assets enqueue, anything under `blocks/` or `build/`) is WordPress's own UI and is not judged by the admin screen check. The BlueWorx page editor is for settings and records.
- [ ] Step 2: change "edits a record or a set of page content" → "edits a record or plugin settings" in all three; "Any screen where somebody edits content is a page editor screen" → "Any screen where somebody edits a record or settings is a page editor screen"; the no-page-builders paragraph gains "Pages themselves are edited in WordPress's block editor."
- [ ] Step 3: README line 12: add "Page content is edited in WordPress's block editor; the page editor is for settings and records."
- [ ] Step 4: commit.

### Task 3: The basic-page spec

**Files:**
- Create: `.wp-test/tests/basic-page.spec.js`
- Modify: `.wp-test/tests/page-editor.spec.js` (none; the auth state file is shared via the same `AUTH_STATE` path)

**Interfaces:**
- Consumes: REST `wp/v2/pages` with the signed-in admin's nonce via `wp.apiFetch` in `page.evaluate`, as page-editor.spec.js does for `bwx_sport`.

- [ ] Step 1: tests, each creating its own page in `beforeEach` through REST with `status: 'publish'`:
  - `a page written in the block editor shows on the live site`: open `post.php?post=ID&action=edit`, dismiss the welcome guide if shown, type into the title and a paragraph, click Update, wait for the "updated" snackbar, visit `link`, assert both texts.
  - `a page edited through the REST API renders and opens again without a block warning`: GET `?context=edit`, append `<!-- wp:paragraph --><p>Added by the API</p><!-- /wp:paragraph -->` to `content.raw`, POST, visit `link`, assert; open the editor, assert `.block-editor-warning` has count 0.
  - `a BlueWorx editor screen and a basic page live on the same site`: create a `bwx_sport`, open `admin.php?page=bwx-sport-editor&id=`, assert `.bw-pagehead` visible; then open the page's editor, assert `.editor-styles-wrapper` visible.
  - `an editor-role login can change a basic page`: as admin create a user with role `editor` via REST; new context, sign in as that user, open the page editor, change the paragraph, Update, visit, assert.
- [ ] Step 2: run against the harness (theme + example plugin), expect PASS. Commit.

### Task 4: Run the suite under the theme in CI

**Files:**
- Modify: `.github/workflows/foundation-ci.yml` (wordpress job), `docs/wordpress-test-harness.md:69-115`.

- [ ] Step 1: add a checkout of `blueworx-io/blueworx_labs_wordpress_theme` into `.wp-test/theme`, and change the `up` line to `--theme .wp-test/theme --theme-slug blueworx-labs-wordpress-theme --plugin .wp-test/example-plugin`.
- [ ] Step 2: add `.wp-test/theme` to `.gitignore`. Document the local command in the harness doc.
- [ ] Step 3: run the whole suite locally under the theme, expect PASS. Commit.
