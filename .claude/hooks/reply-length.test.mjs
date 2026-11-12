// The hook is a small script Claude Code runs when a reply ends. It reads the
// hook input on stdin, looks at the last reply, and either prints nothing (the
// reply stands) or a "block" verdict that sends the reply back to be shortened.
// So this spawns it as a real child process, exactly as Claude Code would.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const hookPath = join(dirname(fileURLToPath(import.meta.url)), 'reply-length.mjs');
const words = (n) => Array(n).fill('word').join(' ');

// A transcript as Claude Code writes it: one JSON object per line.
function transcript(userText, replyText) {
  const dir = mkdtempSync(join(tmpdir(), 'reply-length-'));
  const path = join(dir, 'transcript.jsonl');
  writeFileSync(
    path,
    [
      { type: 'user', message: { role: 'user', content: userText } },
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: replyText }] } },
    ]
      .map((entry) => JSON.stringify(entry))
      .join('\n')
  );
  return path;
}

function run(input) {
  const result = spawnSync('node', [hookPath], { input: JSON.stringify(input), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}

test('a long reply is sent back to be shortened', () => {
  const verdict = run({ transcript_path: transcript('is it done', words(140)) });
  assert.equal(verdict.decision, 'block');
  assert.match(verdict.reason, /140 words/);
});

test('a short reply stands', () => {
  assert.equal(run({ transcript_path: transcript('is it done', 'Yes, done.') }), null);
});

test('a long reply stands when detail, steps or a draft was asked for', () => {
  for (const ask of ['give me the steps again', 'explain in detail', 'draft an email for me']) {
    assert.equal(run({ transcript_path: transcript(ask, words(140)) }), null, ask);
  }
});

test('a quoted draft and a code block do not count towards the length', () => {
  const quoted = `Here it is.\n\n> ${words(140)}`;
  const code = `Run this.\n\n\`\`\`\n${words(140)}\n\`\`\``;
  assert.equal(run({ transcript_path: transcript('is it done', quoted) }), null);
  assert.equal(run({ transcript_path: transcript('is it done', code) }), null);
});

test('a reply already sent back once is let through, so it can never loop', () => {
  assert.equal(run({ stop_hook_active: true, transcript_path: transcript('is it done', words(140)) }), null);
});

test('the reply Claude Code hands over directly is used when it is there', () => {
  const verdict = run({ last_assistant_message: words(120), transcript_path: transcript('is it done', 'Yes.') });
  assert.equal(verdict.decision, 'block');
});

test('missing or unreadable input changes nothing', () => {
  assert.equal(run({}), null);
  assert.equal(run({ transcript_path: join(tmpdir(), 'no-such-transcript.jsonl') }), null);
});
