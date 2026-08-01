# Recipe Book

The standard approach to problems we keep solving. Before building anything on
this list, read its recipe and follow it. If no recipe exists yet, propose one
for Luke's approval rather than inventing an approach per project — the point of
this book is that the fifth project doesn't relitigate what the first four
learned.

A recipe is only worth reading if it is honest, so each one states what it does
**not** solve as plainly as what it does. A recipe that only documents the happy
path sends the next project down the same wall the last one hit.

Recipes are approved before they become standing guidance. An unapproved draft
belongs in a pull request, not here.

**Contents**

- [WordPress shortcodes on a headless site](#wordpress-shortcodes-on-a-headless-site)
- [Contact form](#contact-form) — not written yet
- [Login](#login) — not written yet
- [File upload](#file-upload) — not written yet
- [Payment](#payment) — not written yet
- [Search](#search) — not written yet
- [Error and loading states](#error-and-loading-states) — not written yet

---

## WordPress shortcodes on a headless site

**Status:** approved standing guidance. Derived from
blueworx-io/blueworx_labs_wordpress#25 (the endpoint, shipped) and
blueworx-io/bluegroup_project_blueworx#11 (the consumer, closed unbuilt).

### Read this part first

**If a site leans on third-party shortcodes, that is an argument against
headless.** Not a detail to solve later — a reason to reconsider the
architecture while it is still cheap to change.

Every shortcode is a PHP function that expects to run inside a full WordPress
page render. Headless removes the thing it expects. What follows buys back most
of a shortcode's behaviour, but it buys it per shortcode, per plugin, forever:
each new third-party plugin is a fresh compatibility question, answered by
testing rather than by reading.

The BlueWorx marketing site is the worked example. It went headless, hit exactly
this, built the endpoint below — and then retired the Next.js app entirely and
became a WordPress plugin instead. The endpoint still ships and still works. The
project that needed it decided the class of problem was not worth owning.

### The problem

A shortcode's **markup** already reaches a headless frontend: `wp/v2` runs
`do_shortcode()` server-side, so `content.rendered` contains the output.

What does not reach it is the **CSS and JS**. Plugins enqueue those on
`wp_enqueue_scripts`, a hook that never fires for a REST request. So a pricing
table, a form, a gallery or a slider arrives as inert markup or an empty
container — present, styled by nothing, wired to nothing.

### The recipe

A render endpoint on the WordPress side that runs the shortcode *and reports
what it enqueued*. The reference implementation is `POST blueworx/v1/render` in
`blueworx_labs_wordpress`; `HEADLESS_INTEGRATION.md` in that repo is the API
contract.

**WordPress side**

1. Run `do_shortcode()` inside an output buffer.
2. Diff `wp_styles()` / `wp_scripts()` before and after to capture what the
   shortcode registered.
3. Return `{ html, shortcodes, styles[], scripts[] }` — the full dependency
   closure, dependencies first, including `wp_localize_script` data.
4. **Allowlist which tags may render**, in an admin setting, empty by default. A
   shortcode is a PHP function; an unallowlisted endpoint is arbitrary code
   execution for anonymous callers. A request mixing allowed and disallowed tags
   is refused whole, never rendered in part.
5. Rate limit it.

**Frontend side**

1. Detect shortcode-backed content and call the endpoint.
2. Load styles and scripts **in array order** — the list is already dependency
   ordered.
3. **Skip entries with an empty `src`**; some handles (`jquery`) are grouping
   aliases with no file of their own.
4. Inject `data` (the `wp_localize_script` output) **before** its script, or
   anything reading its config object throws on load.
5. Degrade gracefully. A failed asset fetch must still render the page — never a
   500.

### What this does not solve

State these to the client before quoting the work, not after.

- **Shortcodes that write to `wp_head`** or emit inline output outside the
  enqueue system. The diff cannot see what never entered the queue.
- **Shortcodes that depend on the loop** or on global post context.
- **Assets registered site-wide rather than in the shortcode's own callback.**
  `with_global_enqueue: true` fires `wp_enqueue_scripts` to catch these, but it
  also drags in whatever the theme and every other plugin enqueue globally. Off
  by default for that reason.
- **Every third-party plugin is its own compatibility test.** There is no
  general guarantee, only a per-plugin result you find by trying it.

### Choosing

- **A handful of known, tested shortcodes** → the recipe works. Test each one and
  record the result.
- **A shortcode-heavy site, or one where the client adds plugins themselves** →
  do not go headless. Build it as a WordPress plugin. The support burden is
  unbounded and lands on whoever maintains it, which is us.

---

## Contact form

Not written yet. Add the recipe the next time a project solves this, rather than
after.

## Login

Not written yet.

## File upload

Not written yet.

## Payment

Not written yet.

## Search

Not written yet.

## Error and loading states

Not written yet.
