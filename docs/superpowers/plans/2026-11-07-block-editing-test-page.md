# Block editing test page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A general test page, in the shared harness, proving the whole route: edit content in the block editor and through the REST API, and see it on the live page, with the section drawn by the plugin.

**Architecture:** One Playwright spec in the foundation, run under the theme in CI like the rest of the suite. It builds a page from a heading, a paragraph, an image and the example hero section, then checks the live page, edits in the editor (a standard block, the section's in-place words, and a sidebar field), edits through REST the way Claude's connection does, and reopens the page in the editor with no block warning.

**Tech Stack:** Playwright.

**Spec:** bluegroup_core_foundation#104.

## Review Focus

- The saved content must hold the section's words and none of its markup: asserted on the raw content.
- A REST edit must open again in the editor with no recovery warning: asserted on `.block-editor-warning`.
- WordPress's own pop-ups (welcome tour, "already being edited") must not fail the test: cleared by the editor helper.

---

### Task 1: The spec
- [ ] `.wp-test/tests/block-editing.spec.js` with the three tests above; allowlisted in `.gitignore`; runs in the existing CI job.
