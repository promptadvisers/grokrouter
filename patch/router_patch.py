#!/usr/bin/env python3
"""Version-gated, reversible Grok Bot host adapter patch.

This file contains only an original transformation. It never bundles or copies
Grok Bot's host source into the project or release payload.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import time
from typing import Any


MARKER = "GROKBOT_MODEL_ROUTER_V45"
LEGACY_MARKER = re.compile(r"(?:GROK_SDK_ADAPTER_V[1-8]|GROKBOT_MODEL_ROUTER_V(?:9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43|44))")
DEFAULT_HOST = Path("/home/box/sand-host/host-main.cjs")
DEFAULT_BACKUP = Path("/home/box/sand-data/grokbot-router-backup/host-main.cjs.stock")
LEGACY_BACKUPS = (
    Path("/home/box/sand-host/host-main.cjs.grokbot-router.stock"),
    Path("/home/box/sand-host/host-main.cjs.grok-sdk-adapter.prepatch"),
)
DEFAULT_MANIFEST = Path(__file__).with_name("manifests") / "0.30.0.json"
# Another public router also rewrites the same host. Its marker must never be
# mistaken for a stock host, so structural verification refuses it outright.
FOREIGN_MARKER = re.compile(r"opengrok|open_grok", re.IGNORECASE)
TRUST_EXACT = "exact-allowlist"
TRUST_CACHE_SUFFIX = ".grokrouter-trust.json"


EXECUTOR_CODE = r'''
// GROKBOT_MODEL_ROUTER_V45: version-gated Codex SDK and OpenRouter executor.
function loadGrokBotRouterConfig() {
  const configPath = "/home/box/sand-data/grokbot-router/provider.json";
  try {
    const config = JSON.parse(require("node:fs").readFileSync(configPath, "utf8"));
    if (!config || config.enabled !== true) return void 0;
    return config;
  } catch (error) {
    console.error("[grokbot-router] Config unavailable; using stock inference:", error?.message || error);
    return void 0;
  }
}
function serializeGrokBotRouterTools(tools) {
  const candidates = Array.isArray(tools)
    ? tools
    : tools && typeof tools === "object"
      ? Object.values(tools)
      : [];
  return candidates.slice(0, 128).flatMap((tool) => {
    if (!tool || typeof tool !== "object") return [];
    const name = typeof tool.name === "string"
      ? tool.name.trim()
      : typeof tool.function?.name === "string"
        ? tool.function.name.trim()
        : "";
    if (!name) return [];
    const rawParameters = tool.parameters?.jsonSchema
      ?? tool.inputSchema?.jsonSchema
      ?? tool.inputSchema
      ?? tool.parameters
      ?? tool.function?.parameters;
    let parameters = { type: "object", additionalProperties: true };
    if (rawParameters && typeof rawParameters === "object") {
      try {
        parameters = JSON.parse(JSON.stringify(rawParameters));
      } catch {}
    }
    const description = typeof tool.description === "string"
      ? tool.description
      : typeof tool.function?.description === "string"
        ? tool.function.description
        : "";
    return [{ name, description, parameters }];
  });
}
function getGrokBotRouterSendToolName(tools) {
  const names = serializeGrokBotRouterTools(tools).map((tool) => tool.name);
  // SendToUser is Grok Bot's canonical terminal-delivery tool. Its turn
  // runtime treats similarly named aliases as silent work and launches a
  // redundant closing nudge, which renders as an empty/ellipsis reply.
  for (const name of ["SendToUser", "SendMessage", "SendUser"]) {
    if (names.includes(name)) return name;
  }
  return "SendToUser";
}
function getGrokBotRouterChildEnv() {
  const names = [
    "PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "LC_ALL", "TERM",
    "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "CODEX_HOME",
    "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
    "SSL_CERT_FILE", "NODE_EXTRA_CA_CERTS", "OPENROUTER_API_KEY"
  ];
  return Object.fromEntries(names.flatMap((name) => (
    typeof process.env[name] === "string" ? [[name, process.env[name]]] : []
  )));
}
function appendGrokBotRouterHostError(config, error) {
  try {
    const diagnostic = String(error?.message || error || "Unknown host bridge error")
      .replace(/sk-or-v1-[a-z0-9_-]+|sk-[a-z0-9_-]+|gh[opsu]_[a-z0-9_-]+/gi, "[REDACTED]")
      .replace(/\s+/g, " ")
      .slice(0, 500);
    const auditPath = config?.auditPath || "/home/box/sand-data/grokbot-router/audit.jsonl";
    require("node:fs").appendFileSync(auditPath, `${JSON.stringify({
      timestamp: new Date().toISOString(),
      version: "0.1.0-beta.47",
      event: "host_bridge_error",
      diagnostic
    })}\n`, { encoding: "utf8", mode: 0o600 });
  } catch {}
}
function runGrokBotRouter(config, messages, tools, sessionOptions) {
  return new Promise((resolve, reject) => {
    const runnerPath = config.runnerPath || "/home/box/sand-data/grokbot-router/run-provider.mjs";
    const nodePath = config.nodePath || "/usr/bin/node";
    const timeoutMs = Math.max(1000, Number(config.timeoutMs || 900000));
    const child = require("node:child_process").spawn(nodePath, [runnerPath], {
      cwd: config.workingDirectory || "/workspace",
      env: getGrokBotRouterChildEnv(),
      stdio: ["pipe", "pipe", "pipe"]
    });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let forceKillTimer;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 2000);
      forceKillTimer.unref?.();
      finish(() => reject(new Error(`Provider exceeded ${timeoutMs}ms`)));
    }, timeoutMs);
    child.on("error", (error) => finish(() => reject(error)));
    child.stdin.on("error", (error) => {
      if (error?.code !== "EPIPE") finish(() => reject(error));
    });
    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= 20 * 1024 * 1024) stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= 2 * 1024 * 1024) stderr.push(chunk);
    });
    child.on("close", (code, signal) => {
      if (forceKillTimer) clearTimeout(forceKillTimer);
      finish(() => {
      const output = Buffer.concat(stdout).toString("utf8");
      const diagnostic = Buffer.concat(stderr).toString("utf8");
      if (code !== 0 || signal) {
        reject(new Error(`Provider exited with ${signal || `code ${code}`}: ${diagnostic.slice(-4000)}`));
        return;
      }
      let payload;
      try {
        payload = JSON.parse(output);
      } catch {
        reject(new Error(`Provider returned invalid JSON: ${output.slice(-1000)}`));
        return;
      }
      if (!payload?.ok || typeof payload.text !== "string") {
        reject(new Error(payload?.error || "Provider returned no response"));
        return;
      }
      resolve(payload);
      });
    });
    child.stdin.end(JSON.stringify({
      config,
      messages,
      tools: serializeGrokBotRouterTools(tools),
      sessionOptions
    }));
  });
}
var GrokBotRouterPromptExecutor = class extends MockPromptExecutor {
  constructor(config, sessionOptions, initialMessages) {
    super(() => ({ response: "", chunkSize: 1 }), initialMessages);
    this.config = config;
    this.sessionOptions = sessionOptions;
  }
  stream(ctx, invocationId, tools, options) {
    const messages = this.builder.getMessages();
    const resultPromise = runGrokBotRouter(this.config, messages, tools, this.sessionOptions)
      .catch((error) => {
        console.error("[grokbot-router] Provider turn failed:", error?.stack || error);
        appendGrokBotRouterHostError(this.config, error);
        return {
          text: "Model Router error. Open this Bot's computer and run grokbot-router doctor for a private diagnostic.",
          toolCalls: [],
          usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
          bridgeError: true
        };
      });
    const delegatedPromise = resultPromise.then((result) => {
      const providerToolCalls = Array.isArray(result.toolCalls) ? result.toolCalls : [];
      if (result.alreadyDelivered) {
        const delegate = new MockPromptExecutor(() => ({
          response: "",
          toolCalls: []
        }), messages);
        return delegate.stream(ctx, invocationId, tools, options);
      }
      const fallbackToolCalls = providerToolCalls.length > 0 ? [] : [{
        toolCallId: `grokbot-router-send-${require("node:crypto").randomUUID()}`,
        toolName: getGrokBotRouterSendToolName(tools),
        args: { type: "text", content: result.text }
      }];
      const delegate = new MockPromptExecutor(() => ({
        // A response chunk and a tool call in the same mock turn can cause Grok
        // to deliver the text and skip execution. Tool turns stay silent until
        // Grok returns the tool result and the provider produces final text.
        response: "",
        toolCalls: providerToolCalls.length > 0 ? providerToolCalls : fallbackToolCalls,
        chunkSize: 256,
        streamDelay: 0,
        usage: {
          inputTokens: Number(result.usage?.inputTokens || 0),
          outputTokens: Number(result.usage?.outputTokens || 0),
          cacheReadTokens: Number(result.usage?.cacheReadTokens || 0),
          cacheWriteTokens: Number(result.usage?.cacheWriteTokens || 0),
          maxTokens: 0
        }
      }), messages);
      return delegate.stream(ctx, invocationId, tools, options);
    });
    const fullStream = async function* () {
      const delegated = await delegatedPromise;
      for await (const part of delegated.fullStream) yield part;
    }();
    return {
      fullStream,
      response: delegatedPromise.then((delegated) => delegated.response),
      usage: delegatedPromise.then((delegated) => delegated.usage),
      extendedUsage: delegatedPromise.then((delegated) => delegated.extendedUsage),
      providerMetadata: delegatedPromise.then((delegated) => delegated.providerMetadata),
      invocationId: delegatedPromise.then((delegated) => delegated.invocationId)
    };
  }
};
function createGrokBotRouterPromptExecutor(config, sessionOptions) {
  return new GrokBotRouterPromptExecutor(config, sessionOptions, void 0);
}
'''.strip()


SESSION_CODE = r'''
      // GROKBOT_MODEL_ROUTER_V45: route enabled sessions through the provider adapter.
      const grokBotRouterConfig = loadGrokBotRouterConfig();
      if (grokBotRouterConfig) {
        const provider = grokBotRouterConfig.provider === "openrouter" ? "openrouter" : "codex";
        const modelId = provider === "openrouter"
          ? grokBotRouterConfig.openRouterModel || "anthropic/claude-sonnet-4.6"
          : grokBotRouterConfig.codexModel || "gpt-5.6-sol";
        return {
          getExecutor: () => createGrokBotRouterPromptExecutor(grokBotRouterConfig, sessionOptions),
          getModelId: () => modelId
        };
      }
'''.rstrip()


class PatchError(RuntimeError):
    """Raised for safe, user-actionable patch failures."""


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_stock_hosts(value: Any, label: str) -> list[dict[str, Any]]:
    if not isinstance(value, list) or not value:
        raise PatchError(f"{label} has no stockHosts list")
    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, dict):
            raise PatchError(f"{label} has an invalid stockHosts entry")
        digest = item.get("sha256")
        byte_count = item.get("bytes")
        if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
            raise PatchError(f"{label} has an invalid stock host SHA-256")
        if not isinstance(byte_count, int) or isinstance(byte_count, bool) or byte_count <= 0:
            raise PatchError(f"{label} has an invalid stock host byte count")
        if digest in seen:
            raise PatchError(f"{label} repeats stock host SHA-256 {digest}")
        seen.add(digest)
        normalized.append({"sha256": digest, "bytes": byte_count})
    return normalized


def validate_anchor_policy(value: Any) -> dict[str, Any]:
    """Read legacy size-band settings for diagnostics only.

    The historical enabled flag never grants stock provenance. Only reviewed
    hash/size pairs authorize installation, restoration, or automatic repair.
    """
    if value is None:
        return {"enabled": False, "minBytes": 0, "maxBytes": 0}
    if not isinstance(value, dict):
        raise PatchError("Compatibility manifest has an invalid anchorVerifiedHosts policy")
    policy = {"enabled": value.get("enabled") is True, "minBytes": 0, "maxBytes": 0}
    for key in ("minBytes", "maxBytes"):
        bound = value.get(key, 0)
        if isinstance(bound, bool) or not isinstance(bound, int) or bound < 0:
            raise PatchError(f"Compatibility manifest anchorVerifiedHosts.{key} must be a non-negative integer")
        policy[key] = bound
    if policy["maxBytes"] and policy["maxBytes"] < policy["minBytes"]:
        raise PatchError("Compatibility manifest anchorVerifiedHosts.maxBytes is below minBytes")
    return policy


def load_manifest(path: Path) -> dict[str, Any]:
    try:
        manifest = json.loads(path.read_text())
    except Exception as error:
        raise PatchError(f"Cannot read compatibility manifest {path}: {error}") from error
    manifest["stockHosts"] = validate_stock_hosts(
        manifest.get("stockHosts"), "Compatibility manifest"
    )
    anchors = manifest.get("requiredAnchors")
    if not isinstance(anchors, list) or not anchors or not all(isinstance(item, str) and item for item in anchors):
        raise PatchError("Compatibility manifest has no valid requiredAnchors list")
    manifest["anchorVerifiedHosts"] = validate_anchor_policy(manifest.get("anchorVerifiedHosts"))
    return manifest


def load_host_registry(path: Path, manifest: dict[str, Any]) -> dict[str, Any]:
    try:
        registry = json.loads(path.read_text())
    except Exception as error:
        raise PatchError(f"Cannot read signed host registry {path}: {error}") from error
    if registry.get("schemaVersion") != 1:
        raise PatchError("Signed host registry has an unsupported schemaVersion")
    if registry.get("grokBotVersion") != manifest.get("grokBotVersion"):
        raise PatchError("Signed host registry targets a different Grok Bot version")
    registry["stockHosts"] = validate_stock_hosts(
        registry.get("stockHosts"), "Signed host registry"
    )
    return registry


def allowed_stock_hosts(
    manifest: dict[str, Any],
    registry: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    combined = [*manifest["stockHosts"], *(registry or {}).get("stockHosts", [])]
    return list({item["sha256"]: item for item in combined}.values())


def is_allowed_stock(
    path: Path,
    manifest: dict[str, Any],
    registry: dict[str, Any] | None = None,
) -> bool:
    if not path.exists():
        return False
    digest = sha256(path)
    byte_count = path.stat().st_size
    return any(
        item["sha256"] == digest and item["bytes"] == byte_count
        for item in allowed_stock_hosts(manifest, registry)
    )


def dry_run_patch(source: str, manifest: dict[str, Any]) -> None:
    """Apply the transformation to a temporary copy and syntax-check it."""
    validate_anchors(source, manifest)
    patched = patch_text(source)
    with tempfile.NamedTemporaryFile("w", suffix=".cjs", delete=False) as temporary:
        temporary.write(patched)
        temporary_path = Path(temporary.name)
    try:
        syntax_check(temporary_path)
    finally:
        temporary_path.unlink(missing_ok=True)


def _trust_cache_path(path: Path) -> Path:
    return path.with_name(f"{path.name}{TRUST_CACHE_SUFFIX}")


def anchor_verification(
    path: Path,
    manifest: dict[str, Any],
    digest: str | None = None,
) -> dict[str, Any]:
    """Check structural compatibility for diagnostics, never stock provenance.

    Returns ``{"ok", "reason", "patchDryRun"}``. The verdict is cached beside
    the file, keyed by its SHA-256, byte count, router marker version, and the
    manifest policy, because the lifecycle watchdog re-checks the backup every
    few seconds and the read-only patch of a 25 MB host is not free.
    """
    policy = manifest.get("anchorVerifiedHosts") or validate_anchor_policy(None)
    if not path.exists():
        return {"ok": False, "reason": "host file is missing", "patchDryRun": "not-applicable"}
    digest = digest or sha256(path)
    byte_count = path.stat().st_size
    cache_key = {
        "sha256": digest,
        "bytes": byte_count,
        "marker": MARKER,
        "trustPolicy": "exact-stock-v1",
        "anchors": list(manifest.get("requiredAnchors", [])),
        "policy": policy,
    }
    cache_path = _trust_cache_path(path)
    try:
        cached = json.loads(cache_path.read_text())
        if cached.get("key") == cache_key and isinstance(cached.get("result"), dict):
            return cached["result"]
    except Exception:
        pass

    source = path.read_text(errors="replace")
    result: dict[str, Any] = {"ok": False, "reason": "", "patchDryRun": "not-applicable"}
    if MARKER in source or LEGACY_MARKER.search(source):
        result["reason"] = "the host already carries a GrokRouter adapter"
    elif FOREIGN_MARKER.search(source):
        result["reason"] = "the host was modified by another router; restore stock Grok Bot first"
    else:
        try:
            dry_run_patch(source, manifest)
            result["patchDryRun"] = "pass"
        except Exception as error:
            result["patchDryRun"] = "fail"
            result["reason"] = f"the read-only patch check failed: {error}"
        if result["patchDryRun"] == "pass":
            if policy["minBytes"] and byte_count < policy["minBytes"]:
                result["reason"] = f"the host is smaller than expected ({byte_count} bytes)"
            elif policy["maxBytes"] and byte_count > policy["maxBytes"]:
                result["reason"] = f"the host is larger than expected ({byte_count} bytes)"
            elif not policy["enabled"]:
                result["reason"] = "structural verification is disabled by the compatibility manifest"
            else:
                result["reason"] = "an exact reviewed stock-host hash and byte count are required"
    try:
        cache_path.write_text(json.dumps({"key": cache_key, "result": result}, sort_keys=True) + "\n")
        os.chmod(cache_path, 0o600)
    except Exception:
        pass
    return result


def host_trust(
    path: Path,
    manifest: dict[str, Any],
    registry: dict[str, Any] | None = None,
) -> str | None:
    """Return why ``path`` is trusted as a stock host, or ``None``."""
    if not path.exists():
        return None
    if is_allowed_stock(path, manifest, registry):
        return TRUST_EXACT
    return None


def is_trusted_stock(
    path: Path,
    manifest: dict[str, Any],
    registry: dict[str, Any] | None = None,
) -> bool:
    return host_trust(path, manifest, registry) is not None


def inspect_host(
    host: Path,
    manifest: dict[str, Any],
    registry: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if not host.exists():
        return {
            "ok": False,
            "status": "missing",
            "host": str(host),
            "supportedVersion": manifest.get("grokBotVersion"),
        }
    source = host.read_text(errors="replace")
    digest = sha256(host)
    byte_count = host.stat().st_size
    anchors = [source.count(anchor) for anchor in manifest.get("requiredAnchors", [])]
    verification = anchor_verification(host, manifest, digest)
    if is_allowed_stock(host, manifest, registry):
        trust: str | None = TRUST_EXACT
    else:
        trust = None
    if MARKER in source:
        status = "patched"
    elif trust == TRUST_EXACT:
        status = "known-stock"
    else:
        status = "unknown-stock-candidate"
    return {
        "ok": trust is not None and all(count == 1 for count in anchors),
        "status": status,
        "host": str(host),
        "hostSha256": digest,
        "hostBytes": byte_count,
        "hostTrust": trust,
        "trustReason": verification["reason"] if trust is None else "ok",
        "cloudArchitecture": platform.machine(),
        "anchorCounts": anchors,
        "patchDryRun": verification["patchDryRun"],
        "routerMarker": MARKER in source,
        "legacyMarker": bool(LEGACY_MARKER.search(source)),
        "supportedVersion": manifest.get("grokBotVersion"),
    }


def compatibility_report(
    host: Path,
    manifest: dict[str, Any],
    registry: dict[str, Any] | None = None,
) -> str:
    report = inspect_host(host, manifest, registry)
    digest = str(report.get("hostSha256") or "missing")
    first = digest[:32]
    second = digest[32:]
    counts = ",".join(str(value) for value in report.get("anchorCounts", [])) or "missing"
    return "\n".join(
        [
            f"HOSTSHA1={first}",
            f"HOSTSHA2={second}",
            f"HOSTBYTES={report.get('hostBytes', 'missing')}",
            f"CLOUDARCH={report.get('cloudArchitecture', 'unknown')}",
            f"ANCHORS={counts}",
            f"PATCHDRYRUN={str(report.get('patchDryRun', 'unknown')).upper()}",
            f"HOSTTRUST={str(report.get('hostTrust') or 'none').upper()}",
        ]
    )


def validate_anchors(source: str, manifest: dict[str, Any]) -> None:
    for anchor in manifest.get("requiredAnchors", []):
        count = source.count(anchor)
        if count != 1:
            raise PatchError(f"Host anchor count for {anchor!r} was {count}; expected 1")


def patch_text(source: str) -> str:
    if MARKER in source:
        return source
    if LEGACY_MARKER.search(source):
        raise PatchError("Legacy adapter detected; restore the verified stock backup before patching")

    executor_pattern = re.compile(
        r"(function createMockPromptExecutor\(options2\) \{\n"
        r"\s+return new MockPromptExecutor\(\(\) => options2\(\), void 0\);\n"
        r"\})"
    )
    source, executor_count = executor_pattern.subn(
        lambda match: f"{match.group(1)}\n{EXECUTOR_CODE}", source, count=1
    )
    if executor_count != 1:
        raise PatchError(f"Executor anchor count was {executor_count}; expected 1")

    session_pattern = re.compile(
        r"(createSession\(onRequestId, sessionOptions\) \{\n\s+)"
        r"(const mockResponse = process\.env\.SAND_AGENT_MOCK_RESPONSE;)"
    )
    source, session_count = session_pattern.subn(
        lambda match: f"{match.group(1)}{SESSION_CODE.lstrip()}\n\n      {match.group(2)}",
        source,
        count=1,
    )
    if session_count != 1:
        raise PatchError(f"Session anchor count was {session_count}; expected 1")

    # `resolveBoxId()` is already evaluated immediately before Grok creates the
    # primary inference session. In Grok Bot 0.30.0 it is the only stable,
    # Bot-specific identifier available at that boundary; request IDs and
    # lineage values are turn-scoped. Forward it without changing stock
    # behavior so direct chats and channel turns share the addressed Bot's
    # router state.
    identity_pattern = re.compile(r"(const mainSessionOptions = \{\n)(\s+modelId:)")
    source, identity_count = identity_pattern.subn(
        lambda match: (
            f"{match.group(1)}"
            "          ...(boxId != null ? { botId: typeof boxId === \"string\" ? boxId : JSON.stringify(boxId) || String(boxId) } : {}),\n"
            "          ...(typeof rawTranscriptText === \"string\" && rawTranscriptText ? { grokBotRouterControlText: rawTranscriptText } : {}),\n"
            f"{match.group(2)}"
        ),
        source,
        count=1,
    )
    if identity_count != 1:
        raise PatchError(f"Session identity anchor count was {identity_count}; expected 1")

    return source


def syntax_check(path: Path) -> None:
    result = subprocess.run(["node", "--check", str(path)], capture_output=True, text=True)
    if result.returncode:
        raise PatchError(result.stderr.strip() or result.stdout.strip() or "node --check failed")


def timestamp_backup(path: Path, label: str) -> Path:
    destination = path.with_name(f"{path.name}.grokbot-router.{label}.{int(time.time() * 1000)}.bak")
    shutil.copy2(path, destination)
    backups = sorted(
        path.parent.glob(f"{path.name}.grokbot-router.*.bak"),
        key=lambda candidate: candidate.stat().st_mtime_ns,
        reverse=True,
    )
    for stale in backups[4:]:
        stale.unlink(missing_ok=True)
    return destination


def matches_adapter(host: Path, stock: Path, manifest: dict[str, Any], previous: bool = False) -> bool:
    """Authenticate router output by reconstructing it from a trusted original.

    A marker alone is not evidence that we wrote a file. Callers must first
    verify the stock hash/size against the reviewed manifest or registry.
    """
    if not host.exists() or not stock.exists():
        return False
    try:
        original = stock.read_text()
        validate_anchors(original, manifest)
        if previous:
            spec = importlib.util.spec_from_file_location(
                "grokrouter_previous_adapter", Path(__file__).with_name("previous_adapter.py")
            )
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            expected = module.patch_text(original)
            module.EXECUTOR_CODE = module.EXECUTOR_CODE.replace('version: "0.1.0-beta.46"', 'version: "0.1.0-beta.45"')
            if host.read_bytes() == module.patch_text(original).encode("utf-8"):
                return True
        else:
            expected = patch_text(original)
        return host.read_bytes() == expected.encode("utf-8")
    except Exception:
        return False


def verified_stock_source(
    host: Path,
    backup: Path,
    manifest: dict[str, Any],
    allow_unknown: bool,
    registry: dict[str, Any] | None = None,
) -> Path:
    if host.exists():
        current = host.read_text(errors="replace")
        if MARKER not in current and not LEGACY_MARKER.search(current):
            if allow_unknown or is_trusted_stock(host, manifest, registry):
                return host
        else:
            # An upgrade may use a backup only when it reproduces the live
            # router output exactly. Unknown replacements and foreign routers
            # must never be silently downgraded from an older backup.
            for candidate in (backup, *LEGACY_BACKUPS):
                if candidate.exists() and (allow_unknown or is_trusted_stock(candidate, manifest, registry)):
                    if matches_adapter(host, candidate, manifest) or matches_adapter(host, candidate, manifest, previous=True):
                        return candidate
    reason = anchor_verification(host, manifest)["reason"] if host.exists() else "host file is missing"
    raise PatchError(
        f"This Grok Bot computer's host did not pass GrokRouter's stock-host checks: {reason}. "
        "The live host was not replaced from a backup. Use explicit Restore Stock only when appropriate. "
        "Nothing was changed.\n"
        f"{compatibility_report(host, manifest, registry)}\n"
        f"SUPPORTEDVERSION={manifest.get('grokBotVersion')}"
    )


def install(
    host: Path,
    backup: Path,
    manifest: dict[str, Any],
    dry_run: bool,
    allow_unknown: bool,
    registry: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if not host.exists():
        raise PatchError(f"Host not found: {host}")
    stock = verified_stock_source(host, backup, manifest, allow_unknown, registry)
    if matches_adapter(host, stock, manifest):
        return {
            "ok": True,
            "status": "already-installed",
            "host": str(host),
            "hostSha256": sha256(host),
        }
    trust = host_trust(stock, manifest, registry) or ("development-override" if allow_unknown else None)
    source = stock.read_text()
    validate_anchors(source, manifest)
    patched = patch_text(source)
    if MARKER not in patched:
        raise PatchError("Patched host is missing the router marker")
    if dry_run:
        return {
            "ok": True,
            "status": "dry-run",
            "stock": str(stock),
            "stockSha256": sha256(stock),
            "stockBytes": len(source.encode("utf-8")),
            "stockTrust": trust,
            "patchedBytes": len(patched.encode("utf-8")),
        }

    # Grok rotates stock hosts behind the same app version. Keep the backup in
    # step with the untouched host that is actually live right now so Restore
    # Stock Grok Bot puts back exactly what this Bot computer was running.
    backup.parent.mkdir(parents=True, exist_ok=True)
    if stock != backup and (not backup.exists() or sha256(backup) != sha256(stock)):
        shutil.copy2(stock, backup)
        _trust_cache_path(backup).unlink(missing_ok=True)
    previous = timestamp_backup(host, "before-install")
    temporary = host.with_name(f"{host.name}.grokbot-router.tmp.cjs")
    temporary.write_text(patched)
    os.chmod(temporary, host.stat().st_mode)
    syntax_check(temporary)
    os.replace(temporary, host)
    return {
        "ok": True,
        "status": "installed",
        "host": str(host),
        "hostSha256": sha256(host),
        "stockBackup": str(backup),
        "stockTrust": trust,
        "previousBackup": str(previous),
    }


def restore(
    host: Path,
    backup: Path,
    manifest: dict[str, Any],
    dry_run: bool,
    allow_unknown: bool,
    registry: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if not backup.exists():
        for legacy in LEGACY_BACKUPS:
            if legacy.exists() and (allow_unknown or is_trusted_stock(legacy, manifest, registry)):
                backup.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(legacy, backup)
                break
    if not backup.exists():
        raise PatchError(f"Verified stock backup not found: {backup}")
    if not allow_unknown and not is_trusted_stock(backup, manifest, registry):
        raise PatchError(
            f"Stock backup did not pass the stock-host checks: {sha256(backup)} "
            f"({anchor_verification(backup, manifest)['reason']})"
        )
    if dry_run:
        return {"ok": True, "status": "restore-dry-run", "stockBackup": str(backup)}
    previous = timestamp_backup(host, "before-restore") if host.exists() else None
    temporary = host.with_name(f"{host.name}.grokbot-router.restore.tmp.cjs")
    shutil.copy2(backup, temporary)
    syntax_check(temporary)
    os.replace(temporary, host)
    return {
        "ok": True,
        "status": "restored",
        "host": str(host),
        "hostSha256": sha256(host),
        "previousBackup": str(previous) if previous else None,
    }


def doctor(
    host: Path,
    backup: Path,
    manifest: dict[str, Any],
    allow_unknown: bool = False,
    registry: dict[str, Any] | None = None,
) -> dict[str, Any]:
    host_exists = host.exists()
    backup_exists = backup.exists()
    host_text = host.read_text(errors="replace") if host_exists else ""
    backup_trust = host_trust(backup, manifest, registry) if backup_exists else None
    return {
        "ok": bool(
            host_exists
            and MARKER in host_text
            and backup_exists
            and (allow_unknown or backup_trust is not None)
            and matches_adapter(host, backup, manifest)
        ),
        "status": "installed" if MARKER in host_text else "stock-or-unknown",
        "hostAdapterVerified": bool((allow_unknown or backup_trust is not None) and matches_adapter(host, backup, manifest)),
        "routerMarker": MARKER in host_text,
        "legacyMarker": bool(LEGACY_MARKER.search(host_text)),
        "host": str(host),
        "hostSha256": sha256(host) if host_exists else None,
        "stockBackup": str(backup),
        "stockBackupSha256": sha256(backup) if backup_exists else None,
        "stockBackupVerified": backup_trust is not None,
        "stockBackupTrust": backup_trust,
        "developmentOverride": allow_unknown,
        "supportedVersion": manifest.get("grokBotVersion"),
    }


def human_print(result: dict[str, Any]) -> None:
    for key, value in result.items():
        print(f"{key}: {value}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Install or restore the GrokRouter host adapter")
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--restore", action="store_true", help="restore the verified stock host")
    action.add_argument("--doctor", action="store_true", help="inspect installation health")
    action.add_argument("--inspect", action="store_true", help="print a non-secret host compatibility report")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--allow-unknown-host", action="store_true", help="development only")
    parser.add_argument("--host", type=Path, default=DEFAULT_HOST)
    parser.add_argument("--backup", type=Path, default=DEFAULT_BACKUP)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--host-registry", type=Path)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    manifest = load_manifest(args.manifest)
    registry = load_host_registry(args.host_registry, manifest) if args.host_registry else None
    if args.doctor:
        result = doctor(args.host, args.backup, manifest, args.allow_unknown_host, registry)
    elif args.inspect:
        result = inspect_host(args.host, manifest, registry)
    elif args.restore:
        result = restore(args.host, args.backup, manifest, args.dry_run, args.allow_unknown_host, registry)
    else:
        result = install(args.host, args.backup, manifest, args.dry_run, args.allow_unknown_host, registry)
    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        human_print(result)
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
