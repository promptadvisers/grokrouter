#!/usr/bin/env bash
set -euo pipefail

REPOSITORY="promptadvisers/grokrouter"
SOURCE_REF="source-v0.1.0-beta.47"
SOURCE_ROOT=""
TEMP_SOURCE=""

cleanup() {
  if [[ -n "$TEMP_SOURCE" && -d "$TEMP_SOURCE" ]]; then
    rm -rf "$TEMP_SOURCE"
  fi
}
trap cleanup EXIT

fail() {
  printf '\nGrokRouter could not be installed: %s\n' "$1" >&2
  exit 1
}

if [[ "$(uname -s)" != "Darwin" ]]; then
  fail "this installer supports macOS only"
fi

if [[ "$(uname -m)" != "arm64" ]]; then
  fail "GrokRouter currently supports Apple silicon Macs only"
fi

SCRIPT_PATH="${BASH_SOURCE[0]:-}"
SCRIPT_DIR=""
if [[ -n "$SCRIPT_PATH" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" 2>/dev/null && pwd || true)"
fi
if [[ -n "$SCRIPT_DIR" && -f "$SCRIPT_DIR/../installer/GrokBotRouterInstaller.swift" ]]; then
  SOURCE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
else
  TEMP_SOURCE="$(mktemp -d -t grokrouter-source.XXXXXX)"
  ARCHIVE="$TEMP_SOURCE/grokrouter.tar.gz"
  printf 'Downloading GrokRouter source from GitHub...\n'
  /usr/bin/curl --fail --silent --show-error --location \
    "https://github.com/$REPOSITORY/archive/refs/tags/$SOURCE_REF.tar.gz" \
    --output "$ARCHIVE"
  /usr/bin/tar -xzf "$ARCHIVE" -C "$TEMP_SOURCE"
  SOURCE_ROOT="$(find "$TEMP_SOURCE" -mindepth 1 -maxdepth 1 -type d -name 'grokrouter-*' -print -quit)"
fi

[[ -n "$SOURCE_ROOT" && -f "$SOURCE_ROOT/installer/GrokBotRouterInstaller.swift" ]] \
  || fail "the source archive was incomplete"

if ! /usr/bin/xcode-select -p >/dev/null 2>&1 || ! command -v swiftc >/dev/null 2>&1; then
  printf '\nApple Command Line Tools are required to build GrokRouter from source.\n'
  printf 'macOS will open Apple\047s installer now. When it finishes, run this GrokRouter command again.\n\n'
  /usr/bin/xcode-select --install 2>/dev/null || true
  exit 2
fi

[[ -d "/Applications/Grok Bot.app" ]] \
  || fail "install Grok Bot 0.30.0 in Applications first"

printf 'Building GrokRouter locally from the version-pinned source...\n'
ROUTER_BUILD_APP_ONLY=1 /bin/bash "$SOURCE_ROOT/scripts/build-macos-app.sh" >/dev/null

USER_APPLICATIONS="${GROKROUTER_APPLICATIONS_DIR:-$HOME/Applications}"
DESTINATION="$USER_APPLICATIONS/GrokRouter.app"
/bin/mkdir -p "$USER_APPLICATIONS"

if [[ -e "$DESTINATION" ]]; then
  TRASH_ROOT="$HOME/.Trash"
  BACKUP="$TRASH_ROOT/GrokRouter previous $(/bin/date +%Y%m%d-%H%M%S).app"
  /bin/mkdir -p "$TRASH_ROOT"
  /bin/mv "$DESTINATION" "$BACKUP"
  printf 'Moved the previous GrokRouter app to the Trash.\n'
fi

/usr/bin/ditto "$SOURCE_ROOT/build/GrokRouter.app" "$DESTINATION"
/usr/bin/codesign --verify --deep --strict "$DESTINATION"

if [[ "${GROKROUTER_NO_OPEN:-0}" != "1" ]]; then
  printf '\nGrokRouter is installed in your Applications folder. Opening it now...\n'
  /usr/bin/open "$DESTINATION"
else
  printf '\nGrokRouter is installed in the test Applications folder.\n'
fi
