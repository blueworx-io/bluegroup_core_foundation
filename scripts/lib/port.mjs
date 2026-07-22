// Parse the PIDs listening on a TCP port out of Windows `netstat -ano` output.
//
// The harness tracks its server by a pidFile, but that is only a hint: an
// interrupted or stale run can leave a `php -S` listening that the pidFile
// never recorded. On Windows two servers can bind the same port, so the orphan
// silently intercepts requests, and teardown that only kills the recorded pid
// leaves it behind. The port — not a remembered pid — is the real resource, so
// teardown reconciles against whatever is actually bound.
//
// This is the fragile part (locale, IPv6, column spacing), so it is pure and
// fixture-tested here; the side-effecting netstat/kill calls live in
// wp-test-env.mjs.

/**
 * @param {string} netstatOutput  raw `netstat -ano` stdout
 * @param {number|string} port    the local TCP port to match
 * @returns {number[]}            distinct PIDs LISTENING on that exact port
 */
export function parseListeningPids(netstatOutput, port) {
  const want = Number(port);
  const pids = new Set();
  for (const line of String(netstatOutput).split(/\r?\n/)) {
    // Proto, Local Address (host:port), Foreign Address, State, PID.
    // Anchored on LISTENING so TIME_WAIT/ESTABLISHED rows (and their pid 0) are
    // ignored. The local host may be 127.0.0.1, 0.0.0.0, or an [IPv6] literal;
    // the port is the run of digits after the final colon.
    const m = line.match(/^\s*TCP\s+\S*:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
    if (m && Number(m[1]) === want) {
      pids.add(Number(m[2]));
    }
  }
  return [...pids];
}
