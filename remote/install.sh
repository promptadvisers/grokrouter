#!/usr/bin/env bash
set -Eeuo pipefail

ROUTER_VERSION="0.1.0-beta.47"
PAYLOAD_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_ROOT="/home/box/sand-data/grokbot-router"
INSTALL_PARENT="/home/box/sand-data"
GROK_VERSION="0.30.0"
DEFAULT_PROVIDER="codex"
CODEX_MODEL="gpt-5.6-sol"
OPENROUTER_MODEL="anthropic/claude-sonnet-4.6"
ENABLED_PROVIDERS="codex,openrouter"
PROVIDER_EXPLICIT=0
PROVIDERS_EXPLICIT=0
CODEX_MODEL_EXPLICIT=0
OPENROUTER_MODEL_EXPLICIT=0
START_WATCHDOG=1
GROK_SKILLS_ROOT="${ROUTER_GROK_SKILLS_ROOT:-/home/box/.grok/skills}"
INSTALL_ATTEMPT="${ROUTER_INSTALL_ATTEMPT:-LOCAL}"
INSTALL_PHASE="OPTIONS"

if [[ ! "$INSTALL_ATTEMPT" =~ ^[A-Z0-9]{4,16}$ ]]; then
  INSTALL_ATTEMPT="LOCAL"
fi

emit_phase() {
  INSTALL_PHASE="$1"
  printf '\nGROKROUTER_%s_PHASE_%s\n' "$INSTALL_ATTEMPT" "$INSTALL_PHASE"
}

fail_install() {
  local code="$1"
  shift
  trap - ERR
  printf 'ERROR: %s\n' "$*" >&2
  printf 'GROKROUTER_%s_INSTALL_FAILED_%s_%s\n' "$INSTALL_ATTEMPT" "$INSTALL_PHASE" "$code" >&2
  exit 1
}

report_unhandled_error() {
  local status=$?
  trap - ERR
  printf '\nGROKROUTER_%s_INSTALL_FAILED_%s_COMMAND_%s\n' "$INSTALL_ATTEMPT" "$INSTALL_PHASE" "$status" >&2
  exit "$status"
}

trap report_unhandled_error ERR

usage() {
  printf '%s\n' \
    "GrokRouter installer ${ROUTER_VERSION}" \
    "" \
    "Usage: install.sh [options]" \
    "  --grok-version VERSION       Exact desktop version verified by the installer" \
    "  --provider codex|openrouter" \
    "  --providers codex|openrouter|codex,openrouter" \
    "  --codex-model MODEL" \
    "  --openrouter-model vendor/model" \
    "  --install-root PATH          Development/testing only" \
    "  --no-restart                 Do not restart the Grok host"
}

RESTART_HOST=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --grok-version)
      GROK_VERSION="${2:?missing Grok Bot version}"
      shift 2
      ;;
    --provider)
      DEFAULT_PROVIDER="${2:?missing provider}"
      PROVIDER_EXPLICIT=1
      shift 2
      ;;
    --providers)
      ENABLED_PROVIDERS="${2:?missing providers}"
      PROVIDERS_EXPLICIT=1
      shift 2
      ;;
    --codex-model)
      CODEX_MODEL="${2:?missing Codex model}"
      CODEX_MODEL_EXPLICIT=1
      shift 2
      ;;
    --openrouter-model)
      OPENROUTER_MODEL="${2:?missing OpenRouter model}"
      OPENROUTER_MODEL_EXPLICIT=1
      shift 2
      ;;
    --install-root)
      INSTALL_ROOT="${2:?missing install root}"
      INSTALL_PARENT="$(dirname "$INSTALL_ROOT")"
      START_WATCHDOG=0
      shift 2
      ;;
    --no-restart)
      RESTART_HOST=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      fail_install "UNKNOWN_OPTION" "unknown option $1"
      ;;
  esac
done

if [[ "$DEFAULT_PROVIDER" != "codex" && "$DEFAULT_PROVIDER" != "openrouter" ]]; then
  fail_install "INVALID_PROVIDER" "--provider must be codex or openrouter"
fi
if [[ ! "$OPENROUTER_MODEL" =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._:+-]+$ ]]; then
  fail_install "INVALID_OPENROUTER_MODEL" "--openrouter-model must use vendor/model format"
