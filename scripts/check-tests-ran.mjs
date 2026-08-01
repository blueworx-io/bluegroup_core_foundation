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

//
// PLAYWRIGHT_REPORT_DIR switches this to the sharded form: instead of one
// report it reads every *.json under that directory (where the shards' uploaded
// artifacts were downloaded) and applies the gate to the SUM. A single shard
// can legitimately execute nothing when there are more shards than spec files;
// every shard executing nothing is the failure this exists to catch, and only
// summing first tells those apart.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readJson } from './lib/io.mjs';
import { testsExecuted, testsExecutedAcross } from './lib/checks.mjs';

const reportPath = process.env.PLAYWRIGHT_JSON_OUTPUT_NAME || 'playwright-report.json';
const reportDir = process.env.PLAYWRIGHT_REPORT_DIR || '';
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

const result = reportDir ? checkShards(reportDir) : checkSingle(reportPath);

if (result.ok) {
  console.log(result.message);
  process.exit(0);
}

fail(result.message);

function checkSingle(path) {
  if (!existsSync(path)) {
    fail(
      `No Playwright JSON report at ${path}, so the number of tests that ran can't be verified.\n` +
        "  If this project overrides test_command, keep the json reporter — e.g. `npx playwright test --reporter=list,json`.",
    );
  }

  const report = readJson(path);
  if (!report) {
    fail(`${path} exists but could not be parsed as JSON.`);
  }

  return testsExecuted({ report });
}

function checkShards(dir) {
  if (!existsSync(dir)) {
    fail(
      `No shard reports were downloaded to ${dir}, so the number of tests that ran can't be verified.\n` +
        '  Check that every shard uploaded its Playwright JSON report.',
    );
  }

  const files = findJson(dir);
  // An unparseable report is not the same as an absent one — it means a shard
  // ran and produced something unreadable. Counting it as zero would quietly
  // shrink the total, so refuse outright.
  const reports = files.map((file) => {
    const report = readJson(file);
    if (!report) {
      fail(`${file} could not be parsed as JSON, so its shard's results cannot be counted.`);
    }
    return report;
  });

  console.log(`Collected ${reports.length} shard report(s) from ${dir}.`);

  return testsExecutedAcross({ reports });
}

function findJson(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      findJson(full, acc);
    } else if (entry.toLowerCase().endsWith('.json')) {
      acc.push(full);
    }
  }
  return acc;
}
