#!/usr/bin/env bash
set -euo pipefail

# Bump @version for staged userscript files so Tampermonkey auto-update sees a new version.
mapfile -t staged_files < <(git diff --cached --name-only --diff-filter=ACMR | rg '\.(user\.js|js)$' || true)

if [[ ${#staged_files[@]} -eq 0 ]]; then
  exit 0
fi

bumped_count=0

for file in "${staged_files[@]}"; do
  [[ -f "$file" ]] || continue

  if ! rg -q '^// ==UserScript==$' "$file"; then
    continue
  fi

  version_line=$(rg -n '^// @version[[:space:]]+' "$file" | head -n1 || true)
  if [[ -z "$version_line" ]]; then
    continue
  fi

  line_no=${version_line%%:*}
  line_text=${version_line#*:}
  current_version=$(sed -E 's|^// @version[[:space:]]+||' <<< "$line_text" | xargs)

  if [[ ! "$current_version" =~ ^[0-9]+(\.[0-9]+)*$ ]]; then
    echo "skip $file: non-numeric version '$current_version'"
    continue
  fi

  IFS='.' read -r -a parts <<< "$current_version"
  last_index=$((${#parts[@]} - 1))
  parts[$last_index]=$((parts[$last_index] + 1))

  new_version="${parts[0]}"
  for ((i=1; i<${#parts[@]}; i++)); do
    new_version+=".${parts[$i]}"
  done

  new_line="// @version      $new_version"
  sed -i "${line_no}s|.*|$new_line|" "$file"
  git add "$file"

  echo "bumped $file: $current_version -> $new_version"
  bumped_count=$((bumped_count + 1))
done

if [[ $bumped_count -gt 0 ]]; then
  echo "Auto-bumped @version in $bumped_count file(s)."
fi