fi
if [[ "$ENABLED_PROVIDERS" != "codex" && "$ENABLED_PROVIDERS" != "openrouter" && "$ENABLED_PROVIDERS" != "codex,openrouter" && "$ENABLED_PROVIDERS" != "openrouter,codex" ]]; then
  fail_install "INVALID_PROVIDERS" "--providers must be codex, openrouter, or codex,openrouter"
fi

emit_phase "PREFLIGHT"
for command_name in node npm python3 sha256sum; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    fail_install "MISSING_COMMAND" "required command is missing: $command_name"
  fi
done

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if (( NODE_MAJOR < 18 )); then
  fail_install "NODE_TOO_OLD" "Node.js 18 or newer is required; found $(node -v)"
fi

mkdir -p "$INSTALL_PARENT"
STAGE_ROOT="$(mktemp -d "$INSTALL_PARENT/.grokbot-router-stage.XXXXXX")"
PREVIOUS_ROOT=""
cleanup() {
  if [[ -d "$STAGE_ROOT" ]]; then
    rm -rf "$STAGE_ROOT"
  fi
}
trap cleanup EXIT

case "$GROK_VERSION" in
  0.30.0|0.36.0) ;;
  *) fail_install "UNSUPPORTED_VERSION" "This exact Grok Bot version is unsupported" ;;
esac

emit_phase "VALIDATE_PAYLOAD"
printf '[1/6] Validating payload\n'
if [[ ! -f "$PAYLOAD_ROOT/SHA256SUMS" ]]; then
  fail_install "MISSING_MANIFEST" "payload integrity manifest is missing"
fi
(cd "$PAYLOAD_ROOT" && sha256sum -c SHA256SUMS >/dev/null)
for required in \
  "$PAYLOAD_ROOT/runtime/run-provider.mjs" \
  "$PAYLOAD_ROOT/runtime/package.json" \
  "$PAYLOAD_ROOT/runtime/package-lock.json" \
  "$PAYLOAD_ROOT/runtime/provider.default.json" \
  "$PAYLOAD_ROOT/patch/router_patch.py" \
  "$PAYLOAD_ROOT/patch/previous_adapter.py" \
  "$PAYLOAD_ROOT/patch/manifests/$GROK_VERSION.json" \
  "$PAYLOAD_ROOT/compatibility/supported-apps.json" \
  "$PAYLOAD_ROOT/compatibility/$GROK_VERSION-hosts.json" \
  "$PAYLOAD_ROOT/compatibility/$GROK_VERSION-hosts.json.sig" \
  "$PAYLOAD_ROOT/compatibility/registry-public-key.pem" \
  "$PAYLOAD_ROOT/remote/grokbot-router" \
  "$PAYLOAD_ROOT/remote/grokbot-router-watchdog" \
  "$PAYLOAD_ROOT/remote/host-registry" \
  "$PAYLOAD_ROOT/remote/verify-host-registry.mjs"; do
  if [[ ! -f "$required" ]]; then
    fail_install "INCOMPLETE_PAYLOAD" "payload is incomplete: $required"
  fi
done
for skill_name in provider models model reasoning router doctor; do
  if [[ ! -f "$PAYLOAD_ROOT/skills/$skill_name/SKILL.md" ]]; then
    fail_install "MISSING_COMMAND_DEFINITION" "payload is missing the /$skill_name native command definition"
  fi
done

