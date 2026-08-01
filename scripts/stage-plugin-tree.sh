#!/usr/bin/env bash
#
# Stage the deployable plugin tree at <dest>/<slug>/ and print its entries, one
# archive-style path per line, ready to pipe into check-plugin-zip-content.mjs.
#
#   bash stage-plugin-tree.sh <slug> <dest-dir>
#
# EXTRA_EXCLUDES (env, newline-separated) appends project-specific rsync
# patterns to the shared list next to this script.
#
# Both the release workflow and the PR workflow stage through here, so what CI
# inspects on a pull request is the same tree the release actually zips. That is
# the whole point: a file that would leak into a release is caught at review
# time rather than at tag time, when the only fix is another tag.

set -euo pipefail

SLUG="${1:?usage: stage-plugin-tree.sh <slug> <dest-dir>}"
DEST="${2:?usage: stage-plugin-tree.sh <slug> <dest-dir>}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

EXCLUDES="$(mktemp)"
trap 'rm -f "$EXCLUDES"' EXIT
cat "$HERE/plugin-zip-excludes.txt" > "$EXCLUDES"
if [ -n "${EXTRA_EXCLUDES:-}" ]; then
	printf '%s\n' "$EXTRA_EXCLUDES" >> "$EXCLUDES"
fi

rm -rf "${DEST:?}/$SLUG"
mkdir -p "$DEST/$SLUG"
rsync -a --exclude-from="$EXCLUDES" ./ "$DEST/$SLUG/"

# Archive-style paths: <slug>/… , exactly what `unzip -Z1` prints for the built
# artifact, so the content check sees one input shape from either caller.
( cd "$DEST" && find "$SLUG" -mindepth 1 -type f | sort )
