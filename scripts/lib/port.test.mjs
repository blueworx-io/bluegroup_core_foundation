import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseListeningPids } from './port.mjs';

// Windows `netstat -ano` output. The columns are: Proto, Local Address,
// Foreign Address, State, PID.
const WIN = [
  '',
  'Active Connections',
  '',
  '  Proto  Local Address          Foreign Address        State           PID',
  '  TCP    127.0.0.1:8705         0.0.0.0:0              LISTENING       23128',
  '  TCP    127.0.0.1:8705         127.0.0.1:50374        TIME_WAIT       0',
  '  TCP    127.0.0.1:9000         0.0.0.0:0              LISTENING       4444',
  '',
].join('\r\n');

test('returns the pid listening on the port', () => {
  assert.deepEqual(parseListeningPids(WIN, 8705), [23128]);
});

test('ignores other ports', () => {
  assert.deepEqual(parseListeningPids(WIN, 9000), [4444]);
});

test('ignores non-LISTENING rows (TIME_WAIT/ESTABLISHED)', () => {
  // The TIME_WAIT row for 8705 has pid 0 and must not be returned.
  assert.ok(!parseListeningPids(WIN, 8705).includes(0));
});

test('finds BOTH pids when two servers bind one port — the orphan bug', () => {
  // The exact failure this fix exists for: an orphaned php from an interrupted
  // or stale run still listening alongside the recorded one. On Windows both
  // bind the same port, so teardown must find and kill both.
  const twoServers = [
    '  TCP    127.0.0.1:8706         0.0.0.0:0              LISTENING       29352',
    '  TCP    127.0.0.1:8706         0.0.0.0:0              LISTENING       3112',
  ].join('\r\n');
  assert.deepEqual(parseListeningPids(twoServers, 8706).sort((a, b) => a - b), [3112, 29352]);
});

test('matches IPv6 and 0.0.0.0 local-address forms', () => {
  const mixed = [
    '  TCP    [::1]:8705              [::]:0                 LISTENING       111',
    '  TCP    0.0.0.0:8705            0.0.0.0:0              LISTENING       222',
  ].join('\r\n');
  assert.deepEqual(parseListeningPids(mixed, 8705).sort((a, b) => a - b), [111, 222]);
});

test('does not match a port that is a substring of another (8705 vs 18705)', () => {
  const line = '  TCP    127.0.0.1:18705        0.0.0.0:0              LISTENING       999';
  assert.deepEqual(parseListeningPids(line, 8705), []);
});

test('dedups a pid that appears on several addresses', () => {
  const dup = [
    '  TCP    127.0.0.1:8705         0.0.0.0:0              LISTENING       500',
    '  TCP    [::1]:8705             [::]:0                 LISTENING       500',
  ].join('\r\n');
  assert.deepEqual(parseListeningPids(dup, 8705), [500]);
});

test('returns [] for empty or junk input', () => {
  assert.deepEqual(parseListeningPids('', 8705), []);
  assert.deepEqual(parseListeningPids('not netstat output', 8705), []);
});
