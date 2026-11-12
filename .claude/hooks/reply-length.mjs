// Stop hook: sends an over-long chat reply back to be rewritten shorter.
//
// The shared rule (CLAUDE.md, "Communication") is about 80 words per reply.
// Written rules alone drift over a long session, so this checks every reply as
// it ends. Replies stand as they are when the person asked for detail, steps or
// a draft; quoted drafts and code blocks are never counted.
//
// The long reply has already been shown by the time this runs, so the person
// sees it followed by the short one. It is let through the second time, so it
// can never loop. To switch it off for one repo, remove the Stop entry from
// that repo's .claude/settings.json.
import { readFileSync } from 'node:fs';

const LIMIT = 90; // "about 80", with a little tolerance

// Words in the user's last message that mean a longer reply was asked for.
const EXEMPT =
  /\b(detail|details|detailed|in full|full report|in depth|steps|step by step|guide me|walk me through|draft|redraft|write up|longer|lay ?out|list (them|all|every)|plan)\b/i;

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((part) => part && part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n');
}

function lastMessages(path) {
  let assistant = '';
  let user = '';
  let lines = [];
  try {
    lines = readFileSync(path, 'utf8').split('\n');
  } catch {
    return { assistant, user };
  }
  for (let i = lines.length - 1; i >= 0 && (!assistant || !user); i--) {
    if (!lines[i].trim()) continue;
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (entry.isSidechain || !entry.message) continue;
    const text = textOf(entry.message.content).trim();
    if (!text) continue;
    if (!assistant && entry.type === 'assistant') assistant = text;
    // Only a real user message counts, and only the one before the reply.
    else if (assistant && !user && entry.type === 'user' && !/^<system-reminder>/.test(text)) user = text;
  }
  return { assistant, user };
}

function countWords(text) {
  const prose = text
    .replace(/```[\s\S]*?```/g, ' ') // code blocks are for copying, not reading
    .split('\n')
    .filter((line) => !/^\s*>/.test(line)) // quoted drafts (an email, an issue)
    .join(' ')
    .replace(/\]\([^)]*\)/g, ']'); // link targets
  return (prose.match(/[A-Za-z0-9][A-Za-z0-9'’.-]*/g) || []).length;
}

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  process.exit(0);
}

// Already sent back once this turn: let the rewrite through, never loop.
if (input.stop_hook_active) process.exit(0);

const found = input.transcript_path ? lastMessages(input.transcript_path) : { assistant: '', user: '' };
const reply = typeof input.last_assistant_message === 'string' && input.last_assistant_message.trim()
  ? input.last_assistant_message
  : found.assistant;

if (!reply || EXEMPT.test(found.user)) process.exit(0);

const words = countWords(reply);
if (words <= LIMIT) process.exit(0);

process.stdout.write(
  JSON.stringify({
    decision: 'block',
    reason:
      `Your reply was ${words} words. The limit is about 80 words, roughly 4 short plain lines. ` +
      'Send the whole reply again now, shortened to fit: answer first, no headings, ' +
      'and offer detail in one line instead of giving it. For a status update, or for things the person ' +
      'has to do, use a simple short list. Do not mention this check or apologise.',
  })
);
