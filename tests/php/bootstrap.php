<?php
require __DIR__ . '/../../vendor/autoload.php';
require __DIR__ . '/WordPressStubs.php';
// Vendored into a plugin, the page editor's loader requires this file itself —
// this repo has no such loader, so the tests need it pulled in directly or
// DesignSystemTest fatals on an undefined function.
require_once __DIR__ . '/../../.claude/skills/blueworx-admin-design/design-system.php';
