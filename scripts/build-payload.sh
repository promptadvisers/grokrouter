#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_ROOT="$PROJECT_ROOT/build"
VERSION="$(cd "$PROJECT_ROOT" && node -p "require('./package.json').version")"
STAGE_ROOT="$(mktemp -d -t grokbot-router-payload.XXXXXX)"
PAYLOAD_ROOT="$STAGE_ROOT/grokbot-router-payload"

if command -v shasum >/dev/null 2>&1; then
  SHA256_PROGRAM="shasum"
  SHA256_ARGUMENTS=(-a 256)
elif command -v sha256sum >/dev/null 2>&1; then
  SHA256_PROGRAM="sha256sum"
  SHA256_ARGUMENTS=()
else
  printf 'ERROR: shasum or sha256sum is required\n' >&2
  exit 1
fi

cleanup() {
  rm -rf "$STAGE_ROOT"
}
trap cleanup EXIT

mkdir -p "$BUILD_ROOT" "$PAYLOAD_ROOT/runtime" "$PAYLOAD_ROOT/patch/manifests" "$PAYLOAD_ROOT/remote" "$PAYLOAD_ROOT/skills" "$PAYLOAD_ROOT/compatibility"
cp "$PROJECT_ROOT/runtime/run-provider.mjs" "$PAYLOAD_ROOT/runtime/run-provider.mjs"
cp "$PROJECT_ROOT/runtime/package.json" "$PAYLOAD_ROOT/runtime/package.json"
cp "$PROJECT_ROOT/runtime/package-lock.json" "$PAYLOAD_ROOT/runtime/package-lock.json"
cp "$PROJECT_ROOT/runtime/provider.default.json" "$PAYLOAD_ROOT/runtime/provider.default.json"
cp "$PROJECT_ROOT/patch/router_patch.py" "$PAYLOAD_ROOT/patch/router_patch.py"
cp "$PROJECT_ROOT/patch/previous_adapter.py" "$PAYLOAD_ROOT/patch/previous_adapter.py"
cp "$PROJECT_ROOT/patch/manifests/"*.json "$PAYLOAD_ROOT/patch/manifests/"
cp "$PROJECT_ROOT/compatibility/"*.json "$PROJECT_ROOT/compatibility/"*.sig "$PROJECT_ROOT/compatibility/registry-public-key.pem" "$PAYLOAD_ROOT/compatibility/"
cp "$PROJECT_ROOT/remote/install.sh" "$PAYLOAD_ROOT/remote/install.sh"
cp "$PROJECT_ROOT/remote/grokbot-router" "$PAYLOAD_ROOT/remote/grokbot-router"
cp "$PROJECT_ROOT/remote/grokbot-router-watchdog" "$PAYLOAD_ROOT/remote/grokbot-router-watchdog"
cp "$PROJECT_ROOT/remote/host-registry" "$PAYLOAD_ROOT/remote/host-registry"
cp "$PROJECT_ROOT/remote/verify-host-registry.mjs" "$PAYLOAD_ROOT/remote/verify-host-registry.mjs"
cp -R "$PROJECT_ROOT/skills/." "$PAYLOAD_ROOT/skills/"
chmod 700 "$PAYLOAD_ROOT/remote/install.sh" "$PAYLOAD_ROOT/remote/grokbot-router" "$PAYLOAD_ROOT/remote/grokbot-router-watchdog" "$PAYLOAD_ROOT/remote/host-registry" "$PAYLOAD_ROOT/remote/verify-host-registry.mjs" "$PAYLOAD_ROOT/patch/router_patch.py"
printf '%s\n' "$VERSION" > "$PAYLOAD_ROOT/VERSION"

(
  cd "$PAYLOAD_ROOT"
  while IFS= read -r -d '' payload_file; do
    "$SHA256_PROGRAM" "${SHA256_ARGUMENTS[@]}" "$payload_file"
  done < <(find . -type f ! -name SHA256SUMS -print0 | sort -z) \
    > SHA256SUMS
)

ARCHIVE="$BUILD_ROOT/grokbot-router-payload-${VERSION}.tgz"
tar -czf "$ARCHIVE" -C "$STAGE_ROOT" grokbot-router-payload
(
  cd "$PROJECT_ROOT"
  "$SHA256_PROGRAM" "${SHA256_ARGUMENTS[@]}" "build/$(basename "$ARCHIVE")"
) > "$ARCHIVE.sha256"
printf '%s\n' "$ARCHIVE"
