#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_ROOT="$PROJECT_ROOT/build"
VERSION="$(cd "$PROJECT_ROOT" && node -p "require('./package.json').version")"
ARCH="${1:-x64}"

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

if [[ "$ARCH" != "x64" && "$ARCH" != "arm64" ]]; then
  printf 'ERROR: Windows architecture must be x64 or arm64\n' >&2
  exit 2
fi
if [[ "${ROUTER_WINDOWS_REQUIRE_SIGNING:-0}" == "1" \
  && ( -z "${ROUTER_WINDOWS_SIGN_PFX:-}" || -z "${ROUTER_WINDOWS_SIGN_PASSWORD:-}" ) ]]; then
  printf 'ERROR: release mode requires ROUTER_WINDOWS_SIGN_PFX and ROUTER_WINDOWS_SIGN_PASSWORD\n' >&2
  exit 1
fi

STAGE_ROOT="$(mktemp -d -t grokrouter-windows.XXXXXX)"
cleanup() {
  rm -rf "$STAGE_ROOT"
}
trap cleanup EXIT

PAYLOAD="$(bash "$PROJECT_ROOT/scripts/build-payload.sh")"
mkdir -p "$STAGE_ROOT/assets/grokrouter-native-skills" "$BUILD_ROOT/windows"
cp "$PROJECT_ROOT/installer-windows/package.json" "$STAGE_ROOT/package.json"
cp "$PROJECT_ROOT/installer-windows/package-lock.json" "$STAGE_ROOT/package-lock.json"
cp "$PROJECT_ROOT/installer-windows/main.cjs" "$STAGE_ROOT/main.cjs"
cp "$PROJECT_ROOT/installer-windows/preload.cjs" "$STAGE_ROOT/preload.cjs"
cp "$PROJECT_ROOT/installer-windows/index.html" "$STAGE_ROOT/index.html"
cp "$PROJECT_ROOT/installer-windows/styles.css" "$STAGE_ROOT/styles.css"
cp "$PROJECT_ROOT/installer-windows/renderer.js" "$STAGE_ROOT/renderer.js"
cp "$PROJECT_ROOT/installer-windows/assets/grokrouter-mascot.png" "$STAGE_ROOT/assets/grokrouter-mascot.png"
cp "$PROJECT_ROOT/installer/Assets/AppIcon.ico" "$STAGE_ROOT/assets/AppIcon.ico"
cp "$PAYLOAD" "$STAGE_ROOT/assets/grokbot-router-payload.tgz"
cp "$PROJECT_ROOT/installer/native-workflow-registration.js" "$STAGE_ROOT/assets/native-workflow-registration.js"
cp -R "$PROJECT_ROOT/skills/." "$STAGE_ROOT/assets/grokrouter-native-skills/"

# Keep the source image available for development, but inline it in release
# packages. This avoids a broken hero image when Windows extraction, antivirus,
# or Electron file-URL handling separates the HTML from its relative asset.
ROUTER_WINDOWS_HTML="$STAGE_ROOT/index.html" \
ROUTER_WINDOWS_MASCOT="$STAGE_ROOT/assets/grokrouter-mascot.png" \
node <<'NODE'
const fs = require("node:fs");
const htmlPath = process.env.ROUTER_WINDOWS_HTML;
const mascotPath = process.env.ROUTER_WINDOWS_MASCOT;
const marker = 'src="assets/grokrouter-mascot.png"';
const html = fs.readFileSync(htmlPath, "utf8");
if (html.split(marker).length !== 2) throw new Error("Windows mascot marker must occur exactly once.");
const encoded = fs.readFileSync(mascotPath).toString("base64");
fs.writeFileSync(htmlPath, html.replace(marker, `src="data:image/png;base64,${encoded}"`));
NODE

(cd "$STAGE_ROOT" && npm ci --ignore-scripts --no-audit --no-fund)
rm -rf "$BUILD_ROOT/windows/GrokRouter-win32-$ARCH"
"$STAGE_ROOT/node_modules/.bin/electron-packager" \
  "$STAGE_ROOT" \
  GrokRouter \
  --platform=win32 \
  --arch="$ARCH" \
  --electron-version="$(cd "$STAGE_ROOT" && node -p "require('./package.json').devDependencies.electron")" \
  --app-version="$VERSION" \
  --icon="$STAGE_ROOT/assets/AppIcon.ico" \
  --no-asar \
  --out="$BUILD_ROOT/windows" \
  --overwrite \
  --prune=true

