#!/bin/bash
# check-line-limit.sh - fail if any hand-written source file exceeds the limit.
#
# Usage:
#   scripts/check-line-limit.sh            # scan the repo source set (CI)
#   scripts/check-line-limit.sh FILE...    # check only the given files (local hook)
#
# Override the cap with LINE_LIMIT (default 800).
set -euo pipefail

LIMIT="${LINE_LIMIT:-800}"

# Folders this check never governs, even when the file matches the source set.
# Substring match, so 'src/data/' skips everything beneath it.
EXCLUDE_DIRS=(
  'node_modules/'   # vendored
  '/fixtures/'      # test data
)

# Is PATH one of the source files this check governs? Extend when a new
# hand-written source tree appears. Tests are deliberately out of scope: a case
# table split across files costs more than the cohesion it buys.
is_source() {
  local f="$1" ex
  case "$f" in
    frontend/src/*.ts | frontend/src/*.tsx) ;;
    fastapi/app/*.py | fastapi/scripts/*.py) ;;
    scripts/*.py | scripts/*.sh) ;;
    *) return 1 ;;
  esac
  for ex in ${EXCLUDE_DIRS[@]+"${EXCLUDE_DIRS[@]}"}; do
    [[ "$f" == *"$ex"* ]] && return 1
  done
  return 0
}

# The full governed set, for the no-argument (CI) scan.
collect_default() {
  git ls-files
}

files=()
if [[ $# -gt 0 ]]; then
  for f in "$@"; do is_source "$f" && [[ -f "$f" ]] && files+=("$f"); done
else
  while IFS= read -r f; do is_source "$f" && [[ -f "$f" ]] && files+=("$f"); done < <(collect_default)
fi

status=0
checked=0
for f in "${files[@]:-}"; do
  [[ -z "$f" ]] && continue
  checked=$((checked + 1))
  n=$(wc -l <"$f")
  if ((n > LIMIT)); then
    printf 'LINE LIMIT: %s has %d lines (max %d)\n' "$f" "$n" "$LIMIT" >&2
    status=1
  fi
done

if ((status != 0)); then
  printf '\nSplit the file(s) above into focused modules.\n' >&2
  exit 1
fi
printf 'line-limit OK (<= %d lines): %d files checked\n' "$LIMIT" "$checked"
