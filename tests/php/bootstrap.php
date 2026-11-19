<?php
require __DIR__ . '/../../vendor/autoload.php';
require __DIR__ . '/WordPressStubs.php';
// design-system.php exits immediately unless ABSPATH or BWPE_TESTING is
// defined (it ships into plugins with no ABSPATH guard of its own otherwise —
// see its direct-access check), and this test run is neither a plugin nor a
// WordPress install.
define( 'BWPE_TESTING', true );
// Vendored into a plugin, the page editor's loader requires this file itself —
// this repo has no such loader, so the tests need it pulled in directly or
// DesignSystemTest fatals on an undefined function.
require_once __DIR__ . '/../../.claude/skills/blueworx-admin-design/design-system.php';

// The shared page lock. Its loader is required too, so the tests cover the
// file every theme and plugin actually requires, not just the class.
require __DIR__ . '/PageLockStubs.php';
define( 'BWPL_TESTING', true );
require_once __DIR__ . '/../../page-lock/blueworx-page-lock.php';
require_once __DIR__ . '/../../page-lock/v1/Lock.php';
