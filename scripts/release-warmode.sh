#!/usr/bin/env bash
set -euo pipefail

# One-command release helper for warmode userscript:
# - stages warmode.js
# - commits with a provided/default message
# - pushes to origin (unless --no-push)
# - verifies local and remote @version

usage() {
  cat <<'EOF'
Usage: scripts/release-warmode.sh [options]

Options:
  -m, --message TEXT   Commit message (default: warmode update)
  -f, --file PATH      Userscript file (default: warmode.js)
      --no-push        Commit only, skip push
  -h, --help           Show this help

Examples:
  scripts/release-warmode.sh -m "wm 1.1.3"
  scripts/release-warmode.sh --no-push
EOF
}

commit_message="warmode update"
script_file="warmode.js"
do_push=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--message)
      shift
      commit_message="${1:-}"
      ;;
    -f|--file)
      shift
      script_file="${1:-}"
      ;;
    --no-push)
      do_push=0
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift || true
done

if [[ -z "$commit_message" ]]; then
  echo "Commit message cannot be empty." >&2
  exit 1
fi

if ! git rev-parse --show-toplevel >/dev/null 2>&1; then
  echo "Not inside a git repository." >&2
  exit 1
fi

repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"

if [[ ! -f "$script_file" ]]; then
  echo "File not found: $script_file" >&2
  exit 1
fi

if ! sed 's/\r$//' "$script_file" | grep -q '^// ==UserScript==$'; then
  echo "Not a userscript header file: $script_file" >&2
  exit 1
fi

local_version=$(sed 's/\r$//' "$script_file" | grep -E '^// @version[[:space:]]+' | head -n1 | sed -E 's|^// @version[[:space:]]+||' | xargs)
if [[ -z "$local_version" ]]; then
  echo "Could not read local @version from $script_file" >&2
  exit 1
fi

git add "$script_file"

if git diff --cached --quiet; then
  echo "No staged changes for $script_file."
  echo "Local version:  $local_version"
  exit 0
fi

git commit -m "$commit_message"

if [[ $do_push -eq 1 ]]; then
  git push
fi

remote_url=$(sed 's/\r$//' "$script_file" | grep -E '^// @downloadURL[[:space:]]+' | head -n1 | sed -E 's|^// @downloadURL[[:space:]]+||' | xargs)
remote_version=""

if [[ -n "$remote_url" ]]; then
  remote_version=$(curl -fsSL "$remote_url" | sed 's/\r$//' | grep -E '^// @version[[:space:]]+' | head -n1 | sed -E 's|^// @version[[:space:]]+||' | xargs || true)
fi

echo "Release check complete"
echo "File:           $script_file"
echo "Local version:  $local_version"
if [[ -n "$remote_version" ]]; then
  echo "Remote version: $remote_version"
  if [[ "$remote_version" != "$local_version" ]]; then
    echo "Warning: remote version does not match local yet."
    echo "If you just pushed, wait a few seconds and re-run." 
  fi
else
  echo "Remote version: unavailable"
fi