emit_phase "PREPARE_RUNTIME"
printf '[2/6] Preparing isolated runtime\n'
cp "$PAYLOAD_ROOT/runtime/run-provider.mjs" "$STAGE_ROOT/run-provider.mjs"
cp "$PAYLOAD_ROOT/runtime/package.json" "$STAGE_ROOT/package.json"
cp "$PAYLOAD_ROOT/runtime/package-lock.json" "$STAGE_ROOT/package-lock.json"
cp "$PAYLOAD_ROOT/runtime/provider.default.json" "$STAGE_ROOT/provider.json"
mkdir -p "$STAGE_ROOT/patch/manifests" "$STAGE_ROOT/bin" "$STAGE_ROOT/skills" "$STAGE_ROOT/compatibility"
cp "$PAYLOAD_ROOT/patch/router_patch.py" "$STAGE_ROOT/patch/router_patch.py"
cp "$PAYLOAD_ROOT/patch/previous_adapter.py" "$STAGE_ROOT/patch/previous_adapter.py"
cp "$PAYLOAD_ROOT/patch/manifests/"*.json "$STAGE_ROOT/patch/manifests/"
cp "$PAYLOAD_ROOT/compatibility/"*.json "$PAYLOAD_ROOT/compatibility/"*.sig "$PAYLOAD_ROOT/compatibility/registry-public-key.pem" "$STAGE_ROOT/compatibility/"
cp "$PAYLOAD_ROOT/remote/grokbot-router" "$STAGE_ROOT/bin/grokbot-router"
cp "$PAYLOAD_ROOT/remote/grokbot-router-watchdog" "$STAGE_ROOT/bin/grokbot-router-watchdog"
cp "$PAYLOAD_ROOT/remote/host-registry" "$STAGE_ROOT/bin/host-registry"
cp "$PAYLOAD_ROOT/remote/verify-host-registry.mjs" "$STAGE_ROOT/bin/verify-host-registry.mjs"
cp -R "$PAYLOAD_ROOT/skills/." "$STAGE_ROOT/skills/"
chmod 700 "$STAGE_ROOT/bin/grokbot-router" "$STAGE_ROOT/bin/grokbot-router-watchdog" "$STAGE_ROOT/bin/host-registry" "$STAGE_ROOT/bin/verify-host-registry.mjs" "$STAGE_ROOT/patch/router_patch.py"

if [[ -f "$INSTALL_ROOT/provider.json" ]]; then
  cp "$INSTALL_ROOT/provider.json" "$STAGE_ROOT/provider.json"
elif [[ -f "/home/box/sand-data/grok-sdk-runtime/provider.json" ]]; then
  cp "/home/box/sand-data/grok-sdk-runtime/provider.json" "$STAGE_ROOT/provider.json"
fi

ROUTER_GROK_VERSION="$GROK_VERSION" \
ROUTER_CONFIG_PATH="$STAGE_ROOT/provider.json" \
ROUTER_DEFAULT_CONFIG_PATH="$PAYLOAD_ROOT/runtime/provider.default.json" \
ROUTER_INSTALL_ROOT="$INSTALL_ROOT" \
ROUTER_PROVIDER="$DEFAULT_PROVIDER" \
ROUTER_PROVIDER_EXPLICIT="$PROVIDER_EXPLICIT" \
ROUTER_PROVIDERS="$ENABLED_PROVIDERS" \
ROUTER_PROVIDERS_EXPLICIT="$PROVIDERS_EXPLICIT" \
ROUTER_CODEX_MODEL="$CODEX_MODEL" \
ROUTER_CODEX_MODEL_EXPLICIT="$CODEX_MODEL_EXPLICIT" \
ROUTER_OPENROUTER_MODEL="$OPENROUTER_MODEL" \
ROUTER_OPENROUTER_MODEL_EXPLICIT="$OPENROUTER_MODEL_EXPLICIT" \
python3 - <<'PY'
import json
import os
from pathlib import Path

path = Path(os.environ["ROUTER_CONFIG_PATH"])
defaults_path = Path(os.environ["ROUTER_DEFAULT_CONFIG_PATH"])
try:
    config = json.loads(path.read_text())
except Exception:
    config = {}
defaults = json.loads(defaults_path.read_text())
config["grokBotVersion"] = os.environ["ROUTER_GROK_VERSION"]
install_root = os.environ["ROUTER_INSTALL_ROOT"]
provider = os.environ["ROUTER_PROVIDER"]
if os.environ["ROUTER_PROVIDER_EXPLICIT"] != "1" and config.get("provider") in {"codex", "openrouter"}:
    provider = config["provider"]
providers = list(dict.fromkeys(os.environ["ROUTER_PROVIDERS"].split(",")))
if os.environ["ROUTER_PROVIDERS_EXPLICIT"] != "1":
    existing = config.get("providers")
    if isinstance(existing, list) and existing and all(item in {"codex", "openrouter"} for item in existing):
        providers = list(dict.fromkeys(existing))
if provider not in providers:
    providers.insert(0, provider)
codex_model = os.environ["ROUTER_CODEX_MODEL"]
if os.environ["ROUTER_CODEX_MODEL_EXPLICIT"] != "1" and isinstance(config.get("codexModel"), str):
    codex_model = config["codexModel"]
