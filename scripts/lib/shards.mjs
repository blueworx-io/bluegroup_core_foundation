// How many runners a project's Playwright suite is split across (#89).
//
// A project can name a number with the workflow's `shards` input. Left unset
// (0), the suite is sized from how many tests it has: one runner per
// TESTS_PER_SHARD, up to MOST_SHARDS. A small suite stays on one runner, so it
// never pays the per-runner setup for nothing; a big one stops being the reason
// every PR takes an hour.
//
// Only a local WordPress is ever split automatically. A preview URL is one
// shared site, and shards against it would corrupt each other's state.

/** Tests one runner takes, about twenty minutes of a typical suite. */
export const TESTS_PER_SHARD = 150;

/** The most runners an automatic split uses. */
export const MOST_SHARDS = 6;

// `test(`, `test.slow(`, `test.skip(`… with a title string first. Hooks and
// `test.describe` are not in the list, so they are not counted.
const TEST_CALL = /(^|[^\w.])test(\.(only|skip|slow|fixme|fail))?\s*\(\s*['"`]/gm;

/** How many tests a spec file's source declares. A count, not a parse: close is enough. */
export function countTests(source) {
  return source.match(TEST_CALL)?.length ?? 0;
}

/**
 * The number of runners to use.
 *
 * @param {{ asked: string, tests: number, local: boolean }} plan
 *   asked: the workflow's `shards` input as given ('' or '0' means size it);
 *   tests: how many tests the suite has; local: whether it runs on a local WordPress.
 */
export function planShards({ asked, tests, local }) {
  const given = String(asked ?? '').trim();

  if ('' !== given && !/^\d+$/.test(given)) {
    throw new Error(`shards must be a positive whole number, or 0 to size it from the suite; got '${given}'.`);
  }

  const number = '' === given ? 0 : Number(given);

  if (number > 0) {
    return number;
  }

  if (!local) {
    return 1;
  }

  return Math.min(MOST_SHARDS, Math.max(1, Math.ceil(tests / TESTS_PER_SHARD)));
}
