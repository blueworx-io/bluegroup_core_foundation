# design-sync notes

- **Shape is neither `storybook` nor `package`.** There is no npm package, no `dist/`
  and no Storybook. The design system at `.claude/skills/blueworx-admin-design/` is
  hand-authored and already committed in the claude.ai/design upload layout:
  `_ds_bundle.js` (with its `@ds-bundle` header), `_ds_manifest.json` (app-compiled,
  including the `cards` index), one self-contained `styles.css`, `fonts/`, and
  `components/<group>/<Name>.{jsx,d.ts,prompt.md}` with group-level `*.card.html`
  previews. So a sync is a straight file push of that folder — do not run
  `package-build.mjs` against this repo.

- **Target project:** `75753ef2-9fb7-4c3a-ba0e-a7a0b967565d` — "Labs | WordPress
  Backend Components". The bundle namespace `BlueWorxAdminDesignSystem_75753e`
  encodes it, so the project id can always be recovered from `_ds_manifest.json`.

- **Direction is code → design, never the reverse.** See the sync contract in
  `.claude/skills/blueworx-admin-design/github.md`. Nothing is deleted in the
  design project unless Luke names the exact files.

- **Excluded from the push:** `editor/**` and `design-system.php` (server-side PHP
  the design tool cannot use), and `.thumbnail` files (app-generated). This matches
  what `scripts/build-design-site.mjs` leaves out of the Vercel site.

- **No `conventions.md`, and none should be authored.** The README is not generated
  here — `.claude/skills/blueworx-admin-design/readme.md` is the hand-written
  conventions document and is already far richer than a generated header. The
  `readmeHeader` config key does not apply to this shape.

- **Cards are verified by the browsable site, not by a capture loop.** Every preview
  is a real HTML card carrying a first-line `<!-- @dsCard … -->` marker and loading
  `styles.css` by relative path; they are published via Vercel from `design-site/`,
  so preview fidelity is already checked in CI rather than at sync time.

## 2026-10-17
- First sync through this skill. Pushed 226 files; 10 were new in the project
  (Gantt ×3, SummaryStrip ×3, the calendar / compare / planning data cards, the
  settings-functions layout card). No deletions — local is a strict superset.
- `github.md`'s "## Last sync" block still reads 2026-08-19. It is hand-maintained
  and lives inside the synced folder, so updating it means another push plus a
  Vercel rebuild; left alone deliberately.