openrouter_model = os.environ["ROUTER_OPENROUTER_MODEL"]
if os.environ["ROUTER_OPENROUTER_MODEL_EXPLICIT"] != "1" and isinstance(config.get("openRouterModel"), str):
    openrouter_model = config["openRouterModel"]
config.update({
    "enabled": True,
    "autoRepair": True,
    "provider": provider,
    "providers": providers,
    "codexModel": codex_model,
    "openRouterModel": openrouter_model,
    "codexModels": defaults.get("codexModels", []),
    "openRouterModels": defaults.get("openRouterModels", []),
    "runnerPath": f"{install_root}/run-provider.mjs",
    "nodePath": "/usr/bin/node",
    "statePath": f"{install_root}/conversation-states.json",
    "auditPath": f"{install_root}/audit.jsonl",
})
path.write_text(json.dumps(config, indent=2) + "\n")
path.chmod(0o600)
PY

DEFAULT_PROVIDER="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["provider"])' "$STAGE_ROOT/provider.json")"
ENABLED_PROVIDERS="$(python3 -c 'import json,sys; print(",".join(json.load(open(sys.argv[1]))["providers"]))' "$STAGE_ROOT/provider.json")"
CODEX_MODEL="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["codexModel"])' "$STAGE_ROOT/provider.json")"
OPENROUTER_MODEL="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["openRouterModel"])' "$STAGE_ROOT/provider.json")"

emit_phase "INSTALL_DEPENDENCIES"
if [[ "$ENABLED_PROVIDERS" == *codex* ]]; then
  dependencies_reused=0
  codex_native_package=""
  case "$(node -p 'process.platform + "-" + process.arch')" in
    linux-x64) codex_native_package="codex-linux-x64" ;;
    linux-arm64) codex_native_package="codex-linux-arm64" ;;
    darwin-x64) codex_native_package="codex-darwin-x64" ;;
    darwin-arm64) codex_native_package="codex-darwin-arm64" ;;
    win32-x64) codex_native_package="codex-win32-x64" ;;
    win32-arm64) codex_native_package="codex-win32-arm64" ;;
  esac
  if [[ -f "$INSTALL_ROOT/package-lock.json" ]] \
    && cmp -s "$STAGE_ROOT/package-lock.json" "$INSTALL_ROOT/package-lock.json" \
    && [[ -f "$INSTALL_ROOT/node_modules/@openai/codex-sdk/dist/index.js" ]] \
    && [[ -x "$INSTALL_ROOT/node_modules/.bin/codex" ]] \
    && [[ -n "$codex_native_package" ]] \
    && [[ -d "$INSTALL_ROOT/node_modules/@openai/$codex_native_package" ]]; then
    printf '[3/6] Reusing the already verified pinned Codex runtime\n'
    cp -a "$INSTALL_ROOT/node_modules" "$STAGE_ROOT/node_modules"
    dependencies_reused=1
  fi
  if [[ "$dependencies_reused" == "0" ]]; then
    printf '[3/6] Downloading the pinned Codex runtime (first install only)\n'
    (cd "$STAGE_ROOT" && npm ci \
      --omit=dev \
      --ignore-scripts \
      --no-audit \
      --no-fund \
      --fetch-retries=3 \
      --fetch-retry-mintimeout=1000 \
      --fetch-retry-maxtimeout=10000 \
      --fetch-timeout=30000)
  fi
else
  printf '[3/6] OpenRouter-only setup needs no dependency download\n'
fi

# Runtime replacement must retain Bot selections, provider threads, durable
# delivery receipts, and the redacted audit. Temporary files and process locks
# belong to the previous process generation and must not survive the swap.
python3 - "$INSTALL_ROOT" "$STAGE_ROOT" <<'PYSTATE'
from pathlib import Path
import shutil, sys
source, destination = map(Path, sys.argv[1:])
for name in ("conversation-states.json", "audit.jsonl", "audit.jsonl.1"):
    existing = source / name
    if existing.is_file():
        shutil.copy2(existing, destination / name)
existing = source / "conversation-states"
if existing.is_dir():
    shutil.copytree(existing, destination / "conversation-states",
                    ignore=shutil.ignore_patterns("*.lock", "*.tmp"))
PYSTATE

emit_phase "ACTIVATE_RUNTIME"
printf '[4/6] Activating runtime atomically\n'
if [[ -e "$INSTALL_ROOT" ]]; then
  PREVIOUS_ROOT="${INSTALL_ROOT}.previous.$(date +%s)"
  mv "$INSTALL_ROOT" "$PREVIOUS_ROOT"
