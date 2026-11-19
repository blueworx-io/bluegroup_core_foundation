# Cross-cutting criteria for a 10+ year page-editing standard (A: locked server-rendered blocks, B: fields + PHP templates, C: structured JSON/files edited by AI via MCP, D: page builders / Elementor)

Research date: 18 November 2026. Dates given on every source where known; anything older than 2025 is labelled.

## 1. Design-system enforcement: tokens only in the theme, no per-page overrides, Figma-to-code checks

### Takeaway
The block editor (A) has the strongest built-in, core-supported way to switch off per-page styling (theme.json flags set to false, plus contentOnly editing that WordPress 7.0 now applies to patterns by default). Fields + templates (B) and files/JSON (C) enforce tokens by simply never exposing style controls. Elementor (D) now has classes and variables in V4 but still exposes per-element styling to anyone with editor access. Figma-to-code token sync is solvable but the Figma Variables REST API needs an Enterprise plan; plugin-based export (Tokens Studio, VIP's bridge) avoids that.

### Cited Findings
- WordPress VIP's locked-down theme.json preset (Dec 2022) sets to false: border color/radius/style/width; color text/background/link/custom/defaultPalette/defaultGradients/defaultDuotone/customGradient/customDuotone; spacing margin/padding; typography customFontSize/fontStyle/fontWeight/letterSpacing/lineHeight/textDecoration/textTransform/dropCap; and empties fontFamilies/fontSizes, so only design-system values remain. It describes this as an effort to "lock down the block editor settings globally." — [WordPress VIP, Using a Design System with the Block Editor: theme.json (15 Dec 2022)](https://develop2.wpvip.com/blog/using-a-design-system-with-the-wordpress-block-editor-pt-1-theme-json/)
- VIP recommends keeping design tokens in theme.json `settings.custom`, which WordPress outputs as CSS custom properties `var(--wp--custom--<path>)` usable in theme CSS too; VIP's open-source vip-design-system-bridge inserts/updates tokens from Figma into that section. — [WordPress VIP (Dec 2022)](https://develop2.wpvip.com/blog/using-a-design-system-with-the-wordpress-block-editor-pt-1-theme-json/); [vip-design-system-bridge listing](https://awesome.ecosyste.ms/projects/github.com%2Fautomattic%2Fvip-design-system-bridge)
- VIP (March 2022): setting a theme.json option to false hides that feature from content creators; recommends starting from "everything disabled" and opting in; combine block locking with theme.json to protect patterns such as a CTA. — [WordPress VIP, Gutenberg guardrails (31 Mar 2022)](https://wpvip.com/blog/gutenberg-theme-json-block-locking-apis-wordpress/)
- Block Locking API can stop users moving, removing or editing blocks; template locking and block locking combine; individual block locking overrides template locking unless `templateLock="contentOnly"`; administrators can lock/unlock by default. — [WordPress Developer Handbook, Curating the editor experience](https://developer.wordpress.org/block-editor/how-to-guides/curating-the-editor-experience/); [Block Locking API](https://developer.wordpress.org/block-editor/how-to-guides/curating-the-editor-experience/block-locking/)
- WordPress 7.0 (2026): unsynced patterns and template parts now insert in contentOnly mode by default (text and media editing, structure/style controls hidden). Block authors mark editable attributes with `"role": "content"` in block.json; `allowedBlocks: []` restricts insertion; admins can opt out with `disableContentOnlyForUnsyncedPatterns`. Limitation: blocks with no content-role attributes can't be selected inside a contentOnly container; plugins assuming full block access may break. — [Make WordPress Core, Pattern Editing in WordPress 7.0 (15 Mar 2026, updated 28 Mar 2026)](https://make.wordpress.org/core/2026/03/15/pattern-editing-in-wordpress-7-0/); [Call for testing (27 Feb 2026)](https://make.wordpress.org/test/2026/02/27/call-for-testing-pattern-editing-and-content-only-interactivity-in-wordpress-7-0/)
- WebDevStudios (Nov 2025): theme.json lets architects "define an entire design system in a single, version-controlled JSON file" and "limit design choices to only approved brand colors and font sizes." — [WebDevStudios, A developer's guide to the future of the block editor (25 Nov 2025)](https://webdevstudios.com/2025/11/25/a-developers-guide-the-future-of-the-wordpress-gutenberg-block-editor/)
- Elementor V4 (Atomic Editor) adds Classes, Variables and Components for consistency; Classes and Variables work only with Atomic elements; 4.0 can sync V4 colour variables and typography classes to V3 Global Colors/Fonts; Classes/Variables can be exported/imported with sites or templates. — [Elementor V4 FAQ (31 Mar 2026, updated 23 Aug 2026)](https://elementor.com/products/website-builder/v4-faq/)
- Figma Variables REST API (GET and POST) requires a Full seat in an Enterprise org; guests cannot use it; scopes `file_variables:read` / `file_variables:write`; API-written variables must be published before other files see them; Figma positions it for CI and syncing a design system source of truth. — [Figma developer docs, Variables REST API](https://developers.figma.com/docs/rest-api/variables/)
- Non-Enterprise routes: Tokens Studio exports token JSON that Style Dictionary (v4, now maintained by the Tokens Studio team) compiles to CSS; a Figma plugin exists that writes variables straight to theme.json; no official end-to-end Style Dictionary→theme.json format was found. — [dev.to, Figma variables to CSS with Style Dictionary](https://dev.to/alexandersstudi/export-figma-variables-to-css-custom-properties-using-style-dictionary-3pjh); [figma-variables-to-style-dictionary (npm)](https://npmjs.com/package/figma-variables-to-style-dictionary); [Tokens Studio](https://www.tokens.studio)
- stylelint-declaration-strict-value (rule `scale-unlimited/declaration-strict-value`) forces chosen properties (e.g. color, fill, stroke, background, border-color) to use variables/functions instead of raw values, with ignore lists for keywords like `transparent`/`currentColor`. — [npm: stylelint-declaration-strict-value](https://npmjs.com/package/stylelint-declaration-strict-value)
- Precedents for token-only lint rules at scale: Mozilla's `use-design-tokens` stylelint rule and Shopify Polaris' stylelint-polaris rules flag non-token values. — [Mozilla source docs](https://firefox-source-docs.mozilla.org/code-quality/lint/linters/stylelint-plugin-mozilla/rules/use-design-tokens/color.html); [Polaris stylelint rules](https://polaris.shopify.com/tools/stylelint-polaris/rules)

### Inferences
- A, B and C can all achieve "tokens only in the theme" because the editor never exposes style controls; A does it with core flags, B and C by construction. Lint (stylelint strict-value) only checks theme code, so it works equally for A/B/C; for D, styles live in the database per element, so file-based lint cannot see most of them.
- Elementor V4 classes/variables improve consistency but do not remove per-element styling from editors; locking it down relies on Elementor role settings rather than a code-reviewed file.
- Token drift check (Figma vs code) is independent of the editing approach; the Enterprise requirement on Figma's REST API is the main cost decision. The Figma MCP `get_variable_defs` tool may be an alternative read path (not verified here).

### Gaps
- No source found documenting Elementor V4 permission controls that stop clients changing per-element styles while still editing text.
- No official Style Dictionary format for theme.json found; would need a custom formatter.

## 2. Performance and accessibility: dynamic blocks vs PHP templates vs page builders

### Takeaway
Field-level evidence says page builders cost performance; there is no rigorous public study isolating dynamic blocks vs PHP templates (both render server-side, so they should be equivalent in output). WordPress as a whole lags other CMSs on Core Web Vitals (45% good on mobile, 2025). Accessibility testing ranks core WordPress output (91%) above Elementor (75.6%) and well above Divi (36%).

### Cited Findings
- HTTP Archive Web Almanac 2025 CMS chapter: WordPress powers ~64% of CMS sites; mobile CWV "good" 45% (up ~4 pts), LCP good 53%, CLS ~84%; median Lighthouse performance 63 desktop / 41 mobile; mobile median page weight 2,894 KB, JS 638 KB, CSS 119 KB. Comparison: Duda 85% CWV good, TYPO3 79%, Wix 74%. — [Web Almanac 2025, CMS chapter](https://almanac.httparchive.org/en/2025/cms)
- Same chapter: ~60% of WordPress sites use a page builder; share of builder usage: Elementor 43% (down from ~56% in 2024), Block Editor 18% (growing), WPBakery 13% (from ~21%), Divi 10% (from ~14%). Builders "often produce more complex DOM structures and larger CSS and JavaScript bundles" and a performance gap remains vs tightly controlled builds; no per-builder CWV numbers given. — [Web Almanac 2025, CMS](https://almanac.httparchive.org/en/2025/cms)
- WordPress core added up to 35% faster template loading in block-heavy setups (per Web Almanac 2025). — [Web Almanac 2025, CMS](https://almanac.httparchive.org/en/2025/cms)
- Elementor's own blog states a typical Elementor (V3) page generates 2–3x as many DOM nodes as a native Gutenberg page. — [Elementor blog, Elementor vs Gutenberg](https://elementor.com/blog/elementor-vs-g/)
- Elementor claims V4 atomic elements use plain HTML tags without extra wrappers, giving "improved Core Web Vitals"; no DOM or CSS figures published; gains may vary when V3 widgets are mixed in. — [Elementor V4 FAQ (2026)](https://elementor.com/products/website-builder/v4-faq/)
- Blog benchmarks (unverified methodology): Elementor page 2.5 MB/48 requests vs Gutenberg 905 KB/19; another 512 KB/54 vs 331 KB/34; one homepage 356 divs vs 77. Treat as indicative only. — [ProfileTree](https://profiletree.com/elementor-vs-gutenberg-vs-divi/); [Hostragons](https://www.hostragons.com/en/blog/elementor-vs-gutenberg-which-page-builder-slows-wordpress-more/)
- WebDevStudios (Nov 2025): page builders introduce "heavier code, excessive CSS calls, and increased latency"; lighter native blocks help LCP, CLS and accessibility. — [WebDevStudios (25 Nov 2025)](https://webdevstudios.com/2025/11/25/a-developers-guide-the-future-of-the-wordpress-gutenberg-block-editor/)
- WebAIM Million 2026 (Feb 2026 crawl): 56.1 errors per home page average (51 in 2025); 95.9% of pages had detectable WCAG failures; WordPress pages 52.8 errors (−5.8% vs average) across 252,302 sites. No builder breakdown. — [WebAIM Million 2026](https://webaim.org/projects/million/)
- Equalize Digital page-builder accessibility comparison (tested Jun–Aug 2025, 19 builders, automated + manual keyboard and screen reader testing): WordPress core baseline 91.23%; Kadence 100%; GenerateBlocks 81.66%; Elementor 75.55% (rank 4); Beaver Builder 68.47%; Bricks 63.57%; Spectra 63.01%; Divi 36.24% (rank 17). Builders "can undo theme accessibility" (e.g. Brizy/SeedProd overriding skip links). — [Equalize Digital (19 Aug 2025)](https://equalizedigital.com/wordpress-page-builder-accessibility/)

### Inferences
- A (server-rendered dynamic blocks) and B (PHP templates) produce the same kind of output: HTML written by the agency. Performance and accessibility then depend on the agency's markup, not the editing approach. C is the same if rendered by PHP.
- A adds some block-editor CSS (block library styles) on the front end unless dequeued; B/C need not. Small difference, not decisive.
- D carries a measurable structural penalty in V3; V4 claims to close it but has no independent data yet.

### Gaps
- No independent 2025–2026 study comparing CWV of dynamic blocks vs PHP templates vs Elementor V4 on equal designs. The Web Almanac does not break CWV out by builder.
- Elementor V4 accessibility not yet independently tested (Equalize's 2025 round predates V4 default rollout in April 2026).

## 3. Migration and exit cost: which format is most portable

### Takeaway
Elementor content is the hardest to move: layout lives in builder-specific JSON in post meta, and pages break if the plugin is turned off. Block markup is HTML with comments in post content, so it stays readable without the plugin. Field data (ACF/Meta Box) sits in standard post meta and is easy to export, but is meaningless without the templates. Plain structured JSON/files is the most portable in principle.

### Cited Findings
- Elementor stores layouts as its own data rather than post content; deactivating it leaves shortcodes or empty markup; WordPress "Convert to Blocks" only handles Classic-editor content, not Elementor. — [NexterWP migration guide (2026)](https://nexterwp.com/blog/elementor-to-gutenberg/); [InstaWP](https://instawp.com/convert-elementor-to-gutenberg/)
- Block markup lives in post content as HTML comments; if a blocks plugin is disabled, content is still readable. — [NexterWP (2026)](https://nexterwp.com/blog/elementor-to-gutenberg/)
- Conversion plugins cover ~20 common Elementor widgets and are not pixel-perfect. — [Seahawk Media](https://seahawkmedia.com/wordpress/elementor-to-gutenberg-conversion/); [WordPress.org plugin](https://wordpress.org/plugins/?p=329116)
- Post-mortem (dev.to, posted 10 Apr, year not shown, likely 2025–2026): 114 items (94 posts, 20 pages) moved from Elementor to Gutenberg in one day by Claude Code over the REST API. Converting rendered HTML was more stable than parsing `_elementor_data` JSON. Problems: empty paragraphs became stacked spacer blocks (fix on 47 items), invalid-block errors (fix on 81 items), Pro widgets (slider, popup, form, social icons) lost. Author estimates 95% automated / 5% manual. No performance numbers. — [dev.to, Remove Elementor: 114 pages in one day](https://dev.to/rentierdigital/how-to-remove-elementor-from-wordpress-convert-114-pages-to-gutenberg-in-one-day-3iah)
- ACF and native custom fields use the same metadata system (wp_postmeta). — [ACF docs, via search summary](https://www.advancedcustomfields.com/?p=480423)
- Dependency risk for ACF: in Oct 2024 WordPress.org forked ACF as Secure Custom Fields and auto-switched free ACF users on .org updates; ACF Pro continues from WP Engine's own channel; trademark dispute noted. — [WordPress.org news (Oct 2024)](https://wordpress.org/news/2024/10/secure-custom-fields/); [TechCrunch (12 Oct 2024)](https://techcrunch.com/2024/10/12/in-latest-move-against-wp-engine-wordpress-takes-control-of-acf-plugin)
- WebDevStudios frames its goal as "moving our clients away from legacy page builders and custom fields" and says native blocks remove "proprietary code lock-in." — [WebDevStudios (Nov 2025)](https://webdevstudios.com/2025/11/25/a-developers-guide-the-future-of-the-wordpress-gutenberg-block-editor/)

### Inferences
- Portability ranking (most to least): C (plain JSON/files you own) ≈ A (HTML-in-content, readable without plugin; custom dynamic blocks without their plugin render nothing but attributes remain as JSON in the comment) > B (clean data in post meta, but layout lives only in templates; ACF adds a commercial-dependency risk, own field editor or Meta Box less so) > D (proprietary JSON, breaks on deactivation).
- For A, locked server-rendered blocks store attributes as JSON in the block comment, so a future migration is a structured-data transform, close to C.
- AI agents have already made Elementor exit cheap for simple sites (one day for 114 items), but Pro widgets and visual fidelity remain manual.

### Gaps
- No source quantified ACF-to-blocks migration effort, or a public agency post-mortem of switching from ACF/fields to blocks (or the reverse).
- Year of the dev.to post-mortem not confirmed.

## 4. What large agencies and enterprise platforms recommend (2024–2026)

### Takeaway
Every established WordPress agency with a public position (Human Made, WebDevStudios, 10up, Big Bite, VIP) is block-first for marketing pages, using custom blocks plus theme.json guardrails. None found recommending a page builder; ACF is mentioned as a legacy or data-modelling tool, not a page-layout standard.

### Cited Findings
- Human Made (31 Jul 2024): the Block Editor beats ACF and Elementor for enterprise because it is core (reliability, security, updates), usable by non-technical staff, supports reusable blocks for brand consistency, and is "central to WordPress's development roadmap"; ACF repeaters are "complex and time-consuming to set up"; Elementor "can produce bloated code and slower load times" and has a steeper learning curve. — [Human Made, Block Editor vs ACF & Elementor (31 Jul 2024)](https://humanmade.com/?p=28914)
- WebDevStudios (25 Nov 2025): "The future of WordPress development is already here, and it's block-first"; blocks are modular, testable React components; aims to move clients "away from legacy page builders and custom fields." — [WebDevStudios](https://webdevstudios.com/2025/11/25/a-developers-guide-the-future-of-the-wordpress-gutenberg-block-editor/)
- WebDevStudios (29 Jun 2026) published guidance on WordPress 7.0's Abilities API and MCP adapter for enterprise AI. — [WebDevStudios, Decoding WordPress 7.0 (29 Jun 2026)](https://webdevstudios.com/2026/06/29/decoding-wordpress-7-0-how-the-abilities-api-and-mcp-adapter-change-enterprise-ai/)
- 10up publishes its "10up Way" for the block editor and client editorial experience as public Gutenberg Best Practices (Reference, Training, Guides), plus a block-components library and wp-scaffold; it is block-editor centred. — [gutenberg.10up.com](https://gutenberg.10up.com/); [10up announcement (2022)](https://10up.com/blog/2022/10up-publicly-releases-its-gutenberg-best-practices/)
- Big Bite (UK WordPress VIP Gold partner) builds custom Gutenberg components (NewsPress) for News UK and other publishers. — [Search summary of Big Bite materials; see WordPress VIP webinar](https://wpvip.com/webinar-gutenberg-for-enterprises/)
- Rareview: no published position found; its GitHub shows a PHP-based scaffold for Blocks, Patterns, Block Styles and editor sidebars, and an archived block theme starter, i.e. block-based tooling. — [github.com/rareview](https://github.com/rareview)
- WordPress VIP: guardrails via theme.json and block locking (2022) and a Block Governance plugin for brand consistency. An archived 2021 VIP doc said ACF had not had a full line-by-line review for VIP use (dated). — [WordPress VIP (2022)](https://wpvip.com/blog/gutenberg-theme-json-block-locking-apis-wordpress/); [archived VIP ACF doc (2021)](https://webcf.waybackmachine.org/web/20211023041334/https://docs.wpvip.com/?p=308)
- WordPress 7.0 (2026) extends the Abilities API (added in 6.9) with a client-side package; the MCP Adapter is a separate plugin exposing registered abilities to MCP clients (version reported as 0.5.0 to 0.7.0 across sources). — [WordPress 7.0 Field Guide (14 May 2026)](https://make.wordpress.org/core/2026/05/14/wordpress-7-0-field-guide/); [jorijn.com on 7.0 abilities](https://jorijn.com/en/blog/wordpress-7-0-abilities-mcp-plugin-developers-learn-first/)

### Inferences
- Industry consensus for a 10-year horizon is A (custom, locked blocks + theme.json). B survives in agencies (e.g. ACF Blocks as a block-authoring method), but as a way to build blocks rather than a page model.
- Core's 2026 direction (contentOnly by default for patterns, block bindings, Abilities API/MCP) makes A and C converge: locked blocks with content-role attributes are effectively structured fields an agent can edit.

### Gaps
- No public 10up or Human Made document in 2025–2026 explicitly comparing fields-first vs block-first for marketing pages; Human Made's 2024 post is partly marketing.
- No public agency post-mortem of switching standards (beyond the small dev.to case) found.

## 5. Elementor's direction: credible standard or exit candidate?

### Takeaway
Elementor is modernising fast (V4 atomic editor default from April 2026, official MCP from 4.3 in Sept 2026), which narrows its performance and AI gaps. But MCP works fully only on V4 atomic layouts, legacy V3 layouts are still waiting, and content remains in proprietary data, so the lock-in and exit cost are unchanged.

### Cited Findings
- V4 is "an atomic, CSS-first, performance-optimized architecture"; new sites run V4 by default from April 2026; existing V3 layouts keep working alongside atomic elements; adoption is optional and can be disabled; Grid and Loop not yet atomic ("in development"); Atomic features called "stable, safe for production." — [Elementor V4 FAQ (updated 23 Aug 2026)](https://elementor.com/products/website-builder/v4-faq/)
- Elementor MCP (help article published 22 Sep 2026): Claude, Cursor, Codex can build pages with V4 atomic elements, apply global classes and variables, create components, build Theme Builder templates and popups, bind dynamic data, save drafts or publish. Requires Elementor 4.3.0+ and WordPress 6.8+; Pro adds forms, popups, loops, components, headers/footers; acts within the WordPress user's permissions; concurrent human/agent saves raise a conflict warning. — [Elementor Help Center, Build and edit your site using Elementor MCP (22 Sep 2026)](https://elementor.com/help/how-to-build-and-edit-your-site-using-elementor-mcp/)
- MCP works on existing sites "only if they were built with atomic elements and layouts (V4)"; editing V3 layouts via MCP listed on Elementor's roadmap for Q4 2026. (Third-party summary of Elementor FAQ/roadmap; verify.) — [The Plus Addons, Elementor 4.3 update](https://theplusaddons.com/blog/elementor-4-3-update/); [Elementor roadmap](https://elementor.com/fr/roadmap/)
- Elementor's share of WordPress page-builder usage fell from ~56% (2024) to 43% (2025) while Block Editor rose to ~18%. — [Web Almanac 2025, CMS](https://almanac.httparchive.org/en/2025/cms)
- Elementor ranked 4th of 19 for out-of-the-box accessibility (75.55%), below core WordPress (91.23%). — [Equalize Digital (Aug 2025)](https://equalizedigital.com/wordpress-page-builder-accessibility/)

### Inferences
- For BlueWorx, existing Elementor sites are V3, so MCP editing of legacy sites depends on an unshipped roadmap item; moving to V4 is itself a rebuild of each page.
- Elementor's MCP is designed for building visually (agent places elements and styles), which conflicts with the "clients edit content only, designs match Figma exactly" requirement unless heavily restricted.
- Credible for continuing legacy sites; weak as a 10-year standard given proprietary storage, plugin dependency and falling share.

### Gaps
- No independent performance data for V4 atomic pages.
- Roadmap dates come mostly via third-party summaries; the Elementor roadmap page itself was not fetched in full.

## 6. Client-editing UX: visual in-place editing vs forms, and support burden

### Takeaway
No controlled study was found comparing visual vs form-based editing for non-technical clients. Evidence is anecdotal and split; the industry trend is hybrids (visual preview layered on structured data), which matches locked blocks with content-only editing.

### Cited Findings
- Optimizely forum (Sept 2024): one practitioner reports editors prefer the forms edit mode in "about 99%" of cases; expects new visual builder to blend both. Single anecdote. — [Optimizely World forum (2024)](https://inte.world.optimizely.com/forum/User-Forum/end-user/Thread-Container/2024/9/your-observation-how-often-do-editors-use-the-on-page-editing-vs--all-properties-editing-mode)
- Contentstack claims visual editors give a 60% reduction in IT support tickets for content changes; vendor marketing, no method shown. — [Contentstack](https://www.contentstack.com/blog/all-about/headless-cms-platforms-with-the-best-visual-editor-tools-for-marketers)
- Karen McGrane / Jeff Eaton ("WYSIWTF", older, c. 2013): when the editing interface mirrors the visual design, editors treat the page, not the content, as what they manage; argues for structured content. — [A List Apart, WYSIWTF](https://alistapart.com/column/wysiwtf/)
- Evolving Web on why CMS usability is hard (labels, field design matter). — [Evolving Web](https://evolvingweb.com/blog/content-editor-ux-why-cms-usability-tough)
- Human Made (2024) argues block drag-and-drop suits low-skill users, ACF needs more knowledge, Elementor has a steeper learning curve. — [Human Made (Jul 2024)](https://humanmade.com/?p=28914)
- WordPress handbook advises starting with minimal restrictions, adding more as needed, and testing with actual users. — [Curating the editor experience](https://developer.wordpress.org/block-editor/how-to-guides/curating-the-editor-experience/)

### Inferences
- With most edits done by Claude via MCP, client UX matters less than agent UX; what matters is that the client's occasional edit can't break the design. contentOnly blocks (in-place text editing, no layout/style controls) and simple forms both meet this.
- A gives in-place editing with guardrails; B gives forms (safer, less intuitive preview); C gives clients nothing directly unless a form layer is added, which raises support load for small client edits.

### Gaps
- No published support-ticket data comparing Elementor, block, and ACF client sites. BlueWorx's own Forge ticket history would be the best evidence.
- No usability study on WordPress 7.0 contentOnly editing with non-technical users.
