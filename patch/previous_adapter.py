"""Original beta.46 transformation, retained only to authenticate upgrades.

Source: c8eea82a5e544e1c64a63d590f0585b12db8ac56. Contains no Grok host source.
"""
import re

MARKER = "GROKBOT_MODEL_ROUTER_V45"

LEGACY_MARKER = re.compile(r"(?:GROK_SDK_ADAPTER_V[1-8]|GROKBOT_MODEL_ROUTER_V(?:9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43|44))")

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
      version: "0.1.0-beta.46",
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
