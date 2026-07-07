# Starter Prompt — Headless Framework

The follow-on prompt for headless projects, saved verbatim so the whole system is
documented in the one place it lives. Paste it into Claude Code after the headless
Starter Prompt has set up the repo — it scaffolds the project with our standard
framework: **Next.js (App Router) + TypeScript**.

---

Scaffold this headless project with our standard framework: Next.js (App Router) + TypeScript.

1. Scaffold with create-next-app using: TypeScript, App Router, Tailwind CSS, ESLint,
   and the src/ directory layout. npm as the package manager. No experimental options.
   Keep the Node version pinned in .nvmrc (20) — don't change it.

2. Add our approved UI stack on top: @radix-ui/themes (wrap the root layout in its
   Theme provider), lucide-react, and tailwindcss-animate. Do NOT add GSAP by default —
   it's approved, but only add it when a feature actually needs complex animation.

3. Replace any placeholder lint/build scripts in package.json with the real Next.js
   commands the scaffold generates, so `npm run lint` and `npm run build` — the exact
   commands the shared headless CI workflow runs — exercise the real app.

4. Wire Playwright to the framework: add @playwright/test, update the existing
   playwright.config so its webServer starts the production build (`npm run start`
   against the app CI has just built), and write one smoke test that loads the home
   page and checks it renders — so the Playwright step in CI is testing something
   real from day one.

5. Make it deploy on Netlify: add a netlify.toml with the build command and the
   official Next.js Netlify runtime (@netlify/plugin-nextjs), so the site and its
   PR preview deploys work without manual dashboard configuration.

6. Add every dependency and devDependency this scaffold introduces to
   approved-deps.json — and nothing beyond them.

7. Bump the minor version in package.json and update CHANGELOG.md to match.

8. Work on a branch, then open a pull request — CI guardrails must pass before merge,
   same as any other change.