fi
mv "$STAGE_ROOT" "$INSTALL_ROOT"
STAGE_ROOT=""

rollback_runtime() {
  if [[ -d "$INSTALL_ROOT" ]]; then
    rm -rf "$INSTALL_ROOT"
  fi
  if [[ -n "$PREVIOUS_ROOT" && -d "$PREVIOUS_ROOT" ]]; then
    mv "$PREVIOUS_ROOT" "$INSTALL_ROOT"
  fi
}

emit_phase "APPLY_ADAPTER"
printf '[5/6] Applying version-gated host adapter\n'
PATCH_HOST="${ROUTER_PATCH_HOST:-/home/box/sand-host/host-main.cjs}"
PATCH_BACKUP="${ROUTER_PATCH_BACKUP:-/home/box/sand-data/grokbot-router-backup/host-main.cjs.stock}"
PATCH_MANIFEST="${ROUTER_PATCH_MANIFEST:-$INSTALL_ROOT/patch/manifests/$GROK_VERSION.json}"
PATCH_ARGS=(
  --host "$PATCH_HOST"
  --backup "$PATCH_BACKUP"
  --manifest "$PATCH_MANIFEST"
  --json
)
if [[ "${ROUTER_ALLOW_UNKNOWN_HOST:-0}" == "1" ]]; then
  PATCH_ARGS+=(--allow-unknown-host)
fi
ACTIVE_REGISTRY=""
if CACHED_REGISTRY="$("$INSTALL_ROOT/bin/host-registry" verify 2>/dev/null || true)" && [[ -n "$CACHED_REGISTRY" ]]; then
  ACTIVE_REGISTRY="$CACHED_REGISTRY"
fi
run_adapter_patch() {
  if [[ -n "$ACTIVE_REGISTRY" ]]; then
    python3 "$INSTALL_ROOT/patch/router_patch.py" "${PATCH_ARGS[@]}" --host-registry "$ACTIVE_REGISTRY"
  else
    python3 "$INSTALL_ROOT/patch/router_patch.py" "${PATCH_ARGS[@]}"
  fi
}
if ! ADAPTER_OUTPUT="$(run_adapter_patch 2>&1)"; then
  printf 'The bundled compatibility list did not recognize this Bot computer. Checking for a signed update…\n'
  if UPDATED_REGISTRY="$("$INSTALL_ROOT/bin/host-registry" refresh 2>/dev/null || true)" && [[ -n "$UPDATED_REGISTRY" ]]; then
    ACTIVE_REGISTRY="$UPDATED_REGISTRY"
  fi
  if ! ADAPTER_OUTPUT="$(run_adapter_patch 2>&1)"; then
    printf '%s\n' "$ADAPTER_OUTPUT" >&2
    rollback_runtime
    fail_install "NEW_STOCK_HOST" "This Bot computer's host did not pass the stock-host checks, so nothing was patched. Copy safe diagnostics; the complete host fingerprint is included."
  fi
fi
printf '%s\n' "$ADAPTER_OUTPUT"
# Structural diagnostics never authorize a host. Only the exact reviewed
# hash/size pair is accepted in a normal installation.
case "$ADAPTER_OUTPUT" in
  *'"stockTrust": "exact-allowlist"'*)
    printf 'Host accepted from the exact signed compatibility list; stock backup saved.\n'
    ;;
esac

# Beta.40 incorrectly treated loose ~/.grok/skills links as native slash-menu
# registration. Grok 0.30.0 actually reads a per-Bot workflow store. The
# desktop installer owns that official registration step; remove only the
# obsolete links created by older GrokRouter builds and preserve user content.
mkdir -p "$GROK_SKILLS_ROOT"
for skill_name in provider models model reasoning router doctor; do
  skill_source="$INSTALL_ROOT/skills/$skill_name"
  skill_link="$GROK_SKILLS_ROOT/$skill_name"
  if [[ -L "$skill_link" && "$(readlink "$skill_link")" == "$skill_source" ]]; then
    rm "$skill_link"
  fi
done

