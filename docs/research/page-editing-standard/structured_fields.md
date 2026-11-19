# Structured content (fixed page schemas in post meta, PHP-rendered) as a 10+ year page-building standard

Research date: 18 November 2026. Facts are dated where the source is older, and sources are flagged where they are secondary blogs.

## 1. Options: ownership, licensing, maintenance health and longevity risk

### Takeaway
ACF (owned by WP Engine, Pro is a paid licence) and its WordPress.org fork Secure Custom Fields (SCF) are both actively shipping in Nov 2026, but the ACF/SCF split is still unresolved in court until at least late 2027, and the two plugins can't run side by side. Meta Box is healthy and commercial. Pods is donation-funded. Carbon Fields is a Composer library with a slowing release cadence and a large backlog. Core `register_post_meta` has no vendor risk at all but gives you no admin UI.

### Cited Findings
**ACF / ACF Pro**
- ACF is authored by WP Engine and is back on WordPress.org: version 6.8.10, 2M+ active installs. ACF PRO costs $49/yr for 1 site, $149 for 10 sites and $249 for unlimited, and is sold only on advancedcustomfields.com. The PRO-only features are Repeater, ACF Blocks, Flexible Content, Options Pages, Gallery and Clone. Secondary blog dated Oct 2026. — [eseospace (Oct 2026)](https://eseospace.com/blog/wordpress-custom-fields-acf-scf/)
- ACF 6.8's headline feature is integration with the core Abilities API, so the WordPress MCP adapter can manage field groups, post types and taxonomies. It requires WP 6.9+, ACF 6.8+ and an MCP adapter. — [ACF blog, 6.8 release](https://www.advancedcustomfields.com/?p=737295); [ACF MCP feature request](https://feedback.wpengine.com/acf/p/mcp-support)
- A secondary source (unverified) says ACF's abilities require the `manage_options` capability by default and offer no per-field-group access control. — [lilting.ch](https://lilting.ch/en/articles/acf-68-abilities-api-ai-ready-wordpress)
- ACF 6.8.1 adds full Block Bindings API support: the Attributes panel UI plus live preview with in-place editing. It needs the ACF datastore and the `enable_block_bindings` setting turned on, and only fields marked "Allow Access to Value in Editor UI" appear. — [ACF 6.8.1 release](https://newreleases.io/project/github/AdvancedCustomFields/acf/release/6.8.1); [ACF blog](https://www.advancedcustomfields.com/?p=746788)

**Secure Custom Fields (SCF) and the fork dispute**
- Timeline:
  - 25 Sep 2024: WordPress.org cut WP Engine's access.
  - 12 Oct 2024: WordPress.org forked ACF into SCF, citing plugin guideline 18.
  - 10 Dec 2024: a preliminary injunction was granted, and WP Engine regained control of the ACF listing.
  - Source: secondary blog dated Oct 2026. — [eseospace](https://eseospace.com/blog/wordpress-custom-fields-acf-scf/); [The Repository (Oct 2024)](https://www.therepository.email/wordpress-org-forks-acf-pro-in-unprecedented-move-against-wp-engine)
- SCF on WordPress.org:
  - Status: v6.9.9 (11 Nov 2026), 100,000+ installs, contributor "WordPress.org", tested up to WP 7.1.4.
  - Features: includes Repeater, Flexible Content, Clone, options pages and SCF Blocks (v2/v3), all free.
  - Conflict: installing SCF deactivates ACF and ACF Pro.
  - Changelog: Abilities API and JSON schemas (Nov–Dec 2025); AI/Abilities and JSON-LD behind feature flags, plus WP-CLI `scf json` (Apr 2026); a run of security-hardening releases (Jun–Nov 2026); blocks default to v3 on WP 7.1+ (6.9.6).
  - Source: [WordPress.org SCF listing](https://wordpress.org/plugins/secure-custom-fields/)
- The listing says SCF was "forked from ACF in March 2025 (6.4.1)", which conflicts with the Oct 2024 fork date given elsewhere. The likely explanation is a re-base, but this is unconfirmed. — [WordPress.org SCF listing](https://wordpress.org/plugins/secure-custom-fields/)
- Lawsuit (WP Engine v Automattic, N.D. Cal. 4:24-cv-06917):
  - 24 Sep 2026 ruling: antitrust claims proceed, the CFAA extortion claim is dismissed, and Automattic's trademark counterclaims mostly survive.
  - Jury trial set for 19 Oct 2027. Summary judgment motion due 20 Nov 2026.
  - Source: secondary reporting. — [webhosting.today (29 Sep 2026)](https://webhosting.today/2026/09/29/automattic-is-not-an-owner-of-the-wordpress-marks-it-asserted-in-court-a-judge-rules/); [The Repository](https://www.therepository.email/judge-says-hes-leaning-toward-denying-wp-engines-bid-to-sanction-automattic-over-disappearing-messages)

**Meta Box**
- Meta Box has 500,000+ installs. The core plugin is free, extensions are sold as bundles from $49/yr, and lifetime options exist (Oct 2026). — [eseospace](https://eseospace.com/blog/wordpress-custom-fields-acf-scf/); [WordPress.org](https://wordpress.org/plugins/meta-box/)
- I found no reports of a Meta Box acquisition in 2025–2026. Meta Box AIO now bundles the free extensions. — [metabox.io](https://metabox.io/tag/free-extensions/)

**Pods**
- Pods has 100,000+ installs, is led by Scott Kingsley Clark and is donation-funded. Pods Pro is a third-party add-on from SKCDEV. — [eseospace](https://eseospace.com/blog/wordpress-custom-fields-acf-scf/)

**Carbon Fields**
- The WordPress.org plugin was closed permanently on 6 Feb 2019 at the author's request, so Carbon Fields is now Composer-only. — [WordPress.org listing](https://wordpress.org/plugins/carbon-fields/)
- On GitHub, the latest release is v3.6.11 (27 Aug, year not shown, likely 2025). v3.6.6 fixed WP 6.8 compatibility. The repo has 264 open issues and 31 open PRs. — [GitHub releases](https://github.com/htmlburger/carbon-fields/releases)

**Core `register_post_meta`**
- Core has a typed meta registration with `show_in_rest`, schema, `sanitize_callback`, `auth_callback`, `single`, `default` and `revisions_enabled` (6.4+). It ships with WordPress, so there is no vendor risk. — [developer.wordpress.org register_meta](https://developer.wordpress.org/reference/functions/register_meta/)

### Inferences
- For a 10-year horizon, the safest data layer is core-registered meta. A third-party UI plugin on top of it can then be swapped without migrating data.
- ACF vs SCF is a bet on an unresolved legal and political split. Both store data in the same `postmeta` format, which limits lock-in to the admin UI and the field-definition JSON.
- Carbon Fields looks like the weakest long-term bet.

### Gaps
- I couldn't verify Pods' 2026 release cadence or Meta Box's exact 2026 version numbers from primary pages.
- I didn't verify whether ACF 6.8.10 is still the latest ACF version in Nov 2026.

## 2. Revisions, drafts, preview and autosave for post meta

### Takeaway
Since WP 6.4 core can revision, autosave and preview opted-in meta, so previewing no longer overwrites live meta. Real-world preview of field-based content in the block editor is still flaky, according to long-running ACF reports.

### Cited Findings
- Meta revisions are opt-in through `revisions_enabled` in `register_meta` / `register_post_meta`, and it defaults to false. The post type must support revisions, or a `doing_it_wrong` warning fires. The `wp_post_revision_meta_keys` filter can add keys. — [Make Core dev note, 24 Oct 2023](https://make.wordpress.org/core/2023/10/24/framework-for-storing-revisions-of-post-meta-in-6-4/)
- Opted-in meta is stored with autosaves and restored when a revision or autosave is restored. — [Make Core dev note](https://make.wordpress.org/core/2023/10/24/framework-for-storing-revisions-of-post-meta-in-6-4/)
- Previews no longer overwrite live meta (fixes Trac #20299), because meta is attached to the revision. — [Make Core dev note](https://make.wordpress.org/core/2023/10/24/framework-for-storing-revisions-of-post-meta-in-6-4/)
- The REST revisions endpoint returns revisioned meta, and the autosaves endpoint stores it. — [Make Core dev note](https://make.wordpress.org/core/2023/10/24/framework-for-storing-revisions-of-post-meta-in-6-4/)
- Revisions are now created on `wp_after_insert_post`, after REST has saved the meta. Direct meta SQL queries may need `post_parent` handling. — [Make Core dev note](https://make.wordpress.org/core/2023/10/24/framework-for-storing-revisions-of-post-meta-in-6-4/)
- The dev note frames this as groundwork for Phase 3 collaboration, not a finished feature. — [Make Core dev note](https://make.wordpress.org/core/2023/10/24/framework-for-storing-revisions-of-post-meta-in-6-4/)
- Trac #60796 (2024) reported a "Meta keys cannot enable revisions support" error on types without revisions, caused by core footnotes hardcoding `revisions_enabled`. — [Trac #60796](https://core.trac.wordpress.org/ticket/60796)
- ACF runs its own revision and preview handling, through `acf_revisions::wp_preview_post_fields`. — [wp-kama](https://wp-kama.com/plugin/acf/function/acf_revisions::wp_preview_post_fields)
- Forum reports of ACF preview problems, mostly older and anecdotal:
  - Preview shows old values until the draft is saved.
  - Preview only works on every second click.
  - Preview fails on custom post types without revisions support.
  - A WPGraphQL thread blames a Gutenberg bug (gutenberg#16006) for ACF meta not being kept for previews, while the classic editor works.
  - Source: [ACF support](https://support.advancedcustomfields.com/?p=163777); [WP support](https://remarpro.com/support/topic/wpgraphql-acf-draft-mode-isnt-working)

### Inferences
- A custom `register_post_meta` schema with `revisions_enabled => true` gets core revisions and autosave preview for free.
- The ClubHouse editor's own form screens and REST routes probably bypass this, because core's handling hooks into the standard post save and autosave paths. This needs checking.
- Concurrent editing (the "two editors undid each other" problem) isn't solved by revisions. Meta is still last-write-wins per key, and core collaboration features weren't confirmed here.

### Gaps
- I found no authoritative 2026 statement on whether preview of unsaved meta in the block editor is fully fixed in core.
- I didn't confirm how WP 7.x real-time collaboration (if shipped) treats meta.

## 3. REST/MCP editability

### Takeaway
Core meta registered with `show_in_rest` gets a schema and validation for free, and ACF has a full read/write `acf` REST key with schema. Both let an agent read and write a whole page in one request, but only if every field is registered, defaults are stored rather than hard-coded, and a nested schema is supplied for arrays and objects.

### Cited Findings
- Core: `register_meta` takes a `show_in_rest` bool or array, where the array can carry a JSON `schema`. Meta appears under `meta` in the post endpoint. — [developer.wordpress.org register_meta](https://developer.wordpress.org/reference/functions/register_meta/)
- For meta to appear in REST, the post type must support `custom-fields` and have `show_in_rest`. — [Gist](https://gist.github.com/KustomDeveloper/83b63a7435f227661fe8c3378499c8f5)
- Block Bindings docs say meta must have `show_in_rest => true`, and keys starting with `_` (protected meta) are excluded. — [Block Bindings handbook](https://developer.wordpress.org/block-editor/how-to-guides/block-bindings/)
- ACF REST support:
  - Introduced in ACF 5.11. It is off by default and turned on per field group with "Show in REST API".
  - Values appear in an `acf` object on posts, pages, CPTs, users and terms.
  - The default format is `light` (raw values). `acf_format=standard` returns formatted values.
  - Writes are POST requests with the same `acf` structure, and `null` clears a field.
  - OPTIONS returns the field schema, and invalid input gets a 400 error.
  - Unsupported: Message, Accordion and Tab fields. Flexible Content rows need `acf_fc_layout`. The docs don't mention options pages.
  - Source: [ACF REST docs](https://www.advancedcustomfields.com/resources/wp-rest-api-integration/)
- ACF 6.8 Abilities API with the MCP adapter manages schema (field groups, post types, taxonomies), not content values per the release note. — [ACF blog](https://www.advancedcustomfields.com/?p=737295)
- SCF has Abilities API integration and JSON schemas (6.6–6.8, late 2025). — [SCF listing](https://wordpress.org/plugins/secure-custom-fields/)
- Meta Box: the MB REST API extension puts values under a `meta_box` key. `hide_from_rest` was added in v1.5.0. — [MB REST API readme](https://cdn.jsdelivr.net/wp/plugins/mb-rest-api/tags/1.3.2/readme.txt); [metabox.io](https://metabox.io/plugins/mb-rest-api/)

### Inferences
- Structured meta is more agent-friendly than block markup: a named JSON object with a schema, instead of HTML-comment-delimited blocks. This only holds if the schema is the single source of truth.
- The ClubHouse problems (defaults in code, meta not exposed) are implementation choices, not limits of the approach. The fixes are `default` in `register_meta` or saving defaults on page creation, plus `show_in_rest` with a full schema.

### Gaps
- I didn't confirm Pods' REST field behaviour.
- I didn't verify whether ACF/SCF abilities write field values (not just schema) through MCP.

## 4. Translation (WPML, Polylang, TranslatePress)

### Takeaway
All three handle custom fields, but meta needs configuration that block content doesn't. WPML is the most mature (per-field Translate/Copy/Copy once/Don't translate). Polylang Pro's ACF integration was rewritten in 3.7. TranslatePress translates whatever renders on the front end, so storage doesn't matter to it.

### Cited Findings
- WPML + ACFML (page updated 28 Oct 2026):
  - Modes are set per field group: "same content translated", "each language own content" and Expert.
  - Each field has a preference: Translate, Copy, Copy once or Don't translate.
  - Repeaters and Flexible Content containers are Copy or Copy once, with per-sub-field preferences.
  - PHP-registered fields use `wpml_cf_preferences`, synced in ACF → Tools.
  - Options pages translate as a separate item.
  - Limitations: labels need String Translation; Expert mode can desync repeater rows; conditional logic follows source-language values if the controller is Copy.
  - Source: [WPML ACF docs](https://wpml.org/documentation/related-projects/translate-sites-built-with-acf/)
- WPML treats ACF Blocks the same way: block values live in post content and translate with the post, while `usePostMeta` blocks translate like custom fields. — [WPML ACF docs](https://wpml.org/documentation/related-projects/translate-sites-built-with-acf/)
- For non-ACF meta, WPML needs a translation preference per key (the same `wpml_cf_preferences` / custom-field settings concept). — [WPML ACF docs](https://wpml.org/documentation/related-projects/translate-sites-built-with-acf/)
- Polylang Pro 3.7 rewrote the ACF integration: the per-field translation options left the ACF field settings, and existing "synchronize" fields keep working. — [Polylang docs](https://polylang.pro/doc/working-with-acf-pro/)
- Polylang recommends against Synchronize for ACF blocks. — [Polylang docs](https://polylang.pro/doc/working-with-acf-pro/)
- Polylang's ACF options pages need a third-party add-on. — [Polylang docs](https://polylang.pro/doc/working-with-acf-pro/)
- TranslatePress translates custom field output in its visual front-end editor with no integration plugin, including automatic DeepL or Google translation. — [TranslatePress](https://translatepress.com/translate-custom-fields-in-wordpress/)

### Inferences
- With WPML or Polylang, a custom meta schema needs a translation preference per key, which is one more place to register each field. Using ACF/SCF gets mature WPML integration out of the box.

### Gaps
- I didn't confirm how WPML or Polylang handle plain `register_post_meta` JSON-object meta (a single meta holding a nested array). It is likely translated as a whole blob, which needs `wpml-config.xml` key paths, but this is unconfirmed.

## 5. SEO analysis, internal linking and search

### Takeaway
Yoast and Rank Math read `post_content` by default. Meta-stored content needs a bridge plugin (Yoast) or module (Rank Math) to be analysed, and internal-link counting and core search still ignore meta.

### Cited Findings
- ACF Content Analysis for Yoast SEO:
  - Status: v3.2, updated 6 Oct 2026, 100,000+ installs, tested to WP 7.1.4.
  - Without it, Yoast ignores ACF content. It covers Repeater and Flexible Content, and excludes URL and email fields.
  - It doesn't mention SCF.
  - Source: [WordPress.org](https://wordpress.org/plugins/acf-content-analysis-for-yoast-seo/)
- Users report Yoast's internal link counter doesn't count links in ACF fields, although link suggestions do see them. — [WP support](https://remarpro.com/support/topic/yoast-column-internal-links-in-acfs-not-counted)
- Rank Math:
  - Its built-in ACF module adds ACF fields to analysis, but the ACF plugin must be installed.
  - Other field systems need Rank Math's Content Analysis JS API. Meta Box has an MB Rank Math extension.
  - Source: [Rank Math KB](https://rankmath.com/kb/advanced-custom-fields/); [Meta Box docs](https://docs.metabox.io/tutorials/analyze-content-seo-rank-math)
- Rank Math support says ACF content is analysed as plain text, so headings and images may not be recognised. Its H1 check looks only in post content. — [Rank Math support](https://support.rankmath.com/?p=785898)
- Core search: `s` searches title, excerpt and content only, never meta. `search_columns` (2023) limits the core columns but doesn't add meta. Searching meta needs `posts_search` SQL or a plugin. — [WP support](https://wordpress.org/support/?p=14348393); [Trac #43867](https://core.trac.wordpress.org/ticket/43867)

### Inferences
- A custom meta schema (not ACF) would need custom JS for Yoast and Rank Math analysis, custom search indexing, and possibly a rendered-text mirror into `post_content`. One common pattern is saving a plain-text or HTML render of the page into `post_content` for search and SEO. This is an inference, not a cited practice.

### Gaps
- I didn't verify whether Yoast's indexables/link-watcher has added meta support in 2025–2026.

## 6. Hybrid: fields rendered as blocks (ACF Blocks, Block Bindings)

### Takeaway
Block Bindings (core, 6.5+) lets core blocks display and edit registered post meta in the canvas. It reached real usability by 6.7–6.9, and ACF 6.8.1 and Pattern Overrides for custom blocks (7.0) extend it. It is still limited to string values and selected attributes, so it can't express repeaters. ACF Blocks with `usePostMeta` puts values in meta but limits each block to once per page.

### Cited Findings
- Block Bindings by release:
  - 6.5 (Mar 2024): introduced, with Image, Paragraph, Heading and Button bound to `core/post-meta`.
  - 6.6: editing of bound meta values.
  - 6.7: Attributes panel to bind in the UI, plus a meta `label`.
  - Source: [Make Core 6.5](https://make.wordpress.org/core/2024/03/06/new-feature-the-block-bindings-api/); [Make Core 2024-06-28](https://make.wordpress.org/core/2024/06/28/editing-custom-fields-from-connected-blocks/); [Make Core 6.7](https://make.wordpress.org/core/2024/10/21/block-bindings-improvements-to-the-editor-experience-in-6-7/)
- Secondary source: editing bound values is on for admins by default and off for others, changeable with a filter. — [eseospace](https://eseospace.com/blog/wordpress-custom-fields-acf-scf/)
- In 6.9, Kinsta reports string is the only supported type. 6.9 added `core/post-data` and `core/term-data` sources and a way for developers to extend the attributes that support bindings. — [Kinsta](https://kinsta.com/blog/wordpress-block-bindings-api/); [Make Core tag](https://make.wordpress.org/core/tag/block-bindings/)
- In WP 7.0 (dev note 16 Mar 2026), any attribute that supports Block Bindings also supports Pattern Overrides. Custom blocks opt in with the `block_bindings_supported_attributes` filter. — [Make Core](https://make.wordpress.org/core/2026/03/16/pattern-overrides-in-wp-7-0-support-for-custom-blocks/)
- WP 7.0 also introduced PHP-only block registration and "major updates" to Block Bindings. — [ACF blog on WP 7.0](https://www.advancedcustomfields.com/?p=760506)
- ACF Blocks `usePostMeta: true` (ACF 6.3+) stores block values in post meta instead of the block comment, but the block can appear only once per page, only at top level, and not in widgets or the site editor. — [ACF docs](https://www.advancedcustomfields.com/?p=502546)
- Ollie theme docs say custom binding sources (such as ACF) still needed bindings written by hand in the code editor. — [Ollie](https://olliewp.com/?p=62009)

### Inferences
- The hybrid gives clients canvas editing of fixed-layout pages built from locked patterns, with content stored in meta. Repeating items and show/hide sections don't map cleanly to string-only bindings, so it isn't yet "the best of both".
- Plain ACF Blocks (values in block comments) are really the block-editor standard with PHP rendering, not structured meta.

### Gaps
- I didn't confirm the full 7.0/7.1 binding type support (arrays or objects?) from a primary dev note.

## 7. Ease of adding pages and layouts

### Takeaway
Field plugins reduce "add a page" to defining a field group plus a template. ACF/SCF Flexible Content lets one schema hold many layouts, and local JSON or PHP keeps definitions in code. Custom `register_post_meta` needs registration, schema, admin UI, translation config and SEO bridging done by hand for every field.

### Cited Findings
- ACF/SCF Flexible Content, Repeater and Clone are available in ACF PRO (paid) and in SCF (free). Flexible Content REST writes need `acf_fc_layout` per row. — [eseospace](https://eseospace.com/blog/wordpress-custom-fields-acf-scf/); [SCF listing](https://wordpress.org/plugins/secure-custom-fields/); [ACF REST docs](https://www.advancedcustomfields.com/resources/wp-rest-api-integration/)
- SCF added WP-CLI `scf json` commands (Apr 2026) for managing field-group JSON. — [SCF listing](https://wordpress.org/plugins/secure-custom-fields/)
- WPML reads translation preferences from PHP or JSON field definitions after a sync in ACF → Tools. — [WPML ACF docs](https://wpml.org/documentation/related-projects/translate-sites-built-with-acf/)

### Inferences
- The ClubHouse "five places to add a page" problem is typical of hand-rolled schemas. A single declarative schema file (ACF JSON, or a custom registry that generates meta registration, REST schema, admin form and WPML config) is the fix. A framework does this; custom code has to be built and maintained for 10 years.

### Gaps
- I found no measured comparison of developer time to add a page across ACF, Meta Box and a custom approach.