APP_ROOT="$BUILD_ROOT/windows/GrokRouter-win32-$ARCH"
[[ -f "$APP_ROOT/GrokRouter.exe" ]]
if [[ -n "${ROUTER_WINDOWS_SIGN_PFX:-}" ]]; then
  if [[ -z "${ROUTER_WINDOWS_SIGN_PASSWORD:-}" ]]; then
    printf 'ERROR: ROUTER_WINDOWS_SIGN_PASSWORD is required with ROUTER_WINDOWS_SIGN_PFX\n' >&2
    exit 1
  fi
  if ! command -v powershell.exe >/dev/null 2>&1 || ! command -v cygpath >/dev/null 2>&1; then
    printf 'ERROR: Authenticode signing must run on Windows\n' >&2
    exit 1
  fi
  ROUTER_WINDOWS_SIGN_TARGET="$(cygpath -w "$APP_ROOT")" \
    powershell.exe -NoLogo -NoProfile -NonInteractive \
      -ExecutionPolicy Bypass \
      -File "$(cygpath -w "$PROJECT_ROOT/scripts/sign-windows.ps1")"
fi
ZIP_PATH="$BUILD_ROOT/grokrouter-${VERSION}-windows-${ARCH}.zip"
rm -f "$ZIP_PATH" "$ZIP_PATH.sha256"
if command -v 7z >/dev/null 2>&1; then
  (cd "$(dirname "$APP_ROOT")" && 7z a -tzip -mx=7 "$ZIP_PATH" "$(basename "$APP_ROOT")" >/dev/null)
elif command -v powershell.exe >/dev/null 2>&1; then
  WINDOWS_APP_ROOT="$(cygpath -w "$APP_ROOT")"
  WINDOWS_ZIP_PATH="$(cygpath -w "$ZIP_PATH")"
  powershell.exe -NoLogo -NoProfile -NonInteractive -Command \
    "Compress-Archive -LiteralPath '$WINDOWS_APP_ROOT' -DestinationPath '$WINDOWS_ZIP_PATH' -CompressionLevel Optimal -Force"
elif command -v zip >/dev/null 2>&1; then
  (cd "$(dirname "$APP_ROOT")" && COPYFILE_DISABLE=1 zip -qry "$ZIP_PATH" "$(basename "$APP_ROOT")")
elif command -v ditto >/dev/null 2>&1; then
  ditto -c -k --norsrc --keepParent "$APP_ROOT" "$ZIP_PATH"
else
  printf 'ERROR: 7z, PowerShell, zip, or ditto is required to create the Windows archive\n' >&2
  exit 1
fi
(
  cd "$BUILD_ROOT"
  "$SHA256_PROGRAM" "${SHA256_ARGUMENTS[@]}" "$(basename "$ZIP_PATH")"
) > "$ZIP_PATH.sha256"

SETUP_PATH="$BUILD_ROOT/grokrouter-${VERSION}-windows-${ARCH}-setup.exe"
rm -f "$SETUP_PATH" "$SETUP_PATH.sha256"
if command -v powershell.exe >/dev/null 2>&1 && command -v cygpath >/dev/null 2>&1; then
  if [[ "${ROUTER_WINDOWS_BUILD_SETUP:-0}" == "1" || "${ROUTER_WINDOWS_REQUIRE_SETUP:-0}" == "1" ]]; then
    ROUTER_WINDOWS_APP_ROOT="$(cygpath -w "$APP_ROOT")" \
      ROUTER_WINDOWS_ARCH="$ARCH" \
      ROUTER_WINDOWS_SETUP_OUTPUT="$(cygpath -w "$SETUP_PATH")" \
      powershell.exe -NoLogo -NoProfile -NonInteractive \
        -ExecutionPolicy Bypass \
        -File "$(cygpath -w "$PROJECT_ROOT/scripts/build-windows-setup.ps1")"

    if [[ -n "${ROUTER_WINDOWS_SIGN_PFX:-}" ]]; then
      ROUTER_WINDOWS_SIGN_TARGET="$(cygpath -w "$SETUP_PATH")" \
        powershell.exe -NoLogo -NoProfile -NonInteractive \
          -ExecutionPolicy Bypass \
          -File "$(cygpath -w "$PROJECT_ROOT/scripts/sign-windows.ps1")"
    fi

    (
      cd "$BUILD_ROOT"
      "$SHA256_PROGRAM" "${SHA256_ARGUMENTS[@]}" "$(basename "$SETUP_PATH")"
    ) > "$SETUP_PATH.sha256"
  fi
elif [[ "${ROUTER_WINDOWS_REQUIRE_SETUP:-0}" == "1" ]]; then
  printf 'ERROR: the public Windows release requires a native Windows setup build\n' >&2
  exit 1
fi

printf '%s\n' "$APP_ROOT" "$ZIP_PATH"
if [[ -f "$SETUP_PATH" ]]; then
  printf '%s\n' "$SETUP_PATH"
fi
