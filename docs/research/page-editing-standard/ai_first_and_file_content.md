# AI-agent-first editing (MCP) and content-as-files: "no visual editor" options for client pages

Research date: 18 November 2026. Dates are given for each source. Where a source is a vendor, it is marked as one.

## 1. WordPress Abilities API and the official MCP Adapter: what has shipped, where it stands in late 2026, and how agencies use it

### Takeaway
The plumbing is real and official, but still young. The Abilities API has been in core since 6.9 (Nov 2025). MCP itself is not in core: it comes from the MCP Adapter plugin, which is still pre-1.0 (0.7.1, Oct 2026) and broke its API more than once in 2026. Core content abilities are read-only in 7.2, due 8 Dec 2026. Write abilities (create, update and delete content, plus media) are only proposed for 7.3, and the proposal is undecided. For a 10-year standard, BlueWorx's own per-site MCP server, with its own abilities, stays necessary. Core only provides the base it builds on.

### Cited Findings
- The Abilities API shipped in WordPress 6.9 (announced 10 Nov 2025). The MCP Adapter was announced on 17 Jul 2025 as part of "AI Building Blocks for WordPress". It lets Claude Desktop, Claude Code, Cursor and VS Code discover and call abilities. Post dated 4 Feb 2026. — [WordPress Developer Blog](https://developer.wordpress.org/news/2026/02/from-abilities-to-ai-agents-introducing-the-wordpress-mcp-adapter/)
- The adapter's default server exposes three meta-tools: discover-abilities, get-ability-info and execute-ability. An ability is exposed only if it sets `meta.mcp.public`. Custom servers made with `create_server()` list their abilities explicitly. — [WordPress Developer Blog, Feb 2026](https://developer.wordpress.org/news/2026/02/from-abilities-to-ai-agents-introducing-the-wordpress-mcp-adapter/)
- Auth: remote sites use application passwords by default, through the `@automattic/mcp-wordpress-remote` proxy, and OAuth can be added as a custom option. WordPress.com uses OAuth 2.1. Self-hosted sites use JWT or application passwords. — [WordPress Developer Blog, Feb 2026](https://developer.wordpress.org/news/2026/02/from-abilities-to-ai-agents-introducing-the-wordpress-mcp-adapter/)
- Official security advice:
  - prefer read-only abilities on public endpoints
  - give each ability the minimum capability it needs
  - never use `__return_true` for destructive operations
  - use dedicated low-privilege users
  - log usage

  Source: [WordPress Developer Blog, Feb 2026](https://developer.wordpress.org/news/2026/02/from-abilities-to-ai-agents-introducing-the-wordpress-mcp-adapter/)
- Adapter release history, from GitHub:
  - 0.5.0 (15 Apr 2026): typed schema DTOs and fail-closed permissions.
  - 0.6.0 (12 Aug 2026): requires WP 6.9+, and the standalone Abilities API plugin path is dropped.
  - 0.7.0 (2 Oct 2026): MCP 2026-07-28 spec, elicitation, and the first WordPress.org directory release. It has breaking changes: DTOs, validator classes and a filter were removed, and bundling it as a Composer library is deprecated.
  - 0.7.1 (16 Oct 2026): a security fix to session storage, and a site-owner guide to application passwords.

  The releases page never calls the project stable and says nothing about a core merge. — [WordPress/mcp-adapter releases](https://github.com/WordPress/mcp-adapter/releases)
- WordPress 7.0 "Armstrong" shipped on 20 May 2026, slipping from 9 April. It added a provider-agnostic PHP AI Client, Abilities wired into that client, a client-side (JS) Abilities API, and a Connectors screen for AI providers. These are mostly developer infrastructure. — [Search Engine Journal](https://www.searchenginejournal.com/wordpress-7-0-launches-with-native-ai-integration/575419/); [WordPress VIP Lobby, 20 May 2026](https://customerhub.wpvip.com/lobby/2026/05/20/now-available-wordpress-7-0/); [Make Core 7.0 Field Guide](https://make.wordpress.org/core/2026/05/14/wordpress-7-0-field-guide/?output_format=md)
- Secondary sources (blogs) say 7.1 was a quieter release that extended the Abilities API. No primary source was checked. — [InfoQ, Jul 2026](https://infoq.com/news/2026/07/wordpress-7-ai)
- 7.2 adds three read-only core abilities: `core/content-query`, `core/users-query` and `core/settings-get`. The adapter polyfills them on older WordPress versions. — [mcp-adapter PR #435](https://github.com/WordPress/mcp-adapter/pull/435); [mcp-adapter issue #452](https://github.com/WordPress/mcp-adapter/issues/452)
- 7.2 schedule: RC1 on 17–19 Nov 2026, final release on 8–10 Dec 2026. Fabrement, a vendor writing on 24 Sep 2026, also says:
  - the official AI plugin can switch MCP on and pick which abilities are exposed, the first per-ability control in an official tool
  - write abilities are "explored, not promised"
  - "agent identity" (auditable identities and scoped permissions kept apart from human accounts) is on the roadmap but not built
  - an MCP client still acts as a WordPress user, using that user's application password

  Source: [Fabrement guide (vendor)](https://fabrement.com/guides/wordpress-7-2-ai-agents/)
- The 7.3 proposal (issue opened 13 Nov 2026):
  - content: `core/content-create`, `core/content-update`, `core/content-delete`
  - settings: `core/settings-update`
  - users: create, update and delete
  - media: query, upload, update and delete
  - terms: query, create, update and delete

  Its status is "In discussion / Needs decision", with no milestone. A contributor objected on 17 Nov 2026 and suggested a `core-experimental/*` prefix. — [mcp-adapter issue #452](https://github.com/WordPress/mcp-adapter/issues/452)
- Per Fabrement, plugins still have to supply the following in 7.2: blocks written as code, a shared design system, templates, checking agent-written code before it goes live, form, SEO and multilingual integration, and permissions until agent identity ships. — [Fabrement (vendor)](https://fabrement.com/guides/wordpress-7-2-ai-agents/)
- Agency use: WebDevStudios published "The WordPress MCP Adapter Is Ready for Production. Is Your Site Ready for It?" on 15 Oct 2026. Search snippets say it connects client sites to Claude and ChatGPT through the adapter, for example turning interview notes into a draft post, and requires one setup step from each client before an agent touches production. The page returned an error, so that step could not be confirmed. — [WebDevStudios](https://webdevstudios.com/2026/10/15/wordpress-mcp-adapter-production/)

### Inferences
- Core alone will not edit structured pages until 7.3 at the earliest, which means 2027. Even then, its abilities will be generic post-content create and update. They will not know BlueWorx's section and field model. A BlueWorx-specific ability layer is needed whichever editing standard is chosen.
- The safest long-term bet is to build BlueWorx abilities on the Abilities API and expose them through the adapter. The developer blog's comments say the adapter "bridge" pattern exists so abilities can move to a future protocol. That makes the abilities layer the durable asset, more than MCP itself.
- The adapter's pace of breaking changes argues for pinning its version and running integration tests in CI.

### Gaps
- No official make.wordpress.org/ai roadmap post was retrieved that confirms the scope of write abilities, or an agent-identity timeline beyond the 7.2 notes.
- The WebDevStudios production checklist could not be fetched (HTTP 520).

## 2. Content as files: page content as JSON/Markdown/YAML in the repo, edited by Claude and deployed by CI

### Takeaway
Git-based CMS tools are mature outside WordPress: Decap 3.17 (Oct 2026), Keystatic and TinaCMS. They give real version history, review through pull requests, and branch previews. They cost client self-service, approval queues that suit non-technical people, easy previews, and handling of large media. Inside WordPress there is almost no tooling for keeping page content in git. The one close match, PushPull, is beta with limited coverage. Pages kept in files would also be invisible to SEO, translation and search plugins, which read the database.

### Cited Findings
- Git-based CMS pros:
  - writers use a browser dashboard with no git
  - changes become commits or pull requests that pass code review, lint and staging checks
  - content is plain Markdown, JSON or YAML
  - `git revert` gives rollback

  Source: [Layer3 Labs guide, updated 13 Sep 2026](https://www.layer3labs.io/guides/git-based-cms)
- Git-based CMS cons:
  - simultaneous edits cause merge conflicts that non-technical users struggle with
  - draft previews need automated preview deployments, which take more setup than a WordPress preview
  - large images, videos and PDFs bloat the repo and slow CI
  - a poor fit for large non-technical teams editing at once

  Source: [Layer3 Labs, Sep 2026](https://www.layer3labs.io/guides/git-based-cms)
- Decap CMS 3.17.0 (Oct 2026) made Decap Turbo stable. Turbo lets editors sign in without a Git or Netlify account, loads large collections faster, and adds roles and an S3 media library. The core stays MIT, self-installed and Git-based. — [Decap blog, 16 Oct 2026](https://decapcms.org/blog/); [Decap Turbo](https://decapcms.org/turbo/)
- A competitor, Sveltia CMS, says Decap's release gaps have been "irregular and often long". That is a rival's claim. — [Sveltia CMS on npm](https://npmjs.com/package/@sveltia/cms)
- Keystatic (by Thinkmill) is a free git-based CMS for Markdown, JSON and YAML. Its GitHub mode commits through the GitHub API, and editors can create a branch and PR from the admin, with Vercel building a branch preview. Editors without GitHub accounts need Keystatic Cloud (free for up to 3 users) or a GitHub App or OAuth app. There is no approval queue or staging area separate from the repo. — [Lucky Media comparison](https://www.luckymedia.dev/compare/keystatic-vs-decap-cms); [egghead lesson](https://egghead.io/lessons/react-manually-connect-a-keystatic-project-to-a-github-repo); [Layer3 Labs](https://www.layer3labs.io/guides/git-based-cms)
- TinaCMS stands out for visual, in-context editing. It is freemium, with a team plan around $29 per user per month (third-party listing). — [Toolradar](https://toolradar.com/compare/keystatic-vs-tinacms); [Wisp comparison](https://www.wisp.blog/compare/tina/keystatic)
- All three tools are aimed at static or JS frameworks (Astro, Next.js). None of the sources describe a WordPress backend for them. Forestry was discontinued in 2023. — [Bitdoze, 2026](https://www.bitdoze.com/best-headless-cms-for-astro/); [dasroot, Mar 2026](https://dasroot.net/posts/2026/03/decap-cms-vs-tina-cms-vs-forestry-2026-comparison/)
- PushPull is a WordPress plugin that stores selected content in git as canonical JSON, one file per item plus a manifest, and does not use post IDs as identity. It is beta. Early versions did not handle posts, pages, menus, media or forms. Pages and custom CSS were added later. One listing says it keeps a git-like store inside database tables. — [PushPull readme 0.0.8](https://cdn.jsdelivr.net/wp/pushpull/tags/0.0.8/README.md); [PushPull trunk readme](https://fastly.jsdelivr.net/wp/pushpull/trunk/readme.txt)
- Common WordPress git practice keeps code in git and content in the database. Deployment guides do not cover page content. — [DeployHQ](https://deployhq.com/blog/automate-wordpress-deployments-with-git)

### Inferences
- Pages kept as files in a theme or plugin repo would bypass the database. WordPress features that read `post_content` or post meta would not see them unless the files were synced into posts:
  - SEO plugins such as Yoast and Rank Math (meta, schema, sitemaps)
  - translation plugins (WPML, Polylang)
  - site search
  - revisions
  - the REST API
  - and the planned 7.3 `core/content-*` abilities

  This comes from how those plugins are built. None of the sources fetched here test it.
- A hybrid keeps the database as the live copy and git as a mirror and audit trail, for example snapshotting page JSON to the repo on every MCP write. That keeps plugin compatibility and client self-service, and still gives git history. PushPull's design (canonical JSON, IDs that do not depend on the database) is a reference pattern.
- With content as files, every client edit becomes a deploy. For per-client hosted WordPress, that means CI on every typo fix, and clients cannot edit on their own without a git-CMS layer, which is non-WordPress tooling to maintain for 10 years.

### Gaps
- No agency case study was found of WordPress page content managed as files in git, in production at scale.
- No source was found on WPML or Yoast compatibility with file-sourced page content.

## 3. Content as structured JSON in WordPress (one JSON post meta or a custom table), edited through MCP plus a minimal form

### Takeaway
No public write-up or case study of this exact pattern was found. It is the closest fit to "edit content only, never layout", and it sits naturally behind custom abilities. The trade-offs (search, SEO, translation, revisions) are known in principle, but they are unverified by sources here.

### Cited Findings
- The Abilities API registers operations with typed input and output schemas and a permission check, so a page-content ability can validate a JSON schema for a page's sections before any write. — [Fabrement (vendor)](https://fabrement.com/guides/wordpress-7-2-ai-agents/); [WordPress Developer Blog, Feb 2026](https://developer.wordpress.org/news/2026/02/from-abilities-to-ai-agents-introducing-the-wordpress-mcp-adapter/)
- The planned 7.3 abilities are generic content create, update and delete. They are not schema-aware page abilities. — [mcp-adapter issue #452](https://github.com/WordPress/mcp-adapter/issues/452)
- Fabrement lists SEO and multilingual plugin integration among the things plugins must handle themselves, not core. — [Fabrement (vendor)](https://fabrement.com/guides/wordpress-7-2-ai-agents/)

### Inferences
- These come from general WordPress knowledge and are not sourced here, so check them before relying on them:
  - WordPress post meta has no built-in revisions unless they are switched on. 6.4 added `revisions_enabled` for meta registered with `register_post_meta`.
  - SEO plugins analyse `post_content`, so content held only in meta needs custom integration for content analysis.
  - WPML and Polylang can translate custom fields when they are configured to.

  If these hold, a JSON-in-meta model must deliberately write a rendered copy to `post_content`, or register the meta for revisions, SEO and translation.
- A "minimal form UI" (fields per section) plus MCP abilities that share the same JSON schema keeps the client's own path and Claude's path consistent, and keeps layout code-only.

### Gaps
- No sourced comparison was found of JSON post meta versus a custom table for page content. No agency doing this publicly was found.

## 4. Risks of AI-only editing, and the guardrails recommended

### Takeaway
Every serious platform design keeps a human in the loop for writes. The common controls:
- drafts by default
- per-write confirmation
- least-privilege user identities
- per-ability allowlists
- activity or audit logs tied to a human
- a kill switch
- review before anything goes live

Prompt injection through the content an agent reads is the main security threat. No source was found on whether chat-only editing works for non-technical clients.

### Cited Findings
- WordPress.com, 20 Mar 2026:
  - 19 write operations across posts, pages, comments, categories, tags and media
  - writes, including deletes, ask the user to confirm
  - new posts and pages default to draft
  - deletes go to trash for 30 days
  - permissions follow existing roles (a Contributor can draft but not publish)
  - every action is logged in the Activity Log
  - available on all paid plans, with each write operation switched on separately

  Sources: [TechCrunch, 20 Mar 2026](https://www.techcrunch.com/2026/03/20/wordpress-com-now-lets-ai-agents-write-and-publish-posts-and-more/); [The Next Web, 20 Mar 2026](https://thenextweb.com/news/wordpress-com-mcp-write-capabilities-ai-agent); [PPC Land](https://ppc.land/wordpress-com-write-capabilities-let-ai-agents-edit-your-live-site/)
- WordPress VIP Secure MCP (vendor page):
  - one gateway, api.wpvip.com/mcp, that denies everything by default
  - access enabled per app, role and environment
  - production writes off until an Org Admin opts in for each app
  - "Step Up" browser confirmation for sensitive writes
  - an MCP Call Log tying each call to the person who authorised it, flagged as agent activity and also in the standard audit log
  - an org-wide kill switch
  - bug-fix workflows open PRs that need a human to merge
  - scope covers content editing, page create and delete, posts, and template and pattern updates, with deeper content workflows in V2
  - no extra cost for VIP customers
  - beta customers: News UK and Pew Research

  Source: [WordPress VIP Secure MCP](https://wpvip.com/capabilities/ecosystem/secure-mcp/)
- Official WordPress guidance: the agent acts as a WordPress user, limited by that user's capabilities. Use dedicated limited users. Start read-only. Log usage. — [WordPress Developer Blog, Feb 2026](https://developer.wordpress.org/news/2026/02/from-abilities-to-ai-agents-introducing-the-wordpress-mcp-adapter/)
- Fabrement's checklist: test on staging, give the agent its own lowest-role user and revoke its application password afterwards, expose only what the job needs (read-only first), and take a backup before large changes. It also says "A permission check answers whether a user may do something, not whether the code is safe to run", and that connector approvals do not approve what an agent does to the site. — [Fabrement (vendor)](https://fabrement.com/guides/wordpress-7-2-ai-agents/)
- Indirect prompt injection (instructions hidden in content the agent reads) is described as the main agent attack in 2026. Human approval gates are recommended for irreversible or customer-facing actions. — [Toloka](https://toloka.ai/blog/ai-agent-security-guardrails/); [Block engineering](https://engineering.block.xyz/blog/agent-guardrails-and-controls)
- Webgate's agency practice: MCP output is saved as a draft. Humans review IA, UX, visual hierarchy, accessibility, responsive behaviour, design-system consistency, performance and publishing. Webgate "would not give an agent unrestricted access to redesign a production site", and uses the visual editor for small tweaks because humans are "still faster at many micro-decisions". Published 23 Sep 2026 on Elementor's blog (vendor). — [Elementor / Webgate](https://elementor.com/blog/mcp-webgate-case-study/)
- A publisher of a 70,000-reader site using an AI agent values that every change lands in WordPress, where it can be seen and undone in one click. — [Meow Apps](https://meowapps.com/wordpress-ai-agent/)

### Inferences
- WordPress has no built-in agent identity, so audit trails should come from BlueWorx's MCP server. That means logging every write with the requesting human, the ability, and the before and after JSON, and storing revisions. Site change logs record the WordPress user the agent acts as, not the real requester.
- For a "no visual editor" standard, the client trust problem has two parts. Clients need a way to see and approve changes without chat: a preview link or diff. They also need a fallback way to edit if the agent or Claude access is unavailable. A minimal form UI covers the second.
- Schema-validated, content-only abilities (no layout or class fields) are themselves a guardrail. The agent cannot break the design even if it is wrong or injected.

### Gaps
- No studies or user research were found on whether non-technical clients can run a chat-only editing workflow, or on its accessibility, such as for screen-reader users of AI chat clients.
- No error-rate data for AI-made CMS edits was found.

## 5. Who is doing this in practice, and evidence of outcomes

### Takeaway
Platforms (WordPress.com, VIP, Elementor) shipped agent editing in 2026, and agencies are experimenting. All of it is supervised and draft-first. No independent case study with measured outcomes (time saved, error rates, client satisfaction) was found.

### Cited Findings
- WordPress.com: MCP write tools for all paid plans since 20 Mar 2026. Named clients: Claude, ChatGPT, Cursor. — [TechCrunch](https://www.techcrunch.com/2026/03/20/wordpress-com-now-lets-ai-agents-write-and-publish-posts-and-more/)
- WordPress VIP: Secure MCP, with beta customers News UK and Pew Research. Their first uses were database syncs and pulling error logs, not content editing. — [WordPress VIP](https://wpvip.com/capabilities/ecosystem/secure-mcp/)
- Elementor: an official MCP, which Webgate used on its own production site to build V4 Atomic sections from briefs, screenshots and Figma with Claude Code and Codex. Gains are described only qualitatively ("dramatically reducing the amount of mechanical work"), with no numbers. — [Elementor / Webgate, Sep 2026](https://elementor.com/blog/mcp-webgate-case-study/)
- WebDevStudios (agency) connects client sites through the MCP Adapter for tasks such as drafting posts, with a pre-production client step. Date: 15 Oct 2026. — [WebDevStudios](https://webdevstudios.com/2026/10/15/wordpress-mcp-adapter-production/)
- An SEO consultant used Claude Code, Search Console and Playwright MCP servers, and wp-cli for a content-pruning project. — [Elite Strategies, 2026](https://elite-strategies.com/content-pruning-case-study-2026/)
- Fabrement (vendor) builds and runs sites through MCP: blocks from Figma or screenshots, templates, forms, Yoast and WPML. It checks block code before saving and publishes as a separate step, but has no role-scoped access. — [Fabrement](https://fabrement.com/guides/wordpress-7-2-ai-agents/)
- Breakdance markets "build WordPress sites with AI agents". — [Breakdance](https://breakdance.com/features/build-with-ai/)

### Inferences
- The market direction is agents editing inside WordPress (database content, with revisions and drafts), not replacing WordPress content with git files. The platforms with the most scale (WordPress.com, VIP) all keep a visual editor available alongside the agent.
- Nobody found removes the human-facing editor entirely for client sites. BlueWorx would be early, and should plan the fallback UI.

### Gaps
- No outcome metrics from any agency. Most evidence is vendor-published.

## 6. Headless WordPress (Next.js/Faust): does it change the answer for pages?

### Takeaway
Not much. Headless moves rendering to a JS front end. It does not decide how content is edited or stored. It adds a second codebase and hosting to maintain for 10 years, plus preview wiring. Faust.js is WP Engine-led and small by adoption numbers.

### Cited Findings
- Faust.js is a Next.js framework for headless WordPress, maintained by WP Engine. WP Engine rebuilt it from scratch, and the old version keeps working for existing sites (date unconfirmed). — [WP Engine headless-framework](https://github.com/wpengine/headless-framework); [Jean Galea](https://jeangalea.com/headless-wordpress-the-bridge/)
- The FaustWP plugin had 1K+ active installs and 7 reviews as of July 2026. — [WP Mayor Plugin Pulse](https://plugins.wpmayor.com/plugin/faustwp)
- In headless setups, WordPress's Preview button assumes WordPress renders the page, so preview must be wired to the separate front end. Faust provides this for Next.js. — [thestacc, 2026](https://thestacc.com/blog/headless-wordpress-2026/)
- Git-based CMSs (Keystatic, Tina, Decap) mainly target Astro and Next.js front ends. — [Bitdoze, 2026](https://www.bitdoze.com/best-headless-cms-for-astro/)

### Inferences
- Pixel-exact Figma output is just as achievable with a classic PHP or block theme, because layout lives in code either way. Headless is not needed for design fidelity. It mainly makes sense if BlueWorx wanted to drop WordPress for pages altogether, for example an Astro site with Keystatic, which would break the "WordPress per client" hosting model.

### Gaps
- No 2026 primary source was found on Faust's release cadence or long-term support commitment.
