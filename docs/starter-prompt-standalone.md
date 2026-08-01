# Starter Prompt — Standalone

The Starter Prompt for standalone projects. Create the empty repo, open it in
Claude Code, and paste everything below the line.

It is written to be self-contained: following it produces a repo that passes
`ci-standalone.yml` on its first pull request.

## What "standalone" means here

The type that isn't the other two. A standalone project **is not** a WordPress
plugin (no PHP, no wp-admin, no plugin header) and **is not** headless (no
WordPress behind it, no Netlify preview as a required check). It is a
self-contained web app or tool that builds and runs on its own — an internal
tool, a calculator, a dashboard, a demo, a small marketing site with no CMS.

The tell is the CMS question. **If content is edited by a person who isn't a
developer, it is not standalone** — it wants WordPress, which makes it a plugin
or a headless project. Standalone is for when the content is the code.

Unlike the other two types, this one has no worked example in the org yet. If
something here fights the project you are actually building, say so rather than
bending the project to fit — the prompt is likelier to be wrong than the project.

---

Set this repo up as a BlueWorx standalone project.

Work on a branch and open a pull request at the end — the shared CI guardrails must
pass before it merges, exactly like any other change. Ask me what the project is
before you start if I have not already told you; the framework choice below depends
on it.

## 1. Carry in the shared rules

Copy these from `blueworx-io/bluegroup_core_foundation` into this repo:

```bash
curl -o CLAUDE.md https://raw.githubusercontent.com/blueworx-io/bluegroup_core_foundation/main/CLAUDE.md.template
curl -o approved-deps.json https://raw.githubusercontent.com/blueworx-io/bluegroup_core_foundation/main/templates/approved-deps.json
mkdir -p .github/ISSUE_TEMPLATE .claude
curl -o .github/PULL_REQUEST_TEMPLATE.md https://raw.githubusercontent.com/blueworx-io/bluegroup_core_foundation/main/.github/PULL_REQUEST_TEMPLATE.md
curl -o .github/ISSUE_TEMPLATE/task.md https://raw.githubusercontent.com/blueworx-io/bluegroup_core_foundation/main/.github/ISSUE_TEMPLATE/task.md
curl -o .claude/settings.json https://raw.githubusercontent.com/blueworx-io/bluegroup_core_foundation/main/.claude/settings.json
```

`CLAUDE.md` is the condensed global rules, carried into the repo so the guardrails
hold regardless of whose machine opens it. Do not edit it to suit this project.

## 2. Framework

There is no mandated standalone framework — the type is deliberately broad. Pick the
smallest thing that does the job and tell me what you picked and why before you
scaffold it.

Stay inside the approved tools: TypeScript, Tailwind CSS, Radix Themes for
components, `lucide-react` for icons, `tailwindcss-animate` for simple motion and GSAP
only when a feature genuinely needs complex animation. Vite is the usual honest answer
for something that is not a Next.js app; reach for Next.js only if the project actually
needs routing and server rendering, in which case ask whether it is really headless.

Pin Node in `.nvmrc` (20) and do not change it — CI runs the same version.

## 3. The files CI reads

- `package.json` — real `lint`, `build` and `test` scripts. The workflow runs
  `npm run lint`, `npm run build` and Playwright by default, so those must exercise
  the real app rather than a placeholder that exits 0.
- `CHANGELOG.md` — Keep a Changelog format, semver. CI fails any pull request that
  does not touch it, including CI-only ones.
- `approved-deps.json` — every dependency and devDependency the scaffold introduces,
  and **nothing beyond them**. A new dependency is a decision I make, not one the
  build makes.
- Start at `0.1.0`.

## 4. Testing

- `playwright.config.js` (or `.ts`) with a `webServer` that starts the **production
  build**, not the dev server — CI should test what ships.
- Keep the json reporter: `--reporter=list,json`. CI reads it to prove tests ran.
- Write at least one spec that **actually asserts something** — loads a real page and
  checks real content. A suite that skips itself exits 0, so CI fails any run that
  executes zero tests. That gate exists because a placeholder URL once let a whole
  suite skip while reporting green for months. Do not start the project already inside
  that failure.

## 5. CI caller workflow

`.github/workflows/ci.yml`, and nothing more — the rules live in the foundation:

```yaml
name: CI
on: pull_request
jobs:
  guardrails:
    uses: blueworx-io/bluegroup_core_foundation/.github/workflows/ci-standalone.yml@v1
    with:
      foundation_ref: v1
```

`foundation_ref` must match the `@ref`. They default apart — `foundation_ref`
defaults to `main` — so pinning only the first runs the v1 workflow against whatever
is on the foundation's main branch today.

Override `node_version`, `lint_command`, `build_command` or `test_command` only if the
project genuinely needs something different.

## 6. Deployment

Standalone projects are zipped and deployed by hand, so leave the folder ready for it:
at the end of a session with deployable changes, run `npm install`, `npm run build`,
then remove `node_modules`. Do this proactively — never wait to be asked.

If this project instead deploys somewhere continuously, say so now, because that is a
sign it is not really standalone.

## 7. Repo settings

- Branch protection on `main`: pull requests required, `guardrails` required to pass,
  no direct pushes.
- Default branch `main`.

## 8. Finish

Bump the version, update `CHANGELOG.md`, run the linter once and show me what it says,
then open the pull request. Do not merge it.

---

## Checklist — what the first PR must satisfy

| Check | What it wants |
|---|---|
| Lint | `npm run lint` passes |
| Build | `npm run build` passes |
| Version bump | `package.json` version above the base branch |
| Changelog | `CHANGELOG.md` touched in the PR |
| Approved deps | nothing in `package.json` missing from `approved-deps.json` |
| Playwright | at least one test **executes** — skipped is not passed |

Six checks, against the WordPress prompt's eleven: no PHP tooling, no plugin header or
version sync, no zip. That difference is the whole of what makes a project standalone.
