# Section block standard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every plugin builds page sections as blocks the same way, and a fix to a section reaches pages already built.

**Architecture:** A section is a server-rendered block: `block.json` with a namespaced name, `render.php` that draws it, a plain-JS `edit.js` with a hand-written `edit.asset.php` (no build step), and attributes that are content only. Styling uses the theme's named styles. The rule is written where plugins read rules (CLAUDE.md.template, the plugin starter prompt, the design system readme), `@wordpress/scripts` is approved for plugins that prefer JSX, and the foundation's example plugin carries the worked block.

**Tech Stack:** PHP, plain JS on `wp.element`, block.json.

**Spec:** bluegroup_core_foundation#103, taking blueworx_labs_clubhouse#341's finding that server-rendered blocks let a fix reach existing pages.

## Global Constraints

- No build step in this repo; the example block is plain JS.
- Nothing under `.wp-test/` is committed unless allowlisted in `.gitignore`.

## Review Focus

- The saved page must carry no section markup, only the block comment: pinned by the test page spec (#104).
- The example block must register from its folder and render on the page: pinned by the same spec.

---

### Task 1: Rules and approved tooling
- [ ] `templates/approved-deps.json` gains `@wordpress/scripts` under devDependencies.
- [ ] The "Sections are blocks" bullet in `CLAUDE.md.template` and the starter prompt; the "Section blocks" section in the design system readme.

### Task 2: The worked example
- [ ] `.wp-test/example-plugin/blocks/section-hero/`: `block.json`, `render.php`, `style.css`, `edit.js`, `edit.asset.php`; registered from the example plugin's `init`; allowlisted in `.gitignore`.
- [ ] `php -l` and `node --check` clean. Covered end to end by #104's spec.
