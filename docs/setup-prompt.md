# Setup Prompt

The original prompt that set up this foundation repo, saved verbatim so the whole
system is documented in the one place it lives. (The Team Guidelines doc — the
other reference — lives in ClickUp.)

---

Set up this repo as our shared "foundation" — the one place our development guardrails live, so every other project can point at it instead of repeating the rules per repo.

Build the following:

1. Three reusable CI guardrail workflows, one per project type: standalone, WordPress plugin, headless. Each one, on every pull request, must:

   - Install dependencies and run lint
   - Run the build
   - Fail if the version wasn't bumped compared to the base branch
   - Fail if CHANGELOG.md wasn't updated alongside the version bump
   - Fail if package.json lists a dependency not on that project's own approved-deps.json list
   - Run Playwright tests and fail if any fail — for standalone/headless, against the local build; for WordPress, against a staging/preview URL instead of trying to spin up WordPress and a database inside CI

   The WordPress workflow additionally needs to:

   - Run a PHP syntax check and PHPCS if a phpcs config exists
   - Fail if the plugin header version and package.json version (if one exists) don't match
   - Fail if more than one zip matching the plugin's slug exists in the repo, since only the current version's zip should be present

2. The small check scripts each workflow calls — version bump check, changelog check, approved-dependency check, plugin version-sync check, plugin zip check. Keep these generic and reusable, not tied to one specific project.

3. A starter approved-deps.json format other repos will copy — an empty allow-list for dependencies and devDependencies, ready for us to fill in per project.

4. Shared templates: a pull request template and an issue template, matching this structure — pull request template covers what the PR does, whether it's a first build or a change, and a checklist (branch used, version bumped, changelog updated, dependencies approved, lint/build passing locally, plugin zip rebuilt if relevant, Netlify preview checked if relevant); issue template covers goal, scope, out of scope, acceptance criteria, and project type.

5. A Claude Code permissions settings file that auto-approves routine, already-approved actions — git commands, build/lint commands, and our approved plugins/connectors — so a session never has to stop and ask permission for routine work. Anything outside that list should still prompt.

6. A README explaining what this repo is, and showing the few lines another repo needs in its own workflow file to call one of these reusable workflows instead of repeating the rules.

7. Save our two reference docs into this repo (I'll provide the content): the Team Guidelines doc and this setup prompt itself, so the whole system is documented in the one place it lives.

Work on a branch, then open a pull request for me to review before merging, same as any other project.