ROUTER_BIN_DIR="${ROUTER_BIN_DIR:-/home/box/.local/bin}"
mkdir -p "$ROUTER_BIN_DIR"
ln -sfn "$INSTALL_ROOT/bin/grokbot-router" "$ROUTER_BIN_DIR/grokbot-router"
if [[ "$ROUTER_BIN_DIR" == "/home/box/.local/bin" ]]; then
  if [[ -w "/usr/local/bin" ]]; then
    ln -sfn "$INSTALL_ROOT/bin/grokbot-router" "/usr/local/bin/grokbot-router"
  elif command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
    sudo -n ln -sfn "$INSTALL_ROOT/bin/grokbot-router" "/usr/local/bin/grokbot-router"
  else
    printf 'WARNING: use /home/box/.local/bin/grokbot-router because /usr/local/bin is not writable\n' >&2
  fi
fi

emit_phase "VERIFY_INSTALL"
printf '[6/6] Final verification\n'
node --check "$INSTALL_ROOT/run-provider.mjs"
if [[ -n "$ACTIVE_REGISTRY" ]]; then
  python3 "$INSTALL_ROOT/patch/router_patch.py" --doctor "${PATCH_ARGS[@]}" --host-registry "$ACTIVE_REGISTRY"
else
  python3 "$INSTALL_ROOT/patch/router_patch.py" --doctor "${PATCH_ARGS[@]}"
fi

# Grok can replace the live host when it provisions a different Bot computer.
# Keep the exact-hash/anchor gates authoritative and repair only a known stock
# host. The watchdog also installs an XDG autostart entry so it returns when the
# persisted Bot desktop is recreated.
if [[ "$START_WATCHDOG" == "1" ]]; then
  WATCHDOG_PID_FILE="$INSTALL_PARENT/grokbot-router-watchdog.pid"
  if [[ -f "$WATCHDOG_PID_FILE" ]]; then
    OLD_WATCHDOG_PID="$(cat "$WATCHDOG_PID_FILE" 2>/dev/null || true)"
    if [[ "$OLD_WATCHDOG_PID" =~ ^[0-9]+$ ]]; then
      kill "$OLD_WATCHDOG_PID" >/dev/null 2>&1 || true
    fi
  fi
  mkdir -p /home/box/.config/autostart
  cat > /home/box/.config/autostart/grokbot-router-watchdog.desktop <<EOF
[Desktop Entry]
Type=Application
Name=GrokRouter Watchdog
Exec=$INSTALL_ROOT/bin/grokbot-router-watchdog
X-GNOME-Autostart-enabled=true
NoDisplay=true
EOF
  nohup "$INSTALL_ROOT/bin/grokbot-router-watchdog" \
    >"$INSTALL_PARENT/grokbot-router-watchdog.log" 2>&1 &
  printf '%s\n' "$!" > "$WATCHDOG_PID_FILE"
fi

ROUTER_INSTALL_ROOT="$INSTALL_ROOT" python3 - <<'PY'
import os
import shutil
from pathlib import Path

install_root = Path(os.environ["ROUTER_INSTALL_ROOT"])
backups = sorted(
    install_root.parent.glob(f"{install_root.name}.previous.*"),
    key=lambda candidate: candidate.stat().st_mtime_ns,
    reverse=True,
)
for stale in backups[2:]:
    if stale.is_dir():
        shutil.rmtree(stale)
PY

emit_phase "COMPLETE"
printf '\nGROKBOT_ROUTER_INSTALL_OK\n'
printf 'Version: %s\n' "$ROUTER_VERSION"
printf 'Default provider: %s\n' "$DEFAULT_PROVIDER"
printf 'Enabled providers: %s\n' "$ENABLED_PROVIDERS"
if [[ "$ENABLED_PROVIDERS" == *codex* ]]; then
  printf 'Next: run grokbot-router auth codex, then complete the device sign-in.\n'
fi
if [[ "$ENABLED_PROVIDERS" == *openrouter* ]]; then
  printf 'OpenRouter uses the OPENROUTER_API_KEY saved through Grok Bot Secrets.\n'
fi
printf 'In Grok Bot chat, send /router doctor after the host reconnects.\n'

# Let the terminal display the real completion marker before the host restart
# tears down the current noVNC target. This prevents a successful install from
# looking like a transport failure to the Mac installer.
if [[ "$RESTART_HOST" == "1" ]]; then
  nohup sh -c "sleep 3; pkill -f '/home/box/sand-host/host-main.cjs' >/dev/null 2>&1 || true" \
    >/dev/null 2>&1 &
fi
