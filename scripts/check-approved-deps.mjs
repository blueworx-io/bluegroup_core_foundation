#!/usr/bin/env node
// Fails if package.json declares any dependency/devDependency not listed in
// the project's own approved-deps.json. No package.json ⇒ skip.

import { readJson } from './lib/io.mjs';
import { approvedDeps } from './lib/checks.mjs';

const pkgPath = process.env.PKG_PATH || 'package.json';
const approvedPath = process.env.APPROVED_DEPS_PATH || 'approved-deps.json';

const pkg = readJson(pkgPath);
if (!pkg) {
  console.log(`No ${pkgPath} — approved-dependencies check skipped.`);
  process.exit(0);
}

const approved = readJson(approvedPath);
if (!approved) {
  console.error(`No ${approvedPath} found. Copy the starter from the foundation repo and list this project's approved dependencies.`);
  process.exit(1);
}

const result = approvedDeps({ pkg, approved });
console.log(result.message);
process.exit(result.ok ? 0 : 1);
