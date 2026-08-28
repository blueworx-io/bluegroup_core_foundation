// Playwright's globalSetup hook — see playwright.config.js. Runs
// scripts/stage-example-plugin.mjs before any test file loads, so the suite
// can never run against a stale or absent copy of the library just because
// nobody remembered to stage it by hand first. Forgetting used to mean
// WordPress fataling on a missing library with no hint that staging was the
// step that was skipped.
import { stage } from './stage-example-plugin.mjs';

export default async function globalSetup() {
  stage();
}
