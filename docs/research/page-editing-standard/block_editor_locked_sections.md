# Block editor as a long-term page standard: server-rendered section blocks, locked layouts, content-only client editing

Research date: 18 November 2026. Current WordPress: 7.1.x (7.1 shipped August 2026); 7.2 due 8 December 2026. Dates are given on older items.

## 1. Locking: templateLock, contentOnly, Block Locking API, write mode / zoom out

### Takeaway
Content-only editing is real and getting stronger. In 7.0 (May 2026) it became the default for patterns and template parts. But it is still a soft guardrail. Users can step out of it ("Modify", "Edit pattern", "Edit original", detach) unless you shut those doors in code. Adding, removing and reordering repeating child items inside contentOnly works only for blocks that declare content roles, and that path had bugs fixed as late as April 2026. Show/hide now exists as core block visibility (6.9 and 7.0).

### Cited Findings
- Block Locking API: users can lock blocks against moving or removal. "By default, users with editing access can unlock these blocks." Administrators can lock and unlock by default. `canLockBlocks` in the `block_editor_settings_all` filter controls who gets the lock UI, for example `current_user_can( 'edit_theme_options' )` or false on pages — [Gutenberg docs: block-locking.md](https://github.com/WordPress/gutenberg/blob/trunk/docs/how-to-guides/curating-the-editor-experience/block-locking.md)
- `templateLock: "contentOnly"` (since 6.1) hides design tools and hides non-content child blocks (containers, spacers, columns) from List View. "Additional child blocks cannot be inserted." "There is no UI in place to manage content locking and it must be managed at the code level." — [Gutenberg docs: block-locking.md](https://github.com/WordPress/gutenberg/blob/trunk/docs/how-to-guides/curating-the-editor-experience/block-locking.md)
- Escape hatch: a "Modify" toolbar link lets a user toggle design tools back on, and the docs say "it's not possibl[e] to programmatically remove this option" (docs wording; may be out of date given the 7.0 changes below) — [Gutenberg docs: block-locking.md](https://github.com/WordPress/gutenberg/blob/trunk/docs/how-to-guides/curating-the-editor-experience/block-locking.md)
- InnerBlocks README: `contentOnly` blocks all structural operations and child blocks cannot override it. `insert` blocks inserting or removing but still allows moving — [InnerBlocks README](https://github.com/WordPress/gutenberg/blob/trunk/packages/block-editor/src/components/inner-blocks/README.md)
- Individual block locking overrides template locking, except when `templateLock="contentOnly"` is used — [WordPress VIP blog](https://wpvip.com/blog/gutenberg-theme-json-block-locking-apis-wordpress/)
- 7.0 Pattern Editing dev note (15 March 2026): unsynced patterns and template parts now open in contentOnly by default. Unsynced patterns are entered via "Edit pattern" or a double-click ("spotlight mode with full editing capability"). Synced patterns and template parts are entered via "Edit original", and changes there apply globally — [Make Core: Pattern Editing in WordPress 7.0](https://make.wordpress.org/core/2026/03/15/pattern-editing-in-wordpress-7-0/)
- Same note: blocks with no content attributes are hidden from List View and cannot be selected inside a contentOnly container. Child blocks can be inserted when both parent and child have content roles (present since 6.9). Examples: List/List Item, Gallery/Image, Buttons/Button — [Make Core: Pattern Editing 7.0](https://make.wordpress.org/core/2026/03/15/pattern-editing-in-wordpress-7-0/)
- Content declaration: `"role": "content"` on each attribute in block.json (preferred), or `"supports": { "contentRole": true }`. New `"supports": { "listView": true }` adds a List View tab in the inspector "for rearranging and adding inner blocks", recommended for container blocks holding lists of children — [Make Core: Pattern Editing 7.0](https://make.wordpress.org/core/2026/03/15/pattern-editing-in-wordpress-7-0/)
- A commentator flagged that the dev note text and code disagree (`contentRole` vs `contentOnly` in the example). Verify the key name against the current block.json schema — [DEV Community review](https://dev.to/victorstackai/review-wordpress-70-block-editor-changes-for-pattern-editing-block-visibility-custom-css-1f6e)
- Opt-out: `disableContentOnlyForUnsyncedPatterns` (PHP via `block_editor_settings_all`, or JS). Template parts and synced patterns are unaffected. `"allowedBlocks": []` or "Manage allowed blocks" restricts insertion. Follow-ups are tracked in Gutenberg issues #73775 and #71517 — [Make Core: Pattern Editing 7.0](https://make.wordpress.org/core/2026/03/15/pattern-editing-in-wordpress-7-0/)
- Known bug class: with `templateLock: "contentOnly"` on a Group, "Add before/after" showed in the menu but did nothing. PR #77119 (merged 8 April 2026, Gutenberg 23.0) fixed insert/removal rules and added end-to-end tests for insert, duplicate and delete in content-only mode — [Gutenberg PR #77119](https://github.com/WordPress/gutenberg/pull/77119)
- Show/hide: 6.9 added `blockVisibility: false` (block not rendered at all). 7.0 added per-viewport rules stored at `attrs.metadata.blockVisibility.viewport` ({mobile, tablet, desktop}). Viewport-hidden blocks "are rendered in the DOM" and hidden by CSS. Supports key is `visibility`. Server code must handle the value as either a boolean or an object — [Make Core: Block Visibility in WordPress 7.0](https://make.wordpress.org/core/2026/03/15/block-visibility-in-wordpress-7-0/)
- Zoom out mode left experimental status in Gutenberg 19.3 (September 2024). Write/design editor modes were introduced in Gutenberg 19.4 and made a persistent preference in 19.5 (October 2024) — [Gutenberg 19.3 notes](https://make.wordpress.org/core/2024/09/25/whats-new-in-gutenberg-19-3-25-september/); [Gutenberg 19.5 notes](https://make.wordpress.org/core/2024/10/24/whats-new-in-gutenberg-19-5-23-october/)
- WordPress 6.8 Trac #63202 (March 2025): "Zoom out disabled for Pages" when show template is off. Reported upstream — [Trac #63202](https://core.trac.wordpress.org/ticket/63202)
- WordPress VIP ships a "Block Governance" plugin on top of core locking because core defaults are opt-out. It makes them opt-in, with granular control of design elements — [WordPress VIP: Block governance](https://wpvip.com/blog/block-governance/)

### Inferences
- For BlueWorx's model (custom section blocks whose attributes hold only content), contentOnly mainly matters for nested core blocks and InnerBlocks. A section block with no design controls in its `edit` is already effectively "content-only" whatever the lock state. The real risks are users inserting other blocks between sections, deleting or reordering sections, and switching to the Code Editor.
- Repeating items (cards, FAQs, team members) can work under contentOnly if each item is a child block with content roles plus `listView` support, or are simpler if held as an array attribute edited by the block's own UI. Core-guaranteed add/remove/reorder of children under contentOnly is recent (6.9 and 7.0) and was buggy into 2026.
- Fully stopping clients changing layout needs several layers: `canLockBlocks` false, `allowedBlocks` limits, `lock` on section blocks, possibly disabling the Code Editor (`codeEditingEnabled` setting) and restricting the inserter. Agencies and VIP add plugins for this, which suggests core alone is not airtight.

### Gaps
- Could not confirm whether the "Modify"/"Edit pattern" escape can now be removed per role in 7.0/7.1. The docs claim it cannot, but they may predate 7.0.
- No authoritative 2026 status for "write mode" (whether it shipped in core as a user-facing mode in 6.8+ and its current state). Only 2024 Gutenberg notes found.
- No official statement on whether block visibility controls show inside contentOnly patterns, or can be limited to particular blocks or roles beyond the `visibility` support flag.

## 2. Block Bindings API and Pattern Overrides

### Takeaway
Since 7.0 (May 2026), Pattern Overrides work with custom blocks via the `block_bindings_supported_attributes` filter. A synced pattern then gives one master layout that all instances share, with per-page content overrides. So yes, a single structural fix to the pattern reaches every page. Limits: there is still no editor UI to set up bindings, override fields cannot be optional, and repeating items (lists, InnerBlocks) inside a synced pattern are not overridable.

### Cited Findings
- 7.0 dev note (16 March 2026, Bernie Reiter): "you can use Pattern Overrides for any block you want — even custom blocks." Opt in via the server-side `block_bindings_supported_attributes` filter — [Make Core: Pattern Overrides in WP 7.0: Support for Custom Blocks](https://make.wordpress.org/core/2026/03/16/pattern-overrides-in-wp-7-0-support-for-custom-blocks/)
- Dynamic blocks: bound values are passed to `render_callback()`. Static blocks: the HTML API swaps values for `html`, `rich-text` and `attribute`-sourced attributes. Static blocks with unsourced attributes or complex selectors may need a `render_callback` or `render_block` filter — [Make Core dev note](https://make.wordpress.org/core/2026/03/16/pattern-overrides-in-wp-7-0-support-for-custom-blocks/)
- Comments on that note ask for optional override fields ("every exposed field currently feels required") and for overridable List blocks and InnerBlocks so users can add items inside a synced pattern. This implies repeaters are unsupported — [Make Core dev note comments](https://make.wordpress.org/core/2026/03/16/pattern-overrides-in-wp-7-0-support-for-custom-blocks/)
- Before 7.0, overrides were limited to four core blocks (Heading, Paragraph, Button, Image) — [Make Core: WordPress 7.0 Field Guide](https://make.wordpress.org/core/2026/05/14/wordpress-7-0-field-guide/); [learnwptheme.dev](https://www.learnwptheme.dev/building-with-synced-patterns-and-pattern-overrides/)
- Field Guide (14 May 2026): Block Bindings iterations include filtering attribute sources by format. No separate dev note — [WordPress 7.0 Field Guide](https://make.wordpress.org/core/2026/05/14/wordpress-7-0-field-guide/)
- Block Bindings were introduced in 6.5 and extended in 6.6, where Pattern Overrides arrived. Custom sources use `register_block_bindings_source()` with a `get_value_callback`. In synced patterns, bound attributes use `"__default"` with the `core/pattern-overrides` source. "The editor has no UI for these features yet", so bindings are written by hand in the Code Editor — [10up Gutenberg Best Practices: Block Bindings API](https://gutenberg.10up.com/reference/Patterns/block-bindings-api/)
- 10up: bound blocks "are not optional, and we cannot display them conditionally". Empty values can leave empty tags or orphaned labels — [10up Block Bindings](https://gutenberg.10up.com/reference/Patterns/block-bindings-api/)
- Editing a synced pattern via "Edit original" applies changes globally — [Make Core: Pattern Editing 7.0](https://make.wordpress.org/core/2026/03/15/pattern-editing-in-wordpress-7-0/)
- Third-party coverage of 7.1 reports binding sources for ACF and Meta Box integrated by default. Not confirmed in the official 7.1 Field Guide, which did not list bindings — [search summary of DevriX/others](https://devrix.com/wordpress-7-1/); [WordPress 7.1 Field Guide](https://make.wordpress.org/core/2026/08/05/wordpress-7-1-field-guide/)

### Inferences
- For BlueWorx's server-rendered blocks, plain render.php already makes any markup or CSS fix reach every page, without synced patterns. Synced patterns plus overrides would add one more thing: changes to which sections a page has, or their order, could also be propagated. That only suits genuinely shared page types (e.g. all location pages identical).
- Pattern Overrides are a poor fit for sections with repeaters or optional sections, which are key BlueWorx needs (repeating items, show/hide). Unsynced whole-page patterns used as starters, plus server-rendered blocks, fit the requirements better today.
- Overrides store values in the instance's `content` attribute keyed by block metadata name. That is one more JSON shape for Claude/MCP edits to understand (inference from the binding model; not verified in a primary doc).

### Gaps
- No primary source found on how override values behave when a block is renamed or removed from the master synced pattern (orphaned overrides).
- No 2026 maturity or adoption data (bug counts, agency case studies) for custom-block pattern overrides.

## 3. Server-rendered (dynamic) blocks vs saved-markup blocks

### Takeaway
Official guidance confirms the BlueWorx approach (save returns null, render.php) avoids block validation errors entirely and pushes markup fixes to every page instantly. Saved-markup blocks need deprecations every time their markup changes. The maintenance burden left is attribute-schema changes, which need migration in PHP or a data rewrite.

### Cited Findings
- Static blocks "produce front-end output that is fixed and stored in the database upon saving". Markup changes "could trigger validation errors in the Block Editor" — [Block Editor Handbook: Static or dynamic rendering](https://developer.wordpress.org/block-editor/getting-started/fundamentals/static-dynamic-rendering/)
- When `save` returns null the editor skips validation, "avoiding issues with frequently changing markup". Structural updates in a dynamic block are "applied immediately on all occurrences of that block across the site" — [Block Editor Handbook](https://developer.wordpress.org/block-editor/getting-started/fundamentals/static-dynamic-rendering/)
- A dynamic block may also save fallback HTML, which "will be rendered if your block is deactivated" — [Block Editor Handbook](https://developer.wordpress.org/block-editor/getting-started/fundamentals/static-dynamic-rendering/)
- 7.0 added PHP-only block registration: blocks with `autoRegister` and a render callback are exposed to the editor, with DataForm inspector controls generated automatically (no JS edit component) — [Make Core: PHP-only block registration (3 Mar 2026)](https://make.wordpress.org/core/2026/03/03/php-only-block-registration/) (summarised via [7.0 Field Guide](https://make.wordpress.org/core/2026/05/14/wordpress-7-0-field-guide/))
- 7.2 roadmap moves the core Table of Contents block to server-side dynamic rendering, a sign core itself prefers dynamic rendering for structured output — [Make Core: Roadmap to 7.2 (18 Sep 2026)](https://make.wordpress.org/core/2026/09/18/roadmap-to-7-2/)
- An open Gutenberg proposal (June 2026, PR #79115) adds `innerContent` support for static inner blocks, treating them as locked with `templateLock: 'all'` — [Gutenberg PR #79115](https://github.com/WordPress/gutenberg/pull/79115)

### Inferences
- Over 10+ years, server-rendered blocks with content-only attributes are the lowest-risk block type. The stored data is just a block name plus JSON, so it would survive even a big editor rewrite, and rendering is plain PHP under BlueWorx's control.
- Remaining long-term costs: the JS `edit` UIs (exposed to React upgrades, see section 5) and attribute schema migrations (renaming or restructuring attributes needs either `deprecated` entries with `migrate`, or a PHP migration of post_content).
- PHP-only blocks (7.0) could shrink or remove the JS edit layer for simple sections. That answers part of "why a visual editor at all": the editor becomes a generated form, while the canvas still shows a preview.

### Gaps
- Not checked: whether `deprecated`/`migrate` handles attribute changes for dynamic blocks the same way in 7.x, and whether PHP-only blocks support repeaters (array of objects) in their DataForm controls.

## 4. Editing block content via REST / MCP

### Takeaway
There is no official "edit a block by ID" REST endpoint. The REST API reads and writes `post_content` as one serialized string (`context=edit` returns raw block markup). Safe programmatic editing means parse, change attributes, then re-serialize. For dynamic blocks whose content lives entirely in the comment JSON this is reliable. For static blocks it is risky because attribute values also live in HTML. Third-party block-aware MCP tools exist because raw-HTML rewrites break block markup.

### Cited Findings
- `parse_blocks()` turns post_content into block arrays. `serialize_blocks()` / `traverse_and_serialize_blocks()` turn them back into a string — [developer.wordpress.org: serialize_blocks](https://developer.wordpress.org/reference/functions/serialize_blocks/)
- The documented pattern (a user-contributed note) is parse, modify, `serialize_blocks()`, `wp_update_post()`, all in PHP. Raw content is available via REST with `?context=edit` and written back via POST `/wp/v2/posts/{id}` — [serialize_blocks reference](https://developer.wordpress.org/reference/functions/serialize_blocks/); [Divi REST doc (third-party)](https://16wells.github.io/divi-docs/api/rest-api)
- Trac #60918 (April 2024): `parse_blocks` stopped returning sourced `content`/`text` in attrs in 6.5. Sourced attributes live in the HTML, not the comment JSON — [wp-trac list: #60918](https://lists.wordpress.org/pipermail/wp-trac/2024-April/517795.html)
- Vendor claim (GravityKit, maker of Block MCP): most WordPress MCP servers wrap wp/v2 and treat a post as one HTML blob, so agent rewrites can strip block delimiters and every block gets flagged invalid. Their tool exposes a block tree, all-or-nothing batch edits (up to 50 changes per revision), wp_kses and depth caps, and can register its operations as WordPress Abilities for the official MCP Adapter (needs WP 6.9+) — [GravityKit: Introducing Block MCP](https://www.gravitykit.com/introducing-block-mcp/); [Block MCP changelog](https://www.gravitykit.com/products/block-mcp/changelog/)
- The official WordPress MCP Adapter bridges the Abilities API to MCP. Block-safety depends on which abilities are registered; it is not block-aware by itself — [MCP Adapter (glama listing of WordPress/mcp-adapter)](https://glama.ai/mcp/servers/WordPress/mcp-adapter)
- 7.0 added a client-side Abilities API. Server-side abilities can be fetched via REST — [Make Core: Client-Side Abilities API in WordPress 7.0](https://make.wordpress.org/core/2026/03/24/client-side-abilities-api-in-wordpress-7-0/)
- 7.2 roadmap includes a "Standard MCP Adapter distribution", updated to the latest MCP spec and published in the Plugin Directory, "without a guarantee of landing in 7.2" — [Make Core: Roadmap to 7.2](https://make.wordpress.org/core/2026/09/18/roadmap-to-7-2/)
- Block visibility data can be a boolean or an object, so server-side code that generates or parses block markup must handle both — [Make Core: Block Visibility 7.0](https://make.wordpress.org/core/2026/03/15/block-visibility-in-wordpress-7-0/)

### Inferences
- BlueWorx's blocks (save null, all content in attributes) are close to ideal for Claude editing. Every editable value sits in the comment JSON, so parse, edit attrs, serialize round-trips with no HTML to keep in sync and no validation step to fail.
- The safest design is a BlueWorx ability or REST route that edits one section's attributes by block name and index, checks them against block.json, and re-serializes server-side. Claude should not send whole post_content strings. Nested core blocks (paragraph, image) inside sections bring back HTML-sourced attributes and validation risk.
- Server-side re-serialization does not run the JS validator, so "valid" can only be checked by opening the editor or by a headless check. A test harness (e.g. Playwright opening each edited page in the editor) would be needed for full assurance.

### Gaps
- No official WordPress guidance found on agents or REST clients editing block markup safely, or on a block-level REST endpoint. The official MCP Adapter's content abilities in its late-2026 state were not verified.

## 5. Roadmap and longevity (phases 3/4, 7.0–7.2, React 19, data format)

### Takeaway
Phase 3 (collaboration) is partly shipped: Notes/block comments and visual revisions are in 7.0. Real-time co-editing was pulled from 7.0, not enabled in 7.1, and is intentionally off the 7.2 roadmap. React 19 was shipped then reverted in Gutenberg in June 2026, punted past 7.1, and is "unlikely to fully land" in 7.2. No sources found signal a change to the block comment/JSON storage format. The editor is now always iframed (7.1).

### Cited Findings
- 7.0 slipped from its 9 April 2026 target to give more time for real-time collaboration testing. Trunk was closed and a new schedule promised by 22 April — [Make Core: The Path Forward for WordPress 7.0 (2 Apr 2026)](https://make.wordpress.org/core/2026/04/02/the-path-forward-for-wordpress-7-0/)
- Real-time collaboration was pulled from 7.0 on 8 May 2026. Matt Mullenweg cited race conditions, server load and recurring bugs. 7.0 "Armstrong" shipped 20 May 2026 with Notes instead — [Search Engine Journal](https://www.searchenginejournal.com/wordpress-7-0-will-ship-without-real-time-collaboration/574330/); [DreamHost](https://www.dreamhost.com/blog/wordpress-7-0/) (secondary sources)
- 7.1 Field Guide (5 Aug 2026): real-time collaborative editing was tested but "is not enabled in the final release". 7.1 "completes the move to an iframe-based post editor" — [WordPress 7.1 Field Guide](https://make.wordpress.org/core/2026/08/05/wordpress-7-1-field-guide/)
- 7.2 (roadmap 18 Sep 2026): "Collaborative editing is intentionally not on the roadmap for 7.2". Items include Notes suggestion mode, polish of visual revisions (from 7.0), expanded block supports, responsive style states, and React 19 ("unlikely to fully land for WordPress 7.2") — [Make Core: Roadmap to 7.2](https://make.wordpress.org/core/2026/09/18/roadmap-to-7-2/)
- 7.2 schedule: release 8 December 2026, RC2 24 November — [Make Core: WordPress 7.2](https://make.wordpress.org/core/7-2/). One third-party summary says suggestions in Notes and the TOC block dropped out of 7.2 (unverified) — [magicwp.io](https://magicwp.io/blog/wordpress-7-2-roadmap)
- React 19: announced 27 May 2026 for 7.1 via Gutenberg 23.3. Reverted in 23.3.2 after many React-18 plugins crashed — [Make Core: React 19 Upgrade in WordPress](https://make.wordpress.org/core/2026/05/27/react-19-upgrade-in-wordpress/); [Make Core: React 19 temporarily reverted](https://make.wordpress.org/core/2026/06/05/react-19-upgrade-temporarily-reverted-in-gutenberg/)
- React 19 punted beyond 7.1 (24 Jul 2026). Causes: plugins bundling their own `react/jsx-runtime`, and removed legacy APIs (string refs, defaultProps on function components, legacy context). "If everyone was bundling their JavaScript correctly, the majority of compat issues wouldn't happen at all." Opt-in experiment from Gutenberg 23.4 — [Make Core: React 19 punted beyond 7.1](https://make.wordpress.org/core/2026/07/24/react-19-punted-beyond-wordpress-7-1-experiment-in-gutenberg/)
- 7.0 visual revisions: compare two revisions with a slider, plus a document inspector change summary — [WordPress 7.0 Field Guide](https://make.wordpress.org/core/2026/05/14/wordpress-7-0-field-guide/)
- 7.1 headline editor features (third-party): responsive per-device block styles with theme.json breakpoints, button hover/focus/active states, Tabs and Playlist blocks — [DevriX](https://devrix.com/wordpress-7-1/); official: [Responsive block styles and configurable viewports in 7.1](https://make.wordpress.org/core/2026/08/05/responsive-block-styles-and-configurable-viewports-in-wordpress-7-1/)

### Inferences
- The stored format (HTML comments with JSON attributes) has been stable since 5.0 (2018). Even real-time collaboration, which reworked the data layer, was designed around the editor state, not a new post_content format. No source proposes replacing it. For server-rendered blocks the data is just name plus attributes, which is the most portable form.
- Main longevity risk is the JS layer: each React and iframe transition breaks plugins that bundle React or touch the global `document`. BlueWorx edit components built with @wordpress/scripts (externalized React) and apiVersion 3 are on the supported path.
- Phase 4 (multilingual) did not appear in any 2026 roadmap post found.

### Gaps
- Not found: any official 2026 statement on phase 4 timing or the real-time collaboration storage design (the Trac tickets linked from the 7.0 post were not read).
- No official target release for React 19 as of these sources (latest: September 2026).

## 6. Design fidelity: does the editor constrain front-end markup/CSS? Editor vs front-end preview

### Takeaway
For dynamic blocks the editor puts no limits on front-end markup or CSS: render.php outputs whatever HTML you want. The limits are on the editing preview. The editor canvas is an iframe (always, from 7.1). Your edit component must either rebuild the markup in React (two copies to keep in sync) or use ServerSideRender, which WordPress itself calls a legacy fallback.

### Cited Findings
- Dynamic rendering via `render_callback` or render.php builds output on the server at request time — [Block Editor Handbook: Static or dynamic rendering](https://developer.wordpress.org/block-editor/getting-started/fundamentals/static-dynamic-rendering/)
- ServerSideRender "should be regarded as a fallback or legacy mechanism" and "is not appropriate for developing new features against". The recommended path is client-side rendering with REST data. `useServerSideRender` debounces requests and uses POST for large attribute payloads — [Block Editor Handbook: @wordpress/server-side-render](https://developer.wordpress.org/block-editor/reference-guides/packages/packages-server-side-render/)
- 7.0: the iframe was used only if every inserted block was apiVersion 3+; otherwise it was dropped — [Make Core: Iframed Editor Changes in 7.0 (24 Feb 2026)](https://make.wordpress.org/core/2026/02/24/iframed-editor-changes-in-wordpress-7-0/)
- 7.1: the post editor "is always iframed, regardless of the theme type, the block API versions of the registered blocks, or the block API versions of the blocks in the content". Code using global `document`/`window` to reach the canvas targets the wrong document; use `ownerDocument`/`defaultView` and `useRefEffect` — [Make Core: Iframed Editor Changes in 7.1 (3 Aug 2026)](https://make.wordpress.org/core/2026/08/03/iframed-editor-changes-in-wordpress-7-1/)
- Viewport block visibility hides via CSS while still rendering in the DOM, which affects front-end markup if clients use it — [Make Core: Block Visibility 7.0](https://make.wordpress.org/core/2026/03/15/block-visibility-in-wordpress-7-0/)

### Inferences
- An always-iframed editor actually helps fidelity. Theme CSS and CSS custom properties loaded through `enqueue_block_assets`/editor styles apply inside an isolated document, and viewport-width media queries respond to the canvas width. (Asset-loading specifics were not confirmed in the 7.1 note.)
- The fidelity gap is in the edit components, not the front end. Either duplicate render.php in JSX (drift risk across 15+ blocks), or use ServerSideRender or a PHP-only/DataForm approach (exact markup, but a flash or delay and inline editing awkward). This is the real cost behind "why have a visual editor at all": the canvas is a preview, and keeping it faithful is extra work.
- Design tokens in the theme as CSS custom properties work with both. Keeping theme.json palettes and font sizes empty or disabled stops clients picking tokens in the UI, but those settings were not researched here.

### Gaps
- Did not retrieve the "Technical considerations for the iframe editor" page for how stylesheets are loaded into the iframe in 7.1.
- No agency engineering post (10up, Human Made, XWP, WebDevStudios) found in this pass that measures editor-vs-front-end drift for server-rendered blocks.
