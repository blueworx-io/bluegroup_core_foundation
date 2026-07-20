#!/usr/bin/env node
// Fails if the Playwright run executed zero tests. `npx playwright test` exits 0
// when everything skips, so without this a fully-skipped suite reports green.
//
// Reads the JSON reporter's output. The workflows' default test_command includes
// `--reporter=list,json` and sets PLAYWRIGHT_JSON_OUTPUT_NAME; a project that
// overrides test_command must keep the json reporter or this check fails loudly
// rather than silently passing.

import { existsSync } from 'node:fs';
import { readJson } from './lib/io.mjs';
import { testsExecuted } from './lib/checks.mjs';

const reportPath = process.env.PLAYWRIGHT_JSON_OUTPUT_NAME || 'playwright-report.json';

if (!existsSync(reportPath)) {
  console.error(
    `No Playwright JSON report at ${reportPath}, so the number of tests that ran can't be verified.\n` +
      "  If this project overrides test_command, keep the json reporter — e.g. `npx playwright test --reporter=list,json`.",
  );
  process.exit(1);
}

const report = readJson(reportPath);
if (!report) {
  console.error(`${reportPath} exists but could not be parsed as JSON.`);
  process.exit(1);
}

const result = testsExecuted({ report });
if (result.ok) {
  console.log(result.message);
  process.exit(0);
}

console.error(result.message);
process.exit(1);
