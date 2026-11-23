# Runner mode

How Foundation's rules apply when the **Forge Runner** builds a Forge card with
nobody watching.

The Forge Runner runs on Luke's PC. It takes cards from Forge's **Up next** that
belong to the **Agent**, starts a Claude Code agent for each one, opens the pull
request itself, and hands the card back for Luke to approve. An agent started
this way is in runner mode. Nobody else is: a normal session follows
`CLAUDE.md` exactly as written.

Everything in `CLAUDE.md` still applies in runner mode, except the lines below.
Where a project's own `CLAUDE.md` disagrees with Foundation, the project's wins,
as always.

## What changes

| The usual rule | In runner mode |
|---|---|
| Every change starts from an approved GitHub Issue | The Forge card is the approval. Luke approves it by putting it in Up next for the Agent. Forge links the card to its GitHub Issue, and the pull request names the card. |
| Brainstorm with Luke before any feature | The card replaces the brainstorm. The agent writes a short plan and starts. It never waits for a person. |
| Ask before fixing lint findings | Lint runs once, at the end. The agent fixes problems in the code it wrote for this card and lists the rest for Luke. |
| Request a code review, then finish the branch | Codex reviews the pull request on the PC. The runner finishes the branch. The agent uses neither skill. |
| Deploy steps at the end of a session | The agent bumps the version and adds the changelog entry. Nothing else: no build for zipping, no zip, no tag. |
| Ask Luke before every Claude Design push | The agent never pushes to Claude Design or Figma. It says what needs syncing, and Luke does it. |
| The model is picked per task by a person | The runner picks it from Model Guidance: Sonnet by default, Opus or Fable only when the card says so, or for project-level work. |

## What stays exactly the same

- Tests first for a feature or a bug fix, the root cause before a bug fix, and the
  security review before a sensitive change.
- Every hard guardrail: lint, build, version bump, changelog, approved
  dependencies, a Playwright test for new functionality, and admin screens from
  the design system.
- Never weaken or skip a test to make it pass. A skipped test is not a pass.
- Short and plain in everything written: commits, pull requests and Forge comments.
- Say what was not tested, every time.

## What an agent never does

- Push, merge, tag, release, deploy or publish. The runner pushes the branch and
  opens the pull request. Luke approves every merge, and the runner merges only
  after his click.
- Change a Forge card's status, hours or fields. It may add an internal comment.
- Add a dependency or a WordPress plugin that is not already approved. It stops
  and asks.
- Change `.github/workflows`. It says what is needed and leaves it to Luke.
- Touch a live site, read a password, token, key or `.env` file, or start
  another agent.
- Work outside its own task folder.

If the card does not cover something only Luke can decide, the agent commits what
it has and asks one plain question. It does not guess.

## Version and changelog

One version bump and one changelog entry for each pull request, not for each
commit. Fixes made after a review do not bump the version again.

Use a file in `changelog.d/` when the project has that folder, so two open pull
requests never edit the same lines.

## Testing several cards at once

Each agent works in its own folder and gets its own port for the local WordPress
test site, from 8891 up. Port 8881 is left for a person. Pass the port to `up`
and to `down`. See "Running several test sites at once" in
[`wordpress-test-harness.md`](wordpress-test-harness.md).

When a project's whole suite would take longer than about 30 minutes on one
worker, the agent runs the tests for what it changed and says so. The checks on
the pull request run the whole suite, and the runner waits for them.

## One card per project at a time

The runner builds one card per project at a time, and holds that project's next
card until Luke has merged or closed the open pull request. Two open pull
requests in one project would both bump to the same version.

## Recording time

The runner records the real working time on the Forge card when it hands over,
in place of the assumed hours from triage, because it counts towards the
client's hours. It counts building, testing, checking and fixing. It never counts
waiting in the queue, waiting for checks, waiting for an answer, or a pause at
the plan limit.
