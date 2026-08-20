#!/usr/bin/env bash

# Optional local enrichment only. Repository work must not depend on this file.
second_brain_path=${SECOND_BRAIN_PATH:-}
if [ -z "$second_brain_path" ]; then
  exit 0
fi

hub_path="$second_brain_path/projects/hoshidou/index.md"
if [ ! -r "$hub_path" ]; then
  exit 0
fi

printf '%s\n' '--- Optional HOSHIDOU project context ---'
cat -- "$hub_path" || true
