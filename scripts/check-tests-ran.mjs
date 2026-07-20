#!/usr/bin/env node
// Fails if the Playwright run executed zero tests. `npx playwright test` exits 0
// when everything skips, so without this a fully-skipped suite reports green.
//
// Reads the JSON reporter's output. The workflows' default test_command includes
// `--reporter=list,json` and sets PLAYWRIGHT_JSON_OUTPUT_NAME; a project that
// overrides test_command must keep the json reporter or this check fails loudly
// rather than silently passing.

//
// ALLOW_ZERO_TESTS=true downgrades a failure to a warning. It is a temporary
// escape hatch for a project that has no working test host yet — it does not
// make the problem go away, it just stops it blocking unrelated work. Every
// run says so in the log.

import { existsSync } from 'node:fs';
import { readJson } from './lib/io.mjs';
import { testsExecuted } from './lib/checks.mjs';

const reportPath = process.env.PLAYWRIGHT_JSON_OUTPUT_NAME || 'playwright-report.json';
const allowZero = process.env.ALLOW_ZERO_TESTS === 'true';

function fail(message) {
  if (allowZero) {
    console.log(`::warning title=Test gate suppressed::${message.split('\n')[0]} (allow_zero_tests is on for this project, so this is a warning rather than a failure — it still means CI proved nothing.)`);
    console.log(message);
    process.exit(0);
  }
  console.error(message);
  process.exit(1);
}

if (!existsSync(reportPath)) {
  fail(
    `No Playwright JSON report at ${reportPath}, so the number of tests that ran can't be verified.\n` +
      "  If this project overrides test_command, keep the json reporter — e.g. `npx playwright test --reporter=list,json`.",
  );
}

const report = readJson(reportPath);
if (!report) {
  fail(`${reportPath} exists but could not be parsed as JSON.`);
}

const result = testsExecuted({ report });
if (result.ok) {
  console.log(result.message);
  process.exit(0);
}

fail(result.message);
