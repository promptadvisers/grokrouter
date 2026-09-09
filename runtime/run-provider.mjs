import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const runtimeDirectory = dirname(fileURLToPath(import.meta.url));
const MAX_INPUT_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGES_PER_TURN = 4;
const MAX_TOOLS = 128;
const ROUTER_VERSION = "0.1.0-beta.47";
const COMPLETED_TURN_TTL_MS = 15 * 60_000;
const ACTIVE_TURN_TTL_MS = 15 * 60_000;
const CHANNEL_CONTROL_LATCH_TTL_MS = 30_000;
const INTERNAL_DELIVERY_TOOLS = new Set([
  "sendtouser",
  "sendmessage",
  "send_message",
  "senduser",
  "reacttomessage",
  "update_state",
]);

export function collectText(value, depth = 0) {
  if (depth > 8 || value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((part) => collectText(part, depth + 1)).filter(Boolean).join("\n");
  }
  if (typeof value !== "object") return "";
  const direct = [value.text, value.input_text, value.inputText, value.value]
    .find((candidate) => typeof candidate === "string");
  if (direct) return direct;
  return [value.content, value.message, value.parts, value.data, value.result]
    .map((candidate) => collectText(candidate, depth + 1))
    .filter(Boolean)
    .join("\n");
}

export function messageRole(message) {
  const role = message?.role ?? message?.message?.role ?? message?.data?.role;
  return typeof role === "string" ? role.toLowerCase() : "";
}

function hiddenCompletionContent(message) {
  const content = message?.content ?? message?.message?.content ?? message?.data?.content;
  const raw = collectText(content);
  // The native host adds a timestamp and optional message-ID part, then wraps
  // the actual hidden payload in user_query just like an ordinary user turn.
  const queries = [...raw.matchAll(/<user_query>([\s\S]*?)<\/user_query>/gi)];
  const text = (queries.length === 1 ? queries[0][1] : queries.length ? "" : raw).trim();
  return /^\[SAND_HIDDEN_PROMPT\]/.test(text) ? text : "";
}

export function automationCompletionId(message) {
  const candidates = [
    message?.providerOptions?.cursor,
    message?.message?.providerOptions?.cursor,
    message?.data?.providerOptions?.cursor,
  ];
  for (const cursor of candidates) {
    const id = cursor?.sandAutomationCompletionId;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  // Native child revival uses runner.run(hidden: true), separately from the
  // automation inbox. The reviewed host preserves that run's requestId on the
  // user message. Match its exact envelope and deduplicate by that durable ID;
  // equal child output from another request remains a distinct completion.
  if (messageRole(message) === "user"
    && /^\[SAND_HIDDEN_PROMPT\]\s*\[A background task just completed\](?:\s|$)/.test(hiddenCompletionContent(message))) {
    for (const cursor of candidates) {
      const id = cursor?.requestId;
      if (typeof id === "string" && id.trim()) return `grok-child-request:${id.trim()}`;
    }
  }
  return "";
}

export function automationCompletionText(message) {
  if (!automationCompletionId(message)) return "";
  const content = message?.content ?? message?.message?.content ?? message?.data?.content;
  const text = (hiddenCompletionContent(message) || collectText(content))
    .replace(/^\s*\[SAND_HIDDEN_PROMPT\]\s*/i, "")
    .trim();
  return text || "Background task completed with no text output.";
}

function normalizedPartType(value) {
  return typeof value?.type === "string" ? value.type.toLowerCase().replaceAll("_", "-") : "";
}

function partToolCallId(value) {
  const id = value?.toolCallId ?? value?.tool_call_id;
  return typeof id === "string" ? id : "";
}

function partToolName(value) {
  const name = value?.toolName ?? value?.tool_name;
  return typeof name === "string" ? name : "";
}

function hasAttachment(value, depth = 0, seen = new Set()) {
  if (depth > 8 || value == null || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  const type = normalizedPartType(value);
  const mimeType = value.mimeType ?? value.mime_type ?? value.mediaType ?? value.media_type;
  if (["image", "image-url", "file", "attachment"].includes(type)
    || String(mimeType || "").startsWith("image/")
    || value.image_url != null
    || value.imageUrl != null
    || value.file != null
    || value.filePath != null
    || value.file_path != null) {
    return true;
  }
  return (Array.isArray(value) ? value : Object.values(value))
    .some((child) => hasAttachment(child, depth + 1, seen));
}

export function extractUserQuery(text) {
  if (typeof text !== "string" || !text.trim()) return "";
  const matches = [...text.matchAll(/<user_query>([\s\S]*?)<\/user_query>/gi)];
  if (matches.length > 0) {
    for (let index = matches.length - 1; index >= 0; index -= 1) {
      let candidate = matches[index][1] || "";
      candidate = candidate.split(/<system_reminder>/i)[0].trim();
      if (!candidate || /^\[SAND_HIDDEN_PROMPT\]/i.test(candidate)) continue;
      candidate = candidate.replace(/^\[[^\]\n]+\]\s*/i, "").trim();
      if (candidate) return candidate;
    }
    return "";
  }
  if (/\[SAND_HIDDEN_PROMPT\]|<system_reminder>/i.test(text)) return "";
  return text.trim();
}

export function latestUserText(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const role = messageRole(message);
    if (role !== "user" && role !== "human") continue;
    const text = extractUserQuery(collectText(message?.content ?? message));
    if (text) return text;
  }
  return "";
}

function isAutomaticGreeting(messages) {
  if (latestAutomationCompletion(messages) || toolResultCallIds(messages).size > 0) return false;
  const latest = [...messages].reverse().find((message) => ["user", "human"].includes(messageRole(message)));
  // The host also sends its procedure as a user-role context message. That
  // context is not a human request and must not hide the explicit first run.
  const requestId = latest?.providerOptions?.cursor?.requestId;
  if (typeof requestId === "string" && requestId.trim()
      && /^\[SAND_HIDDEN_PROMPT\]\[first run\](?:\s|$)/.test(hiddenCompletionContent(latest))) return true;
  return !latestUserText(messages);
}

const ROUTER_CONTROL_PREFIX = /^\/(?:providers?|models?|reasoning|router|doctor)(?:\s|$)/i;

export function addressedRouterControlText(input) {
  if (typeof input !== "string") return "";
  const trimmed = input.trim();
  if (ROUTER_CONTROL_PREFIX.test(trimmed)) return trimmed;
  const slashIndex = trimmed.search(/\/(?:providers?|models?|reasoning|router|doctor)(?:\s|$)/i);
  if (slashIndex <= 0) return trimmed;
  const rawAddress = trimmed.slice(0, slashIndex).trim();
  // Grok's direct composer renders a mention as plain @text, while channels
  // can preserve the same mention inside lightweight HTML/markdown wrappers.
  // Strip wrappers, never prose, before applying the pure-address gate.
  const address = rawAddress
    .replace(/<[^>]+>/g, " ")
    .replace(/\[(?:\/?)(?:mention|bot)[^\]]*\]/gi, " ")
    .replace(/\uFFFC/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Grok group messages can retain a leading @Bot mention in the visible
  // prompt. Accept only a pure address prefix. Natural-language requests such
  // as "please run /provider" must still go through normal model inference.
  if (!address.startsWith("@")
    || /[\n,;!?]/.test(address)
    || !/^@[\p{L}\p{N}\p{M}\s_.()\[\]{}<>/@:=+\-]+$/u.test(address)) {
    return trimmed;
  }
  return trimmed.slice(slashIndex).trim();
}

function stringLeaves(value, depth = 0, results = [], seen = new Set()) {
  if (depth > 8 || value == null || results.length >= 256) return results;
  if (typeof value === "string") {
    results.push(value);
    return results;
  }
  if (typeof value !== "object" || seen.has(value)) return results;
  seen.add(value);
  for (const child of (Array.isArray(value) ? value : Object.values(value))) {
    stringLeaves(child, depth + 1, results, seen);
    if (results.length >= 256) break;
  }
  return results;
}

export function structuredRouterControlText(messages) {
  for (let index = (Array.isArray(messages) ? messages.length : 0) - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const role = messageRole(message);
    if (role !== "user" && role !== "human") continue;
    const candidates = stringLeaves(message?.content ?? message);
    for (let candidateIndex = candidates.length - 1; candidateIndex >= 0; candidateIndex -= 1) {
      const candidate = extractUserQuery(candidates[candidateIndex]);
      const addressed = addressedRouterControlText(candidate);
      if (ROUTER_CONTROL_PREFIX.test(addressed)) return addressed;
    }
    return "";
  }
  return "";
}

function objectKeyPaths(value, depth = 0, prefix = "", results = [], seen = new Set()) {
  if (depth > 4 || value == null || typeof value !== "object" || seen.has(value)) return results;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    results.push(path.slice(0, 160));
    if (child && typeof child === "object") objectKeyPaths(child, depth + 1, path, results, seen);
    if (results.length >= 64) break;
  }
  return [...new Set(results)].sort();
}

function controlProbe(messages) {
  const visible = latestUserText(messages);
  const match = visible.match(/\/(providers?|models?|reasoning|router|doctor)(?:\s|$)/i);
  const bare = visible.match(/\b(providers?|models?|reasoning|router|doctor)\b/i);
  const prefix = match ? visible.slice(0, match.index) : visible;
  const latestUser = [...(Array.isArray(messages) ? messages : [])].reverse()
    .find((message) => ["user", "human"].includes(messageRole(message)));
  const leafProbe = stringLeaves(latestUser?.content ?? latestUser)
    .filter((leaf) => /\b(providers?|models?|reasoning|router|doctor)\b/i.test(leaf))
    .slice(0, 16)
    .map((leaf) => ({
      length: leaf.length,
      hasAsciiSlash: leaf.includes("/"),
      commands: [...new Set([...leaf.matchAll(/\b(providers?|models?|reasoning|router|doctor)\b/ig)]
        .map((candidate) => candidate[1].toLowerCase()))],
    }));
  const messageControlLeaves = (Array.isArray(messages) ? messages : []).slice(-8).flatMap((message) =>
    stringLeaves(message?.content ?? message).flatMap((leaf) => {
      const commands = [...leaf.matchAll(/\/(providers?|models?|reasoning|router|doctor)(?:\s|$)/ig)];
      return commands.slice(-8).map((candidate) => ({
        role: messageRole(message),
        length: leaf.length,
        command: `/${candidate[1].toLowerCase()}`,
        prefixShape: leaf.slice(Math.max(0, Number(candidate.index || 0) - 240), Number(candidate.index || 0))
          .replace(/[\p{L}\p{N}\p{M}]+/gu, "A")
          .replace(/\s+/g, " "),
      }));
    })).slice(0, 64);
  return {
    visibleLength: visible.length,
    command: match ? `/${match[1].toLowerCase()}` : "",
    bareCommand: bare ? bare[1].toLowerCase() : "",
    prefixShape: prefix
      .replace(/[\p{L}\p{N}\p{M}]+/gu, "A")
      .replace(/\s+/g, " ")
      .slice(0, 320),
    leafProbe,
    messageControlLeaves,
  };
}

const NATIVE_WORKFLOW_COMMAND_MARKER = /GROKROUTER_NATIVE_(?:COMMAND:\s*\/|CONTROL:\s*)(providers?|models?|reasoning|router|doctor)(?:\s|$)/ig;

function expandedNativeSkillControlText(raw) {
  // A menu selection is expanded by the verified desktop into a recipe plus
  // its trailing mention. Match this complete wrapper, never a retained recipe
  // elsewhere in the transcript or a command mentioned in ordinary prose.
  const visible = extractUserQuery(raw).trim().replace(/^\[[^\]\n]+\]\s*/, "");
  const wrapper = visible.match(/^The user invoked the "(providers?|models?|reasoning|router|doctor)" skill \(folder \1\)\. Run it now\.\r?\nWhat it does: [^\n]*\r?\nRecipe to follow:\r?\n([\s\S]+)\r?\nCarry out the recipe now, adapting it to anything else the user said in this message\.\s*\r?\n([\s\S]+)$/i);
  if (!wrapper) return "";
  const name = wrapper[1].toLowerCase();
  const recipe = wrapper[2];
  if (!/^# GrokRouter\b/m.test(recipe)) return "";
  const markers = [...recipe.matchAll(NATIVE_WORKFLOW_COMMAND_MARKER)];
  if (markers.length !== 1 || markers[0][1].toLowerCase() !== name) return "";
  const invocation = wrapper[3].trim().match(new RegExp(`^[/@]?${name}(?:\\s+([^\\n]+))?$`, "i"));
  if (!invocation) return "";
  return `/${name}${invocation[1] ? ` ${invocation[1].trim()}` : ""}`;
}

export function hostRouterControlText(messages, sessionOptions = {}) {
  const raw = typeof sessionOptions.grokBotRouterControlText === "string"
    ? sessionOptions.grokBotRouterControlText
    : "";
  if (!raw.trim()) return "";
  const expanded = expandedNativeSkillControlText(raw);
  if (expanded) return expanded;
  const visible = extractUserQuery(raw).trim();
  if (!visible) return "";
  const addressed = addressedRouterControlText(visible);
  if (ROUTER_CONTROL_PREFIX.test(addressed)) return addressed;

  // A selected native workflow can expose `provider codex` in the stock host
  // transcript even though the composer visibly rendered `/provider codex`.
  // Accept that slashless form only when the matching registered workflow
  // marker is present. Ordinary prose never gains command authority here.
  const bare = visible.match(/^@?(providers?|models?|reasoning|router|doctor)(?:\s+([\s\S]+))?$/i);
  if (!bare) return "";
  const commandName = bare[1].toLowerCase();
  const hasMatchingMarker = (Array.isArray(messages) ? messages : []).some((message) => {
    const messageText = collectText(message?.content ?? message);
    return [...messageText.matchAll(NATIVE_WORKFLOW_COMMAND_MARKER)]
      .some((match) => match[1].toLowerCase() === commandName);
  });
  if (!hasMatchingMarker) return "";
  const argument = String(bare[2] || "").trim();
  return argument ? `/${commandName} ${argument}` : `/${commandName}`;
}

export function nativeWorkflowControlText(messages) {
  for (let index = (Array.isArray(messages) ? messages.length : 0) - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const raw = collectText(message?.content ?? message);
    const expanded = expandedNativeSkillControlText(raw);
    if (expanded) return expanded;
    const markers = [...raw.matchAll(NATIVE_WORKFLOW_COMMAND_MARKER)];
    if (markers.length === 0) {
      const role = messageRole(message);
      if ((role === "user" || role === "human") && extractUserQuery(raw)) return "";
      continue;
    }
    const base = `/${markers[markers.length - 1][1].toLowerCase()}`;
    const commandName = base.slice(1);
    const visible = extractUserQuery(raw).trim();
    const selected = visible.match(new RegExp(`^[/@]?${commandName}(?:\\s+([\\s\\S]+))?$`, "i"));
    if (!selected) {
      // A retained definition does not authorize a different visible request.
      if (visible && visible !== raw.trim()) return "";
      if (!/^# GrokRouter\b/.test(raw.trim())) return "";
      return base;
    }
    const argument = String(selected[1] || "").trim();
    return argument ? `${base} ${argument}` : base;
  }
  return "";
}

export function userTurnFingerprint(messages) {
  const turns = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    const role = messageRole(message);
    if (role !== "user" && role !== "human") continue;
    if (toolResultCallIds(message).size > 0) continue;
    const text = collectText(message?.content ?? message);
    const tagged = [...text.matchAll(/<user_query>([\s\S]*?)<\/user_query>/gi)]
      .map((match) => extractUserQuery(`<user_query>${match[1] || ""}</user_query>`))
      .filter(Boolean);
    if (tagged.length > 0) turns.push(tagged[tagged.length - 1]);
    else {
      const plain = extractUserQuery(text);
      if (plain) turns.push(plain);
      else if (!automationCompletionId(message) && hasAttachment(message)) turns.push("[attachment]");
    }
  }
  if (turns.length === 0) return "";
  return createHash("sha256")
    .update(`${turns.length}\0${turns[turns.length - 1]}`)
    .digest("hex");
}

function latestUserIndex(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const role = messageRole(messages[index]);
    if (toolResultCallIds(messages[index]).size > 0) continue;
    if ((role === "user" || role === "human")
      && !automationCompletionId(messages[index])
      && (extractUserQuery(collectText(messages[index])) || hasAttachment(messages[index]))) {
      return index;
    }
  }
  return -1;
}

function latestAutomationCompletionIndex(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (automationCompletionText(messages[index])) return index;
  }
  return -1;
}

function latestAutomationCompletion(messages) {
  const index = latestAutomationCompletionIndex(messages);
  if (index < 0) return null;
  const message = messages[index];
  return {
    id: automationCompletionId(message),
    index,
    text: automationCompletionText(message),
  };
}

export function automationContinuationSignature(messages) {
  const completion = latestAutomationCompletion(messages);
  if (!completion || completion.index <= latestUserIndex(messages)) return "";
  const toolResultIds = [];
  for (let index = completion.index + 1; index < messages.length; index += 1) {
    for (const id of toolResultCallIds(messages[index])) {
      if (!id.startsWith("grokbot-router-send-")) toolResultIds.push(id);
    }
  }
  return createHash("sha256")
    .update([completion.id, ...toolResultIds, ...failedDeliveryReceiptIds(messages)].join("\0"))
    .digest("hex");
}

function latestInputBoundaryIndex(messages) {
  return Math.max(latestUserIndex(messages), latestAutomationCompletionIndex(messages));
}

function isDeliveryToolCall(call) {
  const normalize = (name) => String(name || '').toLowerCase().replaceAll('_', '').replaceAll('-', '');
  const deliveries = new Set(['sendtouser', 'sendmessage', 'senduser']);
  const name = normalize(call.function?.name);
  if (deliveries.has(name)) return true;
  if (name !== 'calldynamictool') return false;
  let args;
  try { args = JSON.parse(call.function?.arguments || '{}'); } catch { return false; }
  return deliveries.has(normalize(args?.toolName));
}

function failedToolResultCallIds(value, failures = new Set(), depth = 0, seen = new Set()) {
  if (depth > 10 || value == null || typeof value !== "object" || seen.has(value)) return failures;
  seen.add(value);
  if (normalizedPartType(value) === "tool-result" && partToolCallId(value)) {
    const outcome = value.result ?? value.output;
    const hasError = (item) => item && typeof item === "object" && (
      item.isError === true || item.is_error === true || item.success === false
      || (item.error !== undefined && item.error !== null && item.error !== false)
      || ["error-text", "error-json"].includes(item.type)
    );
    if (hasError(value) || hasError(outcome) || hasError(outcome?.value)) failures.add(partToolCallId(value));
  }
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    failedToolResultCallIds(child, failures, depth + 1, seen);
  }
  return failures;
}

function failedDeliveryReceiptIds(messages) {
  const boundary = latestInputBoundaryIndex(messages);
  const deliveryCalls = new Set();
  const failed = new Set();
  for (let index = Math.max(0, boundary + 1); index < messages.length; index += 1) {
    const message = messages[index];
    if (messageRole(message) === "assistant") {
      const content = message?.content ?? message?.message?.content ?? message?.data?.content;
      for (const call of toolCallsFromGrokContent(content)) {
        if (isDeliveryToolCall(call)) deliveryCalls.add(call.id);
      }
    }
    for (const id of failedToolResultCallIds(message)) {
      if (deliveryCalls.has(id)) failed.add(id);
    }
  }
  return [...failed].sort();
}

export function hasDeliveryAfterLatestQuery(messages) {
  // A completed background subagent is injected after the visible user turn as
  // a hidden automation-completion message. It starts a continuation of the
  // same turn, so an earlier "subagent started" delivery must not suppress the
  // actual child result.
  const queryIndex = latestInputBoundaryIndex(messages);
  const startIndex = queryIndex < 0 ? 0 : queryIndex + 1;
  const sendCallOrigins = new Map();
  for (let index = 0; index < messages.length; index += 1) {
    if (messageRole(messages[index]) !== "assistant") continue;
    const content = messages[index]?.content
      ?? messages[index]?.message?.content
      ?? messages[index]?.data?.content;
    for (const call of toolCallsFromGrokContent(content)) {
      if (isDeliveryToolCall(call)) {
        sendCallOrigins.set(call.id, index);
      }
    }
  }
  const pendingToolCalls = new Set();
  for (let index = startIndex; index < messages.length; index += 1) {
    const message = messages[index];
    const resultIds = toolResultCallIds(message);
    const failedResultIds = failedToolResultCallIds(message);
    if ([...resultIds].some((id) => {
      if (failedResultIds.has(id)) return false;
      const origin = sendCallOrigins.get(id);
      if (origin !== undefined) return queryIndex < 0 || origin > queryIndex;
      // A transcript with no visible input boundary can contain only the
      // host's durable router delivery receipt. Preserve that cleanup path,
      // but never let an orphan receipt suppress a real user/completion turn.
      return queryIndex < 0 && id.startsWith("grokbot-router-send-");
    })) {
      return true;
    }
    for (const id of resultIds) pendingToolCalls.delete(id);
    if (messageRole(message) !== "assistant") continue;
    const content = message?.content ?? message?.message?.content ?? message?.data?.content;
    for (const call of toolCallsFromGrokContent(content)) {
      if (!isDeliveryToolCall(call)) {
        pendingToolCalls.add(call.id);
      }
    }
    const parts = Array.isArray(content) ? content : [content];
    const visibleText = parts
      .filter((part) => !["reasoning", "redacted-reasoning", "reasoning-details", "tool-call", "tool-result"].includes(normalizedPartType(part)))
      .map((part) => collectText(part))
      .filter(Boolean)
      .join("\n")
      .trim();
    if (pendingToolCalls.size > 0) continue;
    if (visibleText && !/^\[SAND_HIDDEN_PROMPT\]/i.test(visibleText)) {
      return true;
    }
  }
  return false;
}

function jsonString(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value ?? "");
  } catch {
    return String(value ?? "");
  }
}

function redactDiagnostic(value, limit = 500) {
  return String(value ?? "")
    .replace(/sk-or-v1-[a-z0-9_-]+|sk-[a-z0-9_-]+|gh[opsu]_[a-z0-9_-]+/gi, "[REDACTED]")
    .replace(/\s+/g, " ")
    .slice(0, limit);
}

function normalizeUsage(usage) {
  return {
    inputTokens: Number(usage?.input_tokens ?? usage?.inputTokens ?? 0),
    outputTokens: Number(usage?.output_tokens ?? usage?.outputTokens ?? 0),
    cacheReadTokens: Number(usage?.cached_input_tokens ?? usage?.cache_read_input_tokens ?? 0),
    cacheWriteTokens: Number(usage?.cache_write_input_tokens ?? usage?.cache_creation_input_tokens ?? 0),
  };
}

function normalizeOpenRouterUsage(usage) {
  return {
    inputTokens: Number(usage?.prompt_tokens ?? usage?.input_tokens ?? 0),
    outputTokens: Number(usage?.completion_tokens ?? usage?.output_tokens ?? 0),
    cacheReadTokens: Number(
      usage?.prompt_tokens_details?.cached_tokens
      ?? usage?.prompt_tokens_details?.cache_read_tokens
      ?? 0,
    ),
    cacheWriteTokens: Number(usage?.prompt_tokens_details?.cache_write_tokens ?? 0),
  };
}

export function normalizeTools(tools) {
  if (!Array.isArray(tools)) return [];
  const seen = new Set();
  return tools.slice(0, MAX_TOOLS).flatMap((tool) => {
    if (!tool || typeof tool !== "object") return [];
    const name = typeof tool.name === "string"
      ? tool.name.trim()
      : typeof tool.function?.name === "string"
        ? tool.function.name.trim()
        : "";
    if (!name || seen.has(name)) return [];
    seen.add(name);
    const description = typeof tool.description === "string"
      ? tool.description
      : typeof tool.function?.description === "string"
        ? tool.function.description
        : "";
    const rawParameters = tool.parameters?.jsonSchema
      ?? tool.inputSchema?.jsonSchema
      ?? tool.inputSchema
      ?? tool.parameters
      ?? tool.function?.parameters;
    const parameters = rawParameters && typeof rawParameters === "object"
      ? rawParameters
      : { type: "object", additionalProperties: true };
    return [{ name, description, parameters }];
  });
}

export function actionableTools(tools) {
  return normalizeTools(tools).filter((tool) => !INTERNAL_DELIVERY_TOOLS.has(tool.name.toLowerCase()));
}

function toolCallsFromGrokContent(content) {
  const parts = Array.isArray(content) ? content : content && typeof content === "object" ? [content] : [];
  return parts.flatMap((part) => {
    if (!part || typeof part !== "object" || normalizedPartType(part) !== "tool-call") return [];
    const name = partToolName(part);
    const id = partToolCallId(part);
    if (!name || !id) return [];
    const rawArgs = part.args ?? part.arguments ?? part.function?.arguments ?? {};
    return [{
      id,
      type: "function",
      function: {
        name,
        arguments: typeof rawArgs === "string" ? rawArgs : jsonString(rawArgs),
      },
    }];
  });
}

function parseDataUrl(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;
  return { mimeType: match[1].toLowerCase(), data: match[2].replace(/\s+/g, "") };
}

function extensionForMime(mimeType) {
  const subtype = String(mimeType || "image/png").split("/")[1]?.toLowerCase() || "png";
  if (subtype.includes("jpeg") || subtype.includes("jpg")) return ".jpg";
  if (subtype.includes("webp")) return ".webp";
  if (subtype.includes("gif")) return ".gif";
  return ".png";
}

async function imageUrlFromObject(value) {
  if (!value || typeof value !== "object") return null;
  const direct = value.image_url?.url ?? value.imageUrl ?? value.url;
  if (typeof direct === "string" && (/^https?:\/\//i.test(direct) || parseDataUrl(direct))) return direct;
  const sourceData = value.source?.type === "base64" ? value.source.data : undefined;
  const sourceMime = value.source?.media_type ?? value.source?.mimeType;
  const mimeType = value.mimeType ?? value.mime_type ?? value.mediaType ?? value.media_type ?? sourceMime;
  const rawData = typeof value.data === "string" ? value.data : sourceData;
  if (typeof rawData === "string" && String(mimeType || "").startsWith("image/")) {
    const parsed = parseDataUrl(rawData);
    return parsed ? rawData : `data:${mimeType};base64,${rawData.replace(/\s+/g, "")}`;
  }
  const pathname = value.path ?? value.filePath ?? value.file_path;
  if (typeof pathname === "string"
    && (String(mimeType || "").startsWith("image/") || /\.(?:png|jpe?g|gif|webp)$/i.test(pathname))) {
    const bytes = await readFile(pathname);
    if (bytes.length > MAX_IMAGE_BYTES) return null;
    const inferred = String(mimeType || "").startsWith("image/")
      ? mimeType
      : extname(pathname).toLowerCase() === ".jpg" || extname(pathname).toLowerCase() === ".jpeg"
        ? "image/jpeg"
        : `image/${extname(pathname).slice(1).toLowerCase() || "png"}`;
    return `data:${inferred};base64,${bytes.toString("base64")}`;
  }
  return null;
}

async function collectImageUrls(value, results = [], depth = 0, seen = new Set()) {
  if (depth > 8 || value == null || results.length >= MAX_IMAGES_PER_TURN) return results;
  if (typeof value !== "object") return results;
  if (seen.has(value)) return results;
  seen.add(value);
  const imageUrl = await imageUrlFromObject(value).catch(() => null);
  if (imageUrl && !results.includes(imageUrl)) results.push(imageUrl);
  if (results.length >= MAX_IMAGES_PER_TURN) return results;
  const children = Array.isArray(value) ? value : Object.values(value);
  for (const child of children) {
    await collectImageUrls(child, results, depth + 1, seen);
    if (results.length >= MAX_IMAGES_PER_TURN) break;
  }
  return results;
}

async function openRouterContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) {
    const text = collectText(content);
    const images = await collectImageUrls(content);
    if (!images.length) return text;
    return [
      ...(text ? [{ type: "text", text }] : []),
      ...images.map((url) => ({ type: "image_url", image_url: { url } })),
    ];
  }
  const parts = [];
  for (const part of content) {
    if (typeof part === "string") {
      if (part) parts.push({ type: "text", text: part });
      continue;
    }
    if (!part || typeof part !== "object") continue;
    if (["text", "input_text", "output_text", "reasoning"].includes(part.type)
      && typeof part.text === "string") {
      parts.push({ type: "text", text: part.text });
      continue;
    }
    const images = await collectImageUrls(part);
    if (images.length) {
      parts.push(...images.map((url) => ({ type: "image_url", image_url: { url } })));
      continue;
    }
    if (part.type === "file") {
      parts.push({ type: "text", text: "[A file attachment is present in the Grok Bot transcript.]" });
      continue;
    }
    const text = collectText(part);
    if (text) parts.push({ type: "text", text });
  }
  if (!parts.some((part) => part.type === "image_url")) {
    return parts.map((part) => part.text).filter(Boolean).join("\n");
  }
  return parts;
}

async function openRouterToolResults(message) {
  const content = message?.content ?? message?.message?.content ?? message?.data?.content;
  const parts = Array.isArray(content) ? content : content && typeof content === "object" ? [content] : [];
  const converted = [];
  for (const part of parts) {
    if (!part || typeof part !== "object" || normalizedPartType(part) !== "tool-result") continue;
    const id = partToolCallId(part);
    if (!id) continue;
    const rendered = typeof part.result === "string" ? part.result : jsonString(part.result ?? "");
    const experimentalText = Array.isArray(part.experimental_content)
      ? part.experimental_content.map((item) => collectText(item)).filter(Boolean).join("\n")
      : "";
    converted.push({
      role: "tool",
      tool_call_id: id,
      content: [rendered, experimentalText].filter(Boolean).join("\n") || "Tool completed.",
    });
    const images = await collectImageUrls([part.result, part.experimental_content]);
    if (images.length) {
      converted.push({
        role: "user",
        content: [
          { type: "text", text: `Visual output returned by Grok tool call ${id}:` },
          ...images.map((url) => ({ type: "image_url", image_url: { url } })),
        ],
      });
    }
  }
  if (!converted.length && (messageRole(message) === "tool" || normalizedPartType(message) === "tool-result")) {
    const id = partToolCallId(message)
      || partToolCallId(message?.message)
      || partToolCallId(message?.data);
    if (id) {
      converted.push({
        role: "tool",
        tool_call_id: id,
        content: collectText(content).trim() || "Tool completed.",
      });
    }
  }
  return converted;
}

function pendingBackgroundAgentIds(messages) {
  const boundary = latestInputBoundaryIndex(messages);
  const launches = new Set();
  const pending = new Set();
  const orchestrationName = (name) => /^(?:task|sub[ _-]?agent|launch[ _-]?subagent|spawn[ _-]?agent)$/i.test(String(name || ""));
  const backgroundId = (value, depth = 0) => {
    if (depth > 8 || value == null) return null;
    if (typeof value === "string") {
      // The native Task broker renders its launch object into this exact
      // protocol receipt. Accept it only inside a paired orchestration result;
      // quoted user text and other tools never reach this branch with authority.
      const receipt = value.trim().match(/^<cursor_untrusted_data_(\d+) source="Task">\nSubagent is running in the background\.\n\nAgent ID: (sand-subagent-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}) \(can be used with the `resume` parameter to send a follow-up after it completes\)\n<\/cursor_untrusted_data_\1>$/);
      if (receipt) return receipt[2];
      try { return backgroundId(JSON.parse(value), depth + 1); } catch { return null; }
    }
    if (typeof value !== "object" || value.success === false || value.isError === true || value.error) return null;
    if (value.isBackgrounded === true && typeof value.agentId === "string" && value.agentId.startsWith("sand-subagent-")) return value.agentId;
    for (const key of ["success", "result", "output", "value"]) {
      const id = backgroundId(value[key], depth + 1);
      if (id) return id;
    }
    return null;
  };
  for (const message of messages.slice(Math.max(0, boundary + 1))) {
    if (messageRole(message) === "assistant") {
      const content = message?.content ?? message?.message?.content ?? message?.data?.content;
      for (const call of toolCallsFromGrokContent(content)) {
        let name = call.function?.name;
        if (/^calldynamictool$/i.test(name)) {
          try { name = JSON.parse(call.function.arguments).toolName; } catch { continue; }
        }
        if (orchestrationName(name)) launches.add(call.id);
      }
    }
    // Read the authoritative structured result, not its provider rendering.
    // Grok may also attach experimental_content with a duplicate text view;
    // concatenating both produces invalid JSON and loses the native receipt.
    const inspectResults = (value, depth = 0) => {
      if (depth > 10 || value == null || typeof value !== "object") return;
      if (normalizedPartType(value) === "tool-result" && launches.has(partToolCallId(value))) {
        const id = backgroundId(value.result ?? value.output);
        if (id) pending.add(id);
        return;
      }
      for (const child of Array.isArray(value) ? value : Object.values(value)) inspectResults(child, depth + 1);
    };
    inspectResults(message);
  }
  return [...pending];
}

function sanitizeOpenRouterConversation(messages) {
  const assistantCallIds = new Set();
  const toolResultIds = new Set();
  for (const message of messages) {
    if (message?.role === "assistant") {
      for (const call of Array.isArray(message.tool_calls) ? message.tool_calls : []) {
        if (typeof call?.id === "string" && call.id) assistantCallIds.add(call.id);
      }
    }
    if (message?.role === "tool" && typeof message.tool_call_id === "string" && message.tool_call_id) {
      toolResultIds.add(message.tool_call_id);
    }
  }

  const sanitized = [];
  for (const message of messages) {
    if (message?.role === "tool") {
      if (assistantCallIds.has(message.tool_call_id)) sanitized.push(message);
      continue;
    }
    if (message?.role === "assistant") {
      const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
      const content = typeof message.content === "string" ? message.content.trim() : message.content;
      if (!content && !calls.length) continue;
      sanitized.push({ ...message, content: content || null });
      for (const call of calls) {
        if (typeof call?.id === "string" && call.id && !toolResultIds.has(call.id)) {
          sanitized.push({ role: "tool", tool_call_id: call.id, content: "Tool completed." });
        }
      }
      continue;
    }
    sanitized.push(message);
  }
  return sanitized;
}

export async function openRouterMessages(messages) {
  const converted = [];
  for (const message of messages) {
    const role = messageRole(message);
    const content = message?.content ?? message?.message?.content ?? message?.data?.content;
    // Grok Bot can wrap a native tool-result part in either a `tool` message
    // or a `user` message. The structured part is authoritative; preserving
    // the wrapper role makes OpenRouter treat the result as a fresh request
    // and repeat the same tool call indefinitely.
    if (role === "tool" || toolResultCallIds(message).size > 0) {
      converted.push(...await openRouterToolResults(message));
      continue;
    }
    if (role === "assistant") {
      const toolCalls = toolCallsFromGrokContent(content);
      const rendered = await openRouterContent(content);
      const text = typeof rendered === "string"
        ? rendered
        : rendered.filter((part) => part.type === "text").map((part) => part.text).join("\n");
      converted.push({
        role: "assistant",
        content: text || null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }
    if (role === "system" || role === "developer") {
      const rendered = await openRouterContent(content);
      const text = typeof rendered === "string"
        ? rendered
        : rendered.filter((part) => part.type === "text").map((part) => part.text).join("\n");
      if (text) converted.push({ role: "system", content: text });
      continue;
    }
    if (role === "user" || role === "human") {
      const completionText = automationCompletionText(message);
      if (completionText) {
        converted.push({ role: "user", content: completionText });
        continue;
      }
      const rendered = await openRouterContent(content);
      if (typeof rendered === "string") {
        const visibleText = extractUserQuery(rendered);
        if (visibleText) converted.push({ role: "user", content: visibleText });
        continue;
      }
      if (Array.isArray(rendered)) {
        const imageParts = rendered.filter((part) => part?.type === "image_url");
        const rawText = rendered
          .filter((part) => part?.type === "text")
          .map((part) => part.text)
          .filter(Boolean)
          .join("\n");
        const visibleText = extractUserQuery(rawText);
        const visibleContent = [
          ...(visibleText ? [{ type: "text", text: visibleText }] : []),
          ...imageParts,
        ];
        if (visibleContent.length) converted.push({ role: "user", content: visibleContent });
      }
    }
  }
  if (!converted.length) converted.push({ role: "user", content: "Continue the Grok Bot conversation." });
  return sanitizeOpenRouterConversation(converted);
}

function parsedOpenRouterToolCalls(toolCalls) {
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls.flatMap((call) => {
    const id = typeof call?.id === "string" ? call.id : "";
    const name = typeof call?.function?.name === "string" ? call.function.name : "";
    if (!id || !name) return [];
    const rawArguments = call.function.arguments;
    let args = {};
    if (rawArguments && typeof rawArguments === "object") {
      args = rawArguments;
    } else if (typeof rawArguments === "string" && rawArguments.trim()) {
      try {
        args = JSON.parse(rawArguments);
      } catch {
        args = { __raw_arguments: rawArguments };
      }
    }
    return [{ toolCallId: id, toolName: name, args }];
  });
}

function balancedJsonObject(text, startIndex) {
  if (typeof text !== "string" || text[startIndex] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = startIndex; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(startIndex, index + 1);
    }
  }
  return null;
}

function textExplicitlyNamesTool(text, toolName) {
  if (typeof text !== "string" || typeof toolName !== "string" || !toolName) return false;
  const escaped = toolName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^A-Za-z0-9_-])${escaped}(?:$|[^A-Za-z0-9_-])`, "i").test(text);
}

export function recoveredTextualOpenRouterToolCalls(text, offeredTools, visibleUserText = "") {
  if (typeof text !== "string") return [];
  const normalizedOfferedTools = normalizeTools(offeredTools);
  const offeredByLowerName = new Map(normalizedOfferedTools
    .map((tool) => [tool.name.toLowerCase(), tool.name]));
  if (!offeredByLowerName.size) return [];
  const explicitlyRequestedOfferedTool = /\b(?:use|call|invoke)\b[\s\S]{0,100}\btool\b/i.test(visibleUserText)
    ? normalizedOfferedTools.find((tool) => textExplicitlyNamesTool(visibleUserText, tool.name))
    : null;
  const forcedBareArgumentsCall = () => {
    if (!explicitlyRequestedOfferedTool) return [];
    const parameters = explicitlyRequestedOfferedTool.parameters || {};
    const required = Array.isArray(parameters.required) ? parameters.required : [];
    const properties = parameters.properties && typeof parameters.properties === "object"
      ? Object.keys(parameters.properties)
      : [];
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] !== "{") continue;
      const candidateJson = balancedJsonObject(text, index);
      if (!candidateJson) continue;
      index += candidateJson.length - 1;
      let args;
      try {
        args = JSON.parse(candidateJson);
      } catch {
        continue;
      }
      if (!args || typeof args !== "object" || Array.isArray(args)) continue;
      const keys = Object.keys(args);
      if (!keys.length || required.some((name) => !Object.hasOwn(args, name))) continue;
      if (properties.length && !keys.some((name) => properties.includes(name))) continue;
      if (!properties.length && keys.every((name) => ["type", "content", "text"].includes(name))) continue;
      return [{
        toolCallId: `openrouter-text-tool-${randomUUID()}`,
        toolName: explicitlyRequestedOfferedTool.name,
        args,
      }];
    }
    // A few OpenAI-compatible relays emit an object-looking block whose string
    // contains a literal control character, making the whole object invalid
    // JSON even though its declared string fields are recoverable. Keep this
    // fallback schema-bound: every required property must be declared as a
    // string by the explicitly user-named, host-offered tool.
    if (required.length > 0 && required.every((name) => parameters.properties?.[name]?.type === "string")) {
      const args = {};
      for (const name of properties) {
        if (parameters.properties?.[name]?.type !== "string") continue;
        const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const field = text.match(new RegExp(`"${escapedName}"\\s*:\\s*"((?:\\\\[\\s\\S]|[^"\\\\])*)"`));
        if (!field) continue;
        const safeStringBody = field[1].replace(/[\u0000-\u001f]/g, (character) => (
          JSON.stringify(character).slice(1, -1)
        ));
        try {
          args[name] = JSON.parse(`"${safeStringBody}"`);
        } catch {
          // A malformed declared field remains inert.
        }
      }
      if (required.every((name) => Object.hasOwn(args, name))) {
        return [{
          toolCallId: `openrouter-text-tool-${randomUUID()}`,
          toolName: explicitlyRequestedOfferedTool.name,
          args,
        }];
      }
    }
    return [];
  };
  const candidates = [];
  // OpenRouter-compatible endpoints have been observed printing several
  // malformed tool dialects, including markdown fences and object-replacement
  // characters between the function name and its JSON. Search a tightly
  // bounded marker-local window for one balanced object instead of assuming
  // the object begins immediately after a newline. The candidate still has to
  // name a host-offered tool (or pass the explicit dynamic-broker checks below)
  // before it can become an executable host call.
  const marker = /to=functions\.([A-Za-z0-9_.-]+)/g;
  for (const match of text.matchAll(marker)) {
    const rawName = match[1];
    const offeredName = offeredByLowerName.get(rawName.toLowerCase()) || null;
    const markerEnd = match.index + match[0].length;
    const nextMarker = text.indexOf("to=functions.", markerEnd);
    const searchEnd = Math.min(
      text.length,
      markerEnd + 320,
      nextMarker >= 0 ? nextMarker : text.length,
    );
    const markerTail = text.slice(markerEnd, searchEnd);
    const relativeJsonStart = markerTail.indexOf("{");
    if (relativeJsonStart < 0) continue;
    const decoration = markerTail.slice(0, relativeJsonStart);
    if (!/[\r\n]|\b(?:json|code)\b/i.test(decoration)) continue;
    const jsonStart = markerEnd + relativeJsonStart;
    const argumentsJson = balancedJsonObject(text, jsonStart);
    if (!argumentsJson) continue;
    let args;
    try {
      args = JSON.parse(argumentsJson);
    } catch {
      continue;
    }
    candidates.push({
      rawName,
      offeredName,
      args,
    });
  }
  if (!candidates.length) return forcedBareArgumentsCall();
  // Some OpenAI-compatible endpoints occasionally print an entire attempted
  // dynamic-tool sequence as assistant text. Execute one host-valid step, not
  // every repeated discovery attempt. A final CallDynamicTool carries the
  // actionable invocation and therefore wins over preceding discovery calls.
  const explicitDynamicCall = [...candidates].reverse()
    .find((call) => call.offeredName?.toLowerCase() === "calldynamictool");
  if (explicitDynamicCall) {
    return [{
      toolCallId: `openrouter-text-tool-${randomUUID()}`,
      toolName: explicitDynamicCall.offeredName,
      args: explicitDynamicCall.args,
    }];
  }

  const explicitlyRequestedOfferedCall = [...candidates].reverse().find((call) => (
    call.offeredName && textExplicitlyNamesTool(visibleUserText, call.rawName)
  ));
  if (explicitlyRequestedOfferedCall) {
    return [{
      toolCallId: `openrouter-text-tool-${randomUUID()}`,
      toolName: explicitlyRequestedOfferedCall.offeredName,
      args: explicitlyRequestedOfferedCall.args,
    }];
  }

  const dynamicBrokerName = offeredByLowerName.get("calldynamictool");
  if (dynamicBrokerName) {
    const discoveries = new Map(candidates.flatMap((call) => {
      if (call.rawName.toLowerCase() !== "getdynamictools") return [];
      const discoveredName = typeof call.args?.toolName === "string" ? call.args.toolName.trim() : "";
      if (!discoveredName) return [];
      return [[discoveredName.toLowerCase(), {
        namespace: typeof call.args?.namespace === "string" && call.args.namespace.trim()
          ? call.args.namespace.trim()
          : "cursor",
        toolName: discoveredName,
      }]];
    }));
    const discoveredDirectCall = [...candidates].reverse().find((call) => (
      !call.offeredName
      && (discoveries.has(call.rawName.toLowerCase())
        || textExplicitlyNamesTool(visibleUserText, call.rawName))
    ));
    if (discoveredDirectCall) {
      const discovery = discoveries.get(discoveredDirectCall.rawName.toLowerCase()) || {
        namespace: "cursor",
        toolName: discoveredDirectCall.rawName,
      };
      return [{
        toolCallId: `openrouter-text-tool-${randomUUID()}`,
        toolName: dynamicBrokerName,
        args: {
          namespace: discovery.namespace,
          toolName: discovery.toolName,
          arguments: discoveredDirectCall.args,
        },
      }];
    }
  }

  const offeredCandidate = [...candidates].reverse().find((call) => call.offeredName);
  return offeredCandidate ? [{
    toolCallId: `openrouter-text-tool-${randomUUID()}`,
    toolName: offeredCandidate.offeredName,
    args: offeredCandidate.args,
  }] : forcedBareArgumentsCall();
}

function validOpenRouterKey(value) {
  return /^sk-or-v1-[A-Za-z0-9_-]{24,}$/.test(value);
}

async function persistedOpenRouterKey(config) {
  const inherited = process.env.OPENROUTER_API_KEY?.trim();
  if (inherited) {
    if (!validOpenRouterKey(inherited)) {
      throw new Error("OPENROUTER_API_KEY is present but does not look like a valid sk-or-v1 key");
    }
    return inherited;
  }
  const candidates = [
    config.openRouterSecretsPath,
    "/home/box/sand-data/box-secrets.json",
  ].filter(Boolean);
  for (const pathname of candidates) {
    let parsed;
    try {
      parsed = JSON.parse(await readFile(pathname, "utf8"));
    } catch {
      // Missing or unreadable stores are skipped without logging secret material.
      continue;
    }
    const value = parsed?.secrets?.OPENROUTER_API_KEY?.trim();
    if (value) {
      if (!validOpenRouterKey(value)) {
        throw new Error("OPENROUTER_API_KEY is present but does not look like a valid sk-or-v1 key");
      }
      return value;
    }
  }
  throw new Error("OpenRouter needs OPENROUTER_API_KEY in Grok Bot's Secrets store");
}

function isLiteralTextOnlyRequest(text) {
  // Formatting the result of a task does not make its prerequisite work text-only.
  // Only unambiguous standalone literal requests may remove the offered tools.
  return /^(?:please\s+)?(?:reply|respond|answer)\s+with\s+exactly\s+(?:"[^"\n]+"|'[^'\n]+'|`[^`\n]+`|[^\s]+)(?:\s+and\s+nothing\s+else)?[.!]?\s*$/i.test(text.trim());
}

function unwrapLiteralDeliveryText(text, request) {
  const literal = request.trim().match(/^(?:please\s+)?(?:reply|respond|answer)\s+with\s+exactly\s+("[^"\n]+"|'[^'\n]+'|`[^`\n]+`|[^\s]+)(?:\s+and\s+nothing\s+else)?[.!]?\s*$/i)?.[1];
  if (!literal) return text;
  const expected = /^["'`]/.test(literal) ? literal.slice(1, -1) : literal;
  // Decode only a complete delivery envelope containing the exact requested
  // literal. This is plain-text normalization, never an executable tool call.
  const marker = text.match(/^\s*(?:```[^\n]*\n)?to=functions\.SendToUser\b[^{}]{0,320}(?=\{)/i);
  if (!marker) return text;
  const json = balancedJsonObject(text, marker[0].length);
  if (!json || !/^\s*(?:```)?\s*$/.test(text.slice(marker[0].length + json.length))) return text;
  try {
    const value = JSON.parse(json);
    if (value?.type === "text" && value.content === expected
        && Object.keys(value).every(key => ["type", "content"].includes(key))) return expected;
  } catch {}
  return text;
}

export async function runOpenRouter(config, messages, tools, fetchImpl = fetch) {
  const apiKey = await persistedOpenRouterKey(config);
  const model = config.openRouterModel || "anthropic/claude-sonnet-4.6";
  const normalizedTools = normalizeTools(tools).map((tool) => ({ type: "function", function: tool }));
  const convertedMessages = await openRouterMessages(messages);
  const visibleUserText = latestUserText(messages);
  const directTextOnly = isLiteralTextOnlyRequest(visibleUserText);
  const automaticGreeting = isAutomaticGreeting(messages);
  const offeredTools = config.nativeTextTask || directTextOnly || automaticGreeting ? [] : normalizedTools;
  const currentUserIndex = latestUserIndex(messages);
  const currentTurnHasToolResult = currentUserIndex >= 0
    && messages.slice(currentUserIndex + 1).some((message) => toolResultCallIds(message).size > 0);
  const subagentRequest = !currentTurnHasToolResult
    && /\b(?:sub[ -]?agent|delegate|delegation|background agent|parallel agent)\b/i.test(visibleUserText);
  const explicitToolRequest = offeredTools.length > 0
    && !currentTurnHasToolResult
    && /\b(?:use|call|invoke)\b[\s\S]{0,100}\btool\b/i.test(visibleUserText);
  const explicitlyNamedOfferedTool = explicitToolRequest
    ? offeredTools.find((tool) => textExplicitlyNamesTool(visibleUserText, tool.function.name))
    : null;
  const subagentOrchestrationTool = subagentRequest
    ? offeredTools.find((tool) => /(?:sub.?agent|delegate|spawn.*agent)/i.test(tool.function.name))
      ?? offeredTools.find((tool) => tool.function.name.toLowerCase() === "getdynamictools")
    : null;
  const forcedTool = explicitlyNamedOfferedTool ?? subagentOrchestrationTool;
  const requiresTool = explicitToolRequest || Boolean(subagentOrchestrationTool);
  const body = {
    model,
    messages: config.nativeTextTask ? convertedMessages : [
      {
        role: "system",
        content: [
          "You are running inside Grok Bot through GrokRouter.",
          `The router control plane reports that the active provider is OpenRouter and the active model is ${model}.`,
          "The in-chat commands /provider, /models, /model, /reasoning, and /router are real and are handled before model inference.",
          "If asked which provider or model is active, use these router facts. Never deny or invent router commands.",
          "Use an outer Grok tool only when the user's task actually requires it. A standalone literal or exact-text reply must be answered directly without tools. A final-format instruction does not remove prerequisite tool work or delegation; complete that work before formatting the answer.",
          "Return your final answer to this conversation directly as content; the router delivers it. Do not discover or call a message-delivery tool merely to send that final answer.",
          "A task receipt with isBackgrounded=true proves only that a child is running. Never infer its result. Continue other required tool work, then wait for the actual background-completion message before delivering the result.",
          ...(offeredTools.length ? [
            `The only Grok tools available in this turn are: ${offeredTools.map((tool) => tool.function.name).join(", ")}.`,
            "Invoke an available tool only through the API's native tool-calling field. Never print or narrate tool-call markup such as to=functions, code:, or JSON arguments as assistant text.",
            "If a dynamic tool such as Shell is not in that offered list, use the offered GetDynamicTools or CallDynamicTool broker natively; never print or invent a direct unoffered function call.",
          ] : []),
          ...(subagentRequest && subagentOrchestrationTool ? [
            `The user explicitly requested delegation. Start with the offered ${subagentOrchestrationTool.function.name} orchestration path and wait for its real completion.`,
          ] : []),
          ...(subagentRequest && offeredTools.length === 0 ? [
            "The Grok host exposed no actionable tool schema in this turn. You cannot launch a real sub-agent, so do not claim that one started or finished; state the limitation briefly and continue directly only if useful.",
          ] : []),
          ...(automaticGreeting ? ["This is Grok Bot's automatic new-Bot greeting. Return one short friendly greeting directly and do not use tools."] : []),
        ].join(" "),
      },
      ...convertedMessages,
    ],
    ...(offeredTools.length ? {
      tools: offeredTools,
      tool_choice: forcedTool
        ? { type: "function", function: { name: forcedTool.function.name } }
        : requiresTool ? "required" : "auto",
      parallel_tool_calls: false,
    } : {}),
    reasoning: { effort: config.openRouterReasoning || "medium" },
    stream: false,
    ...(config.adapterSessionId ? { session_id: config.adapterSessionId } : {}),
  };
  const baseUrl = String(config.openRouterBaseUrl || "https://openrouter.ai/api/v1").replace(/\/$/, "");
  const request = async (requestBody) => {
    const response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "GrokRouter",
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(Number(config.timeoutMs || 15 * 60_000)),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.error) {
      const detail = typeof payload?.error?.message === "string" ? `: ${payload.error.message}` : "";
      throw new Error(`OpenRouter request failed (${response.status}${detail})`);
    }
    const message = payload?.choices?.[0]?.message;
    if (!message) throw new Error("OpenRouter returned no completion choice");
    const rawText = typeof message.content === "string"
      ? message.content.trim()
      : Array.isArray(message.content)
        ? message.content.map((part) => part?.text ?? "").filter(Boolean).join("\n").trim()
        : "";
    const text = directTextOnly && !config.nativeTextTask ? unwrapLiteralDeliveryText(rawText, visibleUserText) : rawText;
    const nativeToolCalls = config.nativeTextTask || directTextOnly || automaticGreeting ? [] : parsedOpenRouterToolCalls(message.tool_calls ?? message.toolCalls);
    const recoveredToolCalls = nativeToolCalls.length
      ? []
      : recoveredTextualOpenRouterToolCalls(text, offeredTools, visibleUserText);
    return {
      payload,
      // Never leak provider-printed pseudo tool syntax into the Grok transcript.
      // The host will execute the recovered call and resume the turn with its
      // real tool result, producing the user-facing answer on that next round.
      text: recoveredToolCalls.length ? "" : text,
      toolCalls: nativeToolCalls.length ? nativeToolCalls : recoveredToolCalls,
      recoveredTextualToolCall: recoveredToolCalls.length > 0,
      normalizedLiteralDelivery: text !== rawText,
      ...(requiresTool ? {
        textualToolDiagnostics: {
          requestedTool: forcedTool?.function?.name || null,
          responseCharacters: text.length,
          functionMarkerCount: (text.match(/to=functions\./g) || []).length,
          objectStartCount: (text.match(/{/g) || []).length,
          nativeToolCallCount: nativeToolCalls.length,
          recoveredToolCallCount: recoveredToolCalls.length,
        },
      } : {}),
    };
  };

  let completion = await request(body);
  let retriedEmpty = false;
  if (!completion.text && !completion.toolCalls.length) {
    retriedEmpty = true;
    completion = await request({
      ...body,
      messages: [
        ...body.messages,
        {
          role: "user",
          content: config.nativeTextTask
            ? "Return the text required by the original system instructions. Do not use tools or address the chat user."
            : "The previous Grok tool round is complete. Return the final user-facing answer now. Do not repeat a completed tool call.",
        },
      ],
    });
  }
  return {
    text: completion.text,
    toolCalls: completion.toolCalls,
    usage: normalizeOpenRouterUsage(completion.payload.usage),
    model: completion.payload.model || model,
    emptyResponse: !completion.text && !completion.toolCalls.length,
    retriedEmpty,
    recoveredTextualToolCall: completion.recoveredTextualToolCall,
    normalizedLiteralDelivery: completion.normalizedLiteralDelivery,
    textualToolDiagnostics: completion.textualToolDiagnostics,
  };
}

function sanitizedTranscript(value, depth = 0, seen = new Set()) {
  if (depth > 9 || value == null) return value;
  if (typeof value === "string") {
    if (value.length > 4096 && parseDataUrl(value)) return `[image data omitted: ${value.length} characters]`;
    return value.length > 20_000 ? `${value.slice(0, 20_000)}\n[truncated]` : value;
  }
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (!Array.isArray(value)) {
    const mimeType = value.mimeType ?? value.mime_type ?? value.mediaType ?? value.media_type;
    if (String(mimeType || "").startsWith("image/") && typeof value.data === "string") {
      return { ...value, data: `[image data omitted: ${value.data.length} characters]` };
    }
  }
  if (Array.isArray(value)) return value.map((item) => sanitizedTranscript(item, depth + 1, seen));
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    sanitizedTranscript(child, depth + 1, seen),
  ]));
}

export function codexTranscriptMessages(messages) {
  return (Array.isArray(messages) ? messages : []).flatMap((message) => {
    const role = messageRole(message);
    if (role !== "user" && role !== "human") return [message];
    if (toolResultCallIds(message).size > 0) return [message];
    const completionText = automationCompletionText(message);
    if (completionText) {
      return [{
        role: "user",
        content: `Grok background task completed: ${completionText}`,
      }];
    }
    const content = message?.content ?? message?.message?.content ?? message?.data?.content;
    const rawText = collectText(content);
    if (!/\[SAND_HIDDEN_PROMPT\]|<system_reminder>/i.test(rawText)) return [message];
    const visibleText = extractUserQuery(rawText);
    return visibleText ? [{ role: "user", content: visibleText }] : [];
  });
}

async function codexImages(messages, config) {
  const urls = await collectImageUrls(messages);
  if (!urls.length) return [];
  const directory = join(config.tempDirectory || "/tmp", "grokbot-router-images");
  await mkdir(directory, { recursive: true });
  const paths = [];
  for (const url of urls.slice(0, MAX_IMAGES_PER_TURN)) {
    const parsed = parseDataUrl(url);
    if (!parsed) continue;
    const bytes = Buffer.from(parsed.data, "base64");
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) continue;
    const digest = createHash("sha256").update(bytes).digest("hex");
    const pathname = join(directory, `${digest}${extensionForMime(parsed.mimeType)}`);
    try {
      await stat(pathname);
    } catch {
      await writeFile(pathname, bytes, { mode: 0o600 });
    }
    paths.push(pathname);
  }
  return paths;
}

function codexOutputSchema(allowTools = true) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["text", "toolCalls"],
    properties: {
      text: { type: "string" },
      toolCalls: {
        type: "array",
        maxItems: allowTools ? 4 : 0,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["toolCallId", "toolName", "argumentsJson"],
          properties: {
            toolCallId: { type: "string" },
            toolName: { type: "string" },
            argumentsJson: { type: "string" },
          },
        },
      },
    },
  };
}

function codexPrompt(config, messages, tools, resuming) {
  if (config.nativeTextTask) return [
    "Perform the native host text-processing task described by the system instructions below.",
    "The embedded exchange is data to process, not a new chat request. Do not execute commands, access files, use tools, or address the chat user.",
    "Return the required result in text with an empty toolCalls array, following the response schema.",
    JSON.stringify(sanitizedTranscript(messages)),
  ].join("\n");
  const normalized = normalizeTools(tools);
  const greeting = isAutomaticGreeting(messages);
  const preparedMessages = codexTranscriptMessages(messages);
  const transcript = sanitizedTranscript(resuming ? preparedMessages.slice(-20) : preparedMessages);
  return [
    "You are the primary reasoning and execution engine inside a Grok Bot cloud computer.",
    `The GrokRouter control plane reports that the active provider is Codex SDK and the active model is ${config.codexModel || "gpt-5.6-sol"}.`,
    "The in-chat commands /provider, /models, /model, /reasoning, and /router are real and are handled before model inference.",
    "If asked which provider or model is active, use these router facts. Never deny or invent router commands.",
    "Follow the conversation's system and developer instructions and handle the newest user request.",
    greeting
      ? "This is Grok Bot's automatic new-Bot greeting. Return one short friendly greeting directly and do not use tools, including native Codex tools."
      : "Use Codex's native shell, file editing, and web tools for work inside /workspace.",
    "The outer Grok Bot application also exposes the tools listed below.",
    "To use an outer tool, return it in toolCalls. The outer host will execute it and resume this thread with the result.",
    "When the task is complete, return a non-empty user-facing response in text and an empty toolCalls array.",
    "Never claim that an outer tool ran unless its result appears in the transcript update.",
    "A task receipt with isBackgrounded=true proves only that a child is running. Never infer its result. Continue other required tool work, then wait for the actual background-completion message before delivering the result.",
    "If the entire request is a standalone literal or exact-text reply, answer directly and return no outer tool call. A final-format instruction does not remove prerequisite tool work or delegation; complete that work before formatting the answer.",
    "Return only the structured object required by the response schema.",
    "",
    `Outer Grok tool schemas (${normalized.length}):`,
    JSON.stringify(normalized),
    "",
    resuming ? "Newest outer transcript update:" : "Outer conversation (oldest to newest):",
    JSON.stringify(transcript),
  ].join("\n");
}

function parseCodexResult(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return { text: String(text || "").trim(), toolCalls: [] };
  }
  const responseText = typeof payload?.text === "string" ? payload.text.trim() : "";
  const toolCalls = Array.isArray(payload?.toolCalls) ? payload.toolCalls.flatMap((call) => {
    const toolName = typeof call?.toolName === "string" ? call.toolName : "";
    if (!toolName) return [];
    let args = {};
    try {
      args = JSON.parse(call.argumentsJson || "{}");
    } catch {
      args = { __raw_arguments: String(call.argumentsJson || "") };
    }
    return [{
      toolCallId: typeof call.toolCallId === "string" && call.toolCallId
        ? call.toolCallId
        : `codex-grok-tool-${randomUUID()}`,
      toolName,
      args,
    }];
  }) : [];
  return { text: responseText, toolCalls };
}

function codexThreadOptions(config) {
  const reasoning = ["minimal", "low", "medium", "high", "xhigh"].includes(config.codexReasoning)
    ? config.codexReasoning
    : "medium";
  return {
    workingDirectory: config.workingDirectory || "/workspace",
    model: config.codexModel || "gpt-5.6-sol",
    modelReasoningEffort: reasoning,
    sandboxMode: config.nativeTextTask ? "read-only" : config.sandboxMode || "workspace-write",
    networkAccessEnabled: config.nativeTextTask ? false : config.networkAccessEnabled !== false,
    webSearchMode: config.nativeTextTask ? "disabled" : config.webSearchMode || "live",
    approvalPolicy: config.approvalPolicy || "never",
    skipGitRepoCheck: true,
  };
}

async function createCodexClient(config) {
  const { Codex } = await import("@openai/codex-sdk");
  return new Codex(config.codexPathOverride ? { codexPathOverride: config.codexPathOverride } : {});
}

export async function runCodex(config, messages, tools, codexFactory = null) {
  // OpenRouter-only installations do not need to load or install the Codex
  // SDK. Keep it behind the Codex execution path so the simplest setup has no
  // remote npm download at all.
  const codex = codexFactory ? codexFactory() : await createCodexClient(config);
  const options = codexThreadOptions(config);
  const greeting = isAutomaticGreeting(messages);
  const offeredTools = greeting || config.nativeTextTask ? [] : tools;
  const outputSchema = codexOutputSchema(!greeting && !config.nativeTextTask);
  let resuming = !config.nativeTextTask && Boolean(config.codexThreadId);
  let thread = resuming
    ? codex.resumeThread(config.codexThreadId, options)
    : codex.startThread(options);
  const makeInput = async () => {
    const prompt = codexPrompt(config, messages, offeredTools, resuming);
    const images = await codexImages(messages, config);
    return images.length
      ? [{ type: "text", text: prompt }, ...images.map((path) => ({ type: "local_image", path }))]
      : prompt;
  };
  let turn;
  try {
    turn = await thread.run(await makeInput(), { outputSchema });
  } catch (error) {
    if (!resuming) throw error;
    resuming = false;
    thread = codex.startThread(options);
    turn = await thread.run(await makeInput(), { outputSchema });
  }
  let parsed = parseCodexResult(turn.finalResponse);
  if (config.nativeTextTask) parsed.toolCalls = [];
  // The schema forbids greeting tools. Keep that boundary even if a provider
  // returns a malformed structured result instead of honoring maxItems.
  if (greeting && parsed.toolCalls.length) {
    parsed = { text: "Ready. What would you like me to work on?", toolCalls: [] };
  }
  let usage = normalizeUsage(turn.usage);
  let retriedEmpty = false;
  if (!parsed.text && !parsed.toolCalls.length) {
    retriedEmpty = true;
    // Stay on the same thread so completed native actions are not replayed.
    turn = await thread.run(
      config.nativeTextTask
        ? "Return the text required by the original host system instructions with an empty toolCalls array. Do not use tools or address the chat user."
        : greeting
        ? "Return one short friendly greeting in text with an empty toolCalls array. Do not use any tools."
        : "Your previous turn returned no answer or outer tool call. Continue from the actual results already in this thread. Do not repeat completed actions or claim a child launched without its real result. Return the required structured object with either the next necessary outer tool call or a non-empty final text answer.",
      { outputSchema },
    );
    parsed = parseCodexResult(turn.finalResponse);
    if (config.nativeTextTask) parsed.toolCalls = [];
    if (greeting && parsed.toolCalls.length) {
      parsed = { text: "Ready. What would you like me to work on?", toolCalls: [] };
    }
    const retriedUsage = normalizeUsage(turn.usage);
    usage = Object.fromEntries(Object.entries(usage).map(([key, value]) => [key, value + retriedUsage[key]]));
  }
  return {
    ...parsed,
    usage,
    model: config.codexModel || "gpt-5.6-sol",
    threadId: thread.id,
    ...(!parsed.text && !parsed.toolCalls.length ? { emptyResponse: true } : {}),
    ...(retriedEmpty ? { retriedEmpty: true } : {}),
  };
}

function stateDirectory(config) {
  if (config.stateDirectory) return config.stateDirectory;
  const legacyPath = config.statePath || join(runtimeDirectory, "conversation-states.json");
  return legacyPath.replace(/\.json$/i, "");
}

function stateFile(config, key) {
  return join(stateDirectory(config), `${key}.json`);
}

function toolLinkFile(config, toolCallId) {
  const digest = createHash("sha256").update(toolCallId).digest("hex");
  return join(stateDirectory(config), "tool-links", `${digest}.json`);
}

function toolResultCallIds(value, results = new Set(), depth = 0, seen = new Set()) {
  if (depth > 10 || value == null || typeof value !== "object" || seen.has(value)) return results;
  seen.add(value);
  if (normalizedPartType(value) === "tool-result" && partToolCallId(value)) {
    results.add(partToolCallId(value));
  }
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    toolResultCallIds(child, results, depth + 1, seen);
  }
  return results;
}

function auditMessageShape(message) {
  const content = message?.content ?? message?.message?.content ?? message?.data?.content;
  const parts = Array.isArray(content) ? content : content && typeof content === "object" ? [content] : [];
  return {
    role: messageRole(message) || null,
    automationCompletion: Boolean(automationCompletionId(message)),
    cursorKeys: Object.keys(message?.providerOptions?.cursor ?? message?.message?.providerOptions?.cursor ?? message?.data?.providerOptions?.cursor ?? {}).sort().slice(0, 20),
    keys: message && typeof message === "object" ? Object.keys(message).sort().slice(0, 20) : [],
    contentKind: Array.isArray(content) ? "array" : typeof content,
    parts: parts.slice(0, 12).map((part) => ({
      type: typeof part?.type === "string" ? part.type : null,
      toolCallId: partToolCallId(part) || null,
      toolName: partToolName(part) || null,
      keys: part && typeof part === "object" ? Object.keys(part).sort().slice(0, 20) : [],
    })),
  };
}

async function linkedConversationKey(config, messages) {
  for (const toolCallId of toolResultCallIds(messages)) {
    try {
      const link = JSON.parse(await readFile(toolLinkFile(config, toolCallId), "utf8"));
      if (typeof link?.conversationKey === "string"
        && Date.now() - Number(link.createdAt || 0) < 24 * 60 * 60_000) {
        return link.conversationKey;
      }
    } catch {
      // Missing and expired links simply fall back to normal conversation identity.
    }
  }
  return null;
}

async function recordToolLinks(config, key, toolCalls) {
  for (const call of Array.isArray(toolCalls) ? toolCalls : []) {
    if (typeof call?.toolCallId !== "string" || !call.toolCallId) continue;
    const pathname = toolLinkFile(config, call.toolCallId);
    await mkdir(dirname(pathname), { recursive: true });
    const temporary = `${pathname}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({ conversationKey: key, createdAt: Date.now() }), { mode: 0o600 });
    await rename(temporary, pathname);
  }
}

async function readState(config, key) {
  try {
    const parsed = JSON.parse(await readFile(stateFile(config, key), "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    // Migrate a state lazily from the beta's single-file store when present.
    try {
      const legacyPath = config.statePath || join(runtimeDirectory, "conversation-states.json");
      const legacy = JSON.parse(await readFile(legacyPath, "utf8"));
      const migrated = legacy?.[key];
      return migrated && typeof migrated === "object" && !Array.isArray(migrated) ? migrated : null;
    } catch {
      return null;
    }
  }
}

async function writeState(config, key, state) {
  const pathname = stateFile(config, key);
  await mkdir(dirname(pathname), { recursive: true });
  const temporary = `${pathname}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
  await rename(temporary, pathname);
}

async function withStateLock(config, key, operation) {
  const pathname = stateFile(config, key);
  const lockPath = `${pathname}.lock`;
  await mkdir(dirname(lockPath), { recursive: true });
  const deadline = Date.now() + 30_000;
  while (true) {
    try {
      await mkdir(lockPath);
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const details = await stat(lockPath).catch(() => null);
      if (details && Date.now() - details.mtimeMs > 120_000) {
        await rm(lockPath, { recursive: true, force: true });
        continue;
      }
      if (Date.now() >= deadline) throw new Error("Timed out waiting for this Bot's router state lock");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  try {
    return await operation();
  } finally {
    await rm(lockPath, { recursive: true, force: true });
  }
}

async function mutateState(config, key, fallback, operation) {
  return withStateLock(config, key, async () => {
    const current = await readState(config, key) || fallback;
    const next = await operation(current);
    await writeState(config, key, next);
    return next;
  });
}

async function mergeState(config, key, fallback, patch) {
  return mutateState(config, key, fallback, (current) => ({ ...current, ...patch }));
}

async function saveThreadId(config, key, provider, model, threadId, threadEpoch) {
  return withStateLock(config, key, async () => {
    const current = await readState(config, key);
    if (!current
      || current.provider !== provider
      || current.model !== model
      || Number(current.threadEpoch || 0) !== Number(threadEpoch || 0)) return current;
    current.threadId = threadId;
    await writeState(config, key, current);
    return current;
  });
}

const SESSION_IDENTITY_PRIORITY = [
  ["botid"],
  ["agentid"],
  [
    "conversationid", "channelid", "roomid", "bcid", "chatid", "threadid",
    "lineageid", "rootid", "rootrequestid",
  ],
];

function normalizedIdentityKey(key) {
  return key.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function sessionIdentityCandidates(sessionOptions, { includeArrays = false } = {}) {
  const candidates = new Map();
  const accepted = new Set(SESSION_IDENTITY_PRIORITY.flat());
  const visit = (value, depth = 0) => {
    if (depth > 4 || value == null || typeof value !== "object") return;
    if (Array.isArray(value) && !includeArrays) return;
    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = normalizedIdentityKey(key);
      if (accepted.has(normalizedKey)
        && (typeof child === "string" || typeof child === "number")) {
        const values = candidates.get(normalizedKey) || [];
        values.push(String(child));
        candidates.set(normalizedKey, values);
      } else if (child && typeof child === "object") {
        visit(child, depth + 1);
      }
    }
  };
  visit(sessionOptions);
  return candidates;
}

function firstRequestIdentity(messages) {
  return messages
    .flatMap((message) => [
      message?.providerOptions?.cursor?.requestId,
      message?.message?.providerOptions?.cursor?.requestId,
      message?.data?.providerOptions?.cursor?.requestId,
    ])
    .find((value) => typeof value === "string" && value.trim());
}

function firstUserIdentity(messages) {
  return messages.map((message) => {
    const role = messageRole(message);
    return role === "user" || role === "human" ? extractUserQuery(collectText(message)) : "";
  }).find(Boolean);
}

export function conversationIdentity(messages, sessionOptions) {
  const candidates = sessionIdentityCandidates(sessionOptions);
  const selectedFields = SESSION_IDENTITY_PRIORITY
    .find((fields) => fields.some((field) => (candidates.get(field) || []).length > 0));
  let stableIds = [];
  if (selectedFields) {
    stableIds = selectedFields.flatMap((field) => (candidates.get(field) || [])
      .map((value) => `${field}:${value}`));
  }
  const firstRequestId = firstRequestIdentity(messages);
  // A request ID is turn-scoped in the live Grok 0.30.0 host. It is only a
  // last-resort identity when the session exposes no Bot or conversation ID.
  if (firstRequestId && stableIds.length === 0) stableIds.push(`first-request:${firstRequestId}`);
  const firstUser = firstUserIdentity(messages);
  const uniqueIds = [...new Set(stableIds)].sort();
  const seed = uniqueIds.length
    ? uniqueIds.join("|")
    : `first-user:${firstUser || collectText(messages[0]) || "empty"}`;
  return {
    key: createHash("sha256").update(seed).digest("hex"),
    source: selectedFields
      ? (selectedFields[0] === "botid" ? "bot" : selectedFields[0] === "agentid" ? "agent" : "conversation")
      : firstRequestId ? "request-fallback" : "content-fallback",
    fields: selectedFields
      ? selectedFields.filter((field) => (candidates.get(field) || []).length > 0)
      : [],
  };
}

function legacyConversationKey(messages, sessionOptions) {
  const stableIds = [];
  const visit = (value, depth = 0) => {
    if (depth > 4 || value == null || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = normalizedIdentityKey(key);
      if ([
        "agentid", "botid", "conversationid", "channelid", "roomid", "bcid",
        "chatid", "threadid", "lineageid", "rootid", "rootrequestid",
      ].includes(normalizedKey)
        && (typeof child === "string" || typeof child === "number")) {
        stableIds.push(`${normalizedKey}:${child}`);
      } else if (child && typeof child === "object") {
        visit(child, depth + 1);
      }
    }
  };
  visit(sessionOptions);
  const firstRequestId = firstRequestIdentity(messages);
  // A request ID is turn-scoped in the live Grok 0.30.0 host. Combining it
  // with an already stable Bot/conversation identifier silently forks state on
  // every message: `/provider` can report a switch that the next prompt loses.
  if (firstRequestId && stableIds.length === 0) stableIds.push(`first-request:${firstRequestId}`);
  const firstUser = firstUserIdentity(messages);
  const seed = stableIds.length
    ? [...new Set(stableIds)].sort().join("|")
    : `first-user:${firstUser || collectText(messages[0]) || "empty"}`;
  return createHash("sha256").update(seed).digest("hex");
}

async function stateForTurn(config, messages, sessionOptions) {
  const linkedKey = await linkedConversationKey(config, messages);
  const identity = conversationIdentity(messages, sessionOptions);
  const key = linkedKey ?? identity.key;
  const allowed = Array.isArray(config.providers) && config.providers.length ? config.providers : ["codex"];
  let state = await readState(config, key);
  if (!state && !linkedKey) {
    const legacyKey = legacyConversationKey(messages, sessionOptions);
    if (legacyKey !== key) {
      const legacyState = await readState(config, legacyKey);
      if (legacyState) {
        const migrated = {
          ...legacyState,
          conversationKey: key,
          migratedFromConversationKey: legacyKey,
        };
        state = await mutateState(config, key, migrated, (current) => current);
      }
    }
  }
  if (!state || typeof state !== "object") {
    const provider = allowed.includes(config.provider) ? config.provider : allowed[0];
    state = {
      conversationKey: key,
      sessionId: key.slice(0, 24),
      provider,
      model: provider === "openrouter"
        ? config.openRouterModel || "anthropic/claude-sonnet-4.6"
        : config.codexModel || "gpt-5.6-sol",
      reasoning: provider === "openrouter"
        ? config.openRouterReasoning || "medium"
        : config.codexReasoning || "medium",
      threadId: null,
      threadEpoch: 0,
      tools: [],
    };
    state = await mutateState(config, key, state, (current) => current);
  }
  return {
    state,
    key,
    identity: linkedKey
      ? { source: "tool-link", fields: identity.fields }
      : identity,
  };
}

async function appendAudit(config, event) {
  const pathname = config.auditPath || join(runtimeDirectory, "audit.jsonl");
  try {
    await mkdir(dirname(pathname), { recursive: true });
    const line = `${JSON.stringify({ timestamp: new Date().toISOString(), version: ROUTER_VERSION, ...event })}\n`;
    const details = await stat(pathname).catch(() => null);
    if (details?.size > 4 * 1024 * 1024) {
      await rename(pathname, `${pathname}.1`).catch(() => {});
    }
    await appendFile(pathname, line, { mode: 0o600 });
  } catch {
    // Diagnostics must never break a user turn.
  }
}

function channelControlKey(sessionOptions) {
  const root = sessionOptions.lineage?.rootParentRequestId;
  if (typeof root !== "string" && typeof root !== "number") return "";
  if (!String(root).trim()) return "";
  return createHash("sha256").update(String(root)).digest("hex");
}

function nativeGroupControl(sessionOptions) {
  const context = sessionOptions.grokBotRouterGroupContext;
  const message = context?.message;
  if (!context || typeof context.roomId !== "string" || !context.roomId
      || typeof context.memberId !== "string" || !context.memberId
      || typeof context.memberName !== "string" || !context.memberName
      || message?.kind !== "message" || message.role !== "user"
      || typeof message.id !== "string" || !message.id
      || typeof message.content !== "string") return null;
  const raw = message.content.trim();
  const text = addressedRouterControlText(raw);
  if (!ROUTER_CONTROL_PREFIX.test(text)) return null;
  const prefix = raw.slice(0, raw.indexOf(text)).trim()
    .replace(/<[^>]+>/g, " ")
    .replace(/\[(?:\/?)(?:mention|bot)[^\]]*\]/gi, " ")
    .replace(/\uFFFC/g, " ").replace(/\s+/g, " ").trim();
  const addressed = !prefix || prefix.toLowerCase() === `@${context.memberName}`.toLowerCase();
  const id = createHash("sha256").update(JSON.stringify([context.roomId, message.id, context.memberId])).digest("hex");
  return { text, addressed, id };
}

function channelControlLatchPath(config, sessionOptions) {
  const key = channelControlKey(sessionOptions);
  if (!key) return "";
  const base = config.channelControlLatchPath || join(runtimeDirectory, "channel-control-latch.json");
  return `${base}.${key}`;
}

async function rememberChannelControl(config, sessionOptions) {
  const pathname = channelControlLatchPath(config, sessionOptions);
  if (!pathname) return;
  const temporary = `${pathname}.${randomUUID()}.tmp`;
  try {
    await mkdir(dirname(pathname), { recursive: true });
    await writeFile(temporary, JSON.stringify({ completedAt: Date.now() }), { mode: 0o600 });
    await rename(temporary, pathname);
  } catch {
    // An unavailable receipt cannot break a deterministic control.
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}

async function hasRecentChannelControl(config, sessionOptions) {
  const pathname = channelControlLatchPath(config, sessionOptions);
  if (!pathname) return false;
  try {
    const value = JSON.parse(await readFile(pathname, "utf8"));
    const age = Date.now() - Number(value?.completedAt || 0);
    if (age >= 0 && age < CHANNEL_CONTROL_LATCH_TTL_MS) return true;
    await rm(pathname, { force: true });
  } catch {}
  return false;
}

function isChannelControlFollowOn(sessionOptions) {
  const groupMessage = sessionOptions.grokBotRouterGroupContext?.message;
  if (groupMessage?.kind === "message" && groupMessage.role === "user"
      && typeof groupMessage.id === "string" && groupMessage.id
      && typeof groupMessage.content === "string") return false;
  const hasFreshRawUserText = typeof sessionOptions.grokBotRouterControlText === "string"
    && sessionOptions.grokBotRouterControlText.trim();
  return !hasFreshRawUserText
    && Object.prototype.hasOwnProperty.call(sessionOptions, "skipLabeling")
    && Boolean(channelControlKey(sessionOptions));
}

function providerLabel(provider) {
  return provider === "openrouter" ? "OpenRouter" : "Codex SDK";
}

function defaultModel(config, provider) {
  return provider === "openrouter"
    ? config.openRouterModel || "anthropic/claude-sonnet-4.6"
    : config.codexModel || "gpt-5.6-sol";
}

function configuredModels(config, provider) {
  const models = provider === "openrouter" ? config.openRouterModels : config.codexModels;
  return [...new Set([
    defaultModel(config, provider),
    ...(Array.isArray(models) ? models.filter((model) => typeof model === "string") : []),
  ])];
}

function modelAliases(provider) {
  return provider === "openrouter"
    ? {
      claude: "anthropic/claude-sonnet-4.6",
      sonnet: "anthropic/claude-sonnet-4.6",
      gemini: "google/gemini-3.1-pro-preview",
      sol: "openai/gpt-5.6-sol",
      terra: "openai/gpt-5.6-terra",
      luna: "openai/gpt-5.6-luna",
    }
    : { sol: "gpt-5.6-sol", terra: "gpt-5.6-terra", luna: "gpt-5.6-luna", "gpt-5.6": "gpt-5.6-sol" };
}

async function doctorText(config, state) {
  const checks = [];
  checks.push(`Router ${ROUTER_VERSION}: OK`);
  checks.push(`Provider: ${providerLabel(state.provider)} (${state.model})`);
  checks.push(`Runtime: Node ${process.version}`);
  try {
    await persistedOpenRouterKey(config);
    checks.push("OpenRouter credential: configured and valid shape");
  } catch (error) {
    checks.push(String(error?.message || error).includes("present but")
      ? "OpenRouter credential: present but invalid shape"
      : "OpenRouter credential: not configured");
  }
  if (state.provider === "codex" || (config.providers || []).includes("codex")) {
    const cli = join(runtimeDirectory, "node_modules", ".bin", "codex");
    try {
      await stat(cli);
      checks.push("Codex CLI: installed");
    } catch {
      checks.push("Codex CLI: missing");
    }
  }
  checks.push(`Grok tools: bridged on demand (${state.provider === "codex" ? "structured adapter" : "native function calls"})`);
  checks.push("Run a real computer and sub-agent parity test before treating those capabilities as verified for a model.");
  return checks.join("\n");
}

async function controlResult(config, key, state, input) {
  const normalized = input.trim().replace(/\s+/g, " ");
  const command = normalized.toLowerCase();
  const persist = async (patch) => {
    const updated = await mergeState(config, key, state, patch);
    Object.assign(state, updated);
  };
  const result = (text) => ({
    provider: state.provider,
    model: state.model,
    text,
    toolCalls: [],
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    control: true,
  });
  if (command === "/provider" || command === "/router" || command === "/router status") {
    return result(`${providerLabel(state.provider)} is active for this bot. Model: ${state.model}. Reasoning: ${state.reasoning}.`);
  }
  if (command === "/reasoning") {
    return result(`Reasoning effort: ${state.reasoning}. Change it with /reasoning minimal|low|medium|high|xhigh.`);
  }
  if (command === "/router help" || command === "/providers") {
    return result([
      "GrokRouter controls:",
      "• /provider codex|openrouter — switch this bot",
      "• /provider — show active provider",
      "• /models — list configured models",
      "• /model <id> — switch this bot's model",
      "• /models <id> — also switches (forgiving alias)",
      "• paste a listed vendor/model ID by itself — also switches",
      "• /reasoning minimal|low|medium|high|xhigh — change effort",
      "• /reasoning — show current effort",
      "• /router reset — start a fresh provider thread",
      "• /router doctor — show installation health",
      "• /doctor — show the same installation health",
    ].join("\n"));
  }
  if (command === "/router doctor" || command === "/doctor") return result(await doctorText(config, state));
  if (command === "/router reset") {
    await persist({
      threadId: null,
      threadEpoch: Number(state.threadEpoch || 0) + 1,
      completedTurnFingerprint: null,
      completedTurnAt: null,
    });
    return result("Provider thread reset. The Grok transcript remains available and will seed the next turn.");
  }
  const providerMatch = normalized.match(/^\/(?:provider|router)\s+(codex|openrouter)$/i);
  if (providerMatch) {
    const provider = providerMatch[1].toLowerCase();
    const allowed = Array.isArray(config.providers) ? config.providers : ["codex"];
    if (!allowed.includes(provider)) return result(`Provider “${provider}” is not enabled. Available: ${allowed.join(", ")}.`);
    const previous = `${providerLabel(state.provider)} (${state.model})`;
    const model = defaultModel(config, provider);
    const reasoning = provider === "openrouter"
      ? config.openRouterReasoning || "medium"
      : config.codexReasoning || "medium";
    await persist({
      provider,
      model,
      reasoning,
      threadId: null,
      threadEpoch: Number(state.threadEpoch || 0) + 1,
    });
    const output = result(`Switched this bot from ${previous} to ${providerLabel(provider)} (${model}). Its Grok transcript is preserved.`);
    output.provider = provider;
    output.model = model;
    return output;
  }
  if (command === "/model") return result(`${providerLabel(state.provider)} model: ${state.model}. Reasoning: ${state.reasoning}.`);
  if (command === "/models") {
    const models = configuredModels(config, state.provider);
    return result([
      `${providerLabel(state.provider)} models:`,
      ...models.map((model) => `• ${model}`),
      `Current: ${state.model}`,
      "Switch: send /model <id>, /models <id>, or paste one listed vendor/model ID by itself.",
    ].join("\n"));
  }
  const modelMatch = normalized.match(/^\/models?\s+(.+)$/i);
  if (modelMatch) {
    const requested = modelMatch[1].trim();
    const model = modelAliases(state.provider)[requested.toLowerCase()] || requested;
    if (state.provider === "codex" && !configuredModels(config, "codex").includes(model)) {
      return result(`Unknown Codex model “${requested}”. Use /models to see the supported models.`);
    }
    if (state.provider === "openrouter" && !/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:+-]*$/i.test(model)) {
      return result(`Invalid OpenRouter model ID “${requested}”. Use vendor/model format.`);
    }
    const previous = state.model;
    await persist({ model, threadId: null, threadEpoch: Number(state.threadEpoch || 0) + 1 });
    const output = result(`Switched this bot from ${previous} to ${model} on ${providerLabel(state.provider)}. Its Grok transcript is preserved.`);
    output.model = model;
    return output;
  }
  const pastedModel = configuredModels(config, state.provider)
    .find((model) => model.includes("/") && model.toLowerCase() === normalized.toLowerCase());
  if (pastedModel) {
    const previous = state.model;
    await persist({ model: pastedModel, threadId: null, threadEpoch: Number(state.threadEpoch || 0) + 1 });
    const output = result(`Switched this bot from ${previous} to ${pastedModel} on ${providerLabel(state.provider)}. Its Grok transcript is preserved.`);
    output.model = pastedModel;
    return output;
  }
  if (/^\/models?(?:\s|$)/i.test(normalized)) {
    return result("Model command not understood. Send /models to see choices, then /model <id> or paste one listed vendor/model ID by itself.");
  }
  const reasoningMatch = normalized.match(/^\/reasoning\s+(minimal|low|medium|high|xhigh)$/i);
  if (reasoningMatch) {
    const reasoning = reasoningMatch[1].toLowerCase();
    await persist({ reasoning, threadId: null, threadEpoch: Number(state.threadEpoch || 0) + 1 });
    return result(`Reasoning effort set to ${state.reasoning} for ${state.model}.`);
  }
  if (/^\/(?:providers?|routers?|models?|reasoning)(?:\s|$)/i.test(normalized)) {
    return result("Router command not understood. Send /router help to see the exact controls.");
  }
  if (/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:+-]*$/i.test(normalized)) {
    return result(`Model “${normalized}” is not in this bot's configured list. Send /models, then paste one listed ID or use /model <id> explicitly.`);
  }
  return null;
}

async function readStdin(limitBytes = MAX_INPUT_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    process.stdin.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error(`Bridge input exceeded ${limitBytes} bytes`));
        process.stdin.destroy();
        return;
      }
      chunks.push(chunk);
    });
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

function rewriteHostToolCallIds(toolCalls) {
  return (Array.isArray(toolCalls) ? toolCalls : []).map((call) => ({
    ...call,
    toolCallId: `grokbot-router-tool-${randomUUID()}`,
  }));
}

export async function runTurn(input, dependencies = {}) {
  const config = input.config && typeof input.config === "object" ? input.config : {};
  const messages = Array.isArray(input.messages) ? input.messages : [];
  const tools = Array.isArray(input.tools) ? input.tools : [];
  const sessionOptions = input.sessionOptions && typeof input.sessionOptions === "object" ? input.sessionOptions : {};
  const { state, key, identity } = await stateForTurn(config, messages, sessionOptions);
  const nativeTextTask = sessionOptions.grokBotRouterTextTask === "memory-extraction"
    ? "memory-extraction" : "";
  if (nativeTextTask) {
    const taskConfig = {
      ...config, nativeTextTask, codexThreadId: null,
      codexModel: state.model, codexReasoning: state.reasoning,
      openRouterModel: state.model, openRouterReasoning: state.reasoning,
      adapterSessionId: `${state.sessionId}:${nativeTextTask}`,
    };
    const receipt = { task: nativeTextTask, sessionId: state.sessionId, provider: state.provider, model: state.model, toolNames: [] };
    await appendAudit(config, { event: "native_text_task_start", ...receipt });
    try {
      const output = state.provider === "openrouter"
        ? await runOpenRouter(taskConfig, messages, [], dependencies.fetchImpl)
        : await runCodex(taskConfig, messages, [], dependencies.codexFactory);
      if (output.emptyResponse) throw new Error("Native text task returned an empty response after one retry");
      await appendAudit(config, { event: "native_text_task_ok", ...receipt });
      // A helper never resumes or replaces the Bot's conversation thread,
      // caches tools, handles controls, or claims a human/completion receipt.
      return { ok: true, provider: state.provider, model: state.model, text: output.text, toolCalls: [], usage: output.usage };
    } catch (error) {
      await appendAudit(config, { event: "native_text_task_error", ...receipt, error: redactDiagnostic(error?.message || error) });
      throw error;
    }
  }
  const userFingerprint = userTurnFingerprint(messages);
  const failedDeliveries = failedDeliveryReceiptIds(messages);
  // A newly failed delivery reopens this input exactly once per durable
  // receipt. Replays of the same failure still share the normal turn lock.
  const turnFingerprint = userFingerprint && failedDeliveries.length
    ? createHash("sha256").update([userFingerprint, "failed-delivery", ...failedDeliveries].join("\0")).digest("hex")
    : userFingerprint;
  const automationContinuation = latestAutomationCompletionIndex(messages) > latestUserIndex(messages);
  const continuationSignature = automationContinuation
    ? automationContinuationSignature(messages)
    : "";
  const suppressed = async (reason) => {
    await appendAudit(config, {
      event: "turn_suppressed",
      reason,
      sessionId: state.sessionId,
      identitySource: identity.source,
      identityFields: identity.fields,
      provider: state.provider,
      model: state.model,
      messageShapes: messages.slice(-8).map(auditMessageShape),
    });
    return {
      ok: true,
      provider: state.provider,
      model: state.model,
      text: "",
      toolCalls: [],
      alreadyDelivered: true,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    };
  };
  if (hasDeliveryAfterLatestQuery(messages)) {
    if (turnFingerprint && state.completedTurnFingerprint !== turnFingerprint) {
      const updated = await mergeState(config, key, state, {
        completedTurnFingerprint: turnFingerprint,
        completedTurnAt: Date.now(),
      });
      Object.assign(state, updated);
    }
    return suppressed("delivery-after-latest-input");
  }
  let continuationClaimed = false;
  if (continuationSignature) {
    const now = Date.now();
    const updated = await mutateState(config, key, state, (current) => {
      const processed = Array.isArray(current.processedAutomationContinuationSignatures)
        ? current.processedAutomationContinuationSignatures
        : [];
      const claims = Object.fromEntries(Object.entries(current.automationContinuationClaims || {})
        .filter(([, claimedAt]) => now - Number(claimedAt) < 15 * 60_000));
      if (processed.includes(continuationSignature) || claims[continuationSignature]) {
        return { ...current, automationContinuationClaims: claims };
      }
      continuationClaimed = true;
      claims[continuationSignature] = now;
      return { ...current, automationContinuationClaims: claims };
    });
    Object.assign(state, updated);
    if (!continuationClaimed) {
      return suppressed("automation-continuation-already-claimed-or-processed");
    }
  }
  const groupControl = automationContinuation ? null : nativeGroupControl(sessionOptions);
  if (groupControl && !groupControl.addressed) {
    return suppressed("channel-control-not-addressed");
  }
  let groupControlClaim = "";
  if (groupControl) {
    groupControlClaim = createHash("sha256").update(JSON.stringify([groupControl.id, failedDeliveries])).digest("hex");
    let claimed = false;
    const updated = await mutateState(config, key, state, (current) => {
      const receipts = current.processedGroupControls || [];
      if (receipts.includes(groupControlClaim)) return current;
      claimed = true;
      return { ...current, processedGroupControls: [...receipts, groupControlClaim].slice(-64) };
    });
    Object.assign(state, updated);
    if (!claimed) return suppressed("channel-control-already-processed");
  }
  const latestVisibleControl = structuredRouterControlText(messages)
    || addressedRouterControlText(latestUserText(messages));
  const explicitControl = groupControl?.text || hostRouterControlText(messages, sessionOptions)
    || (ROUTER_CONTROL_PREFIX.test(latestVisibleControl) ? latestVisibleControl : "");
  if (!automationContinuation
      && !explicitControl
      && isChannelControlFollowOn(sessionOptions)
      && await hasRecentChannelControl(config, sessionOptions)) {
    return suppressed("channel-control-follow-on");
  }
  const controlText = explicitControl
    || nativeWorkflowControlText(messages)
    || latestVisibleControl;
  let control;
  try {
    control = automationContinuation ? null : await controlResult(config, key, state, controlText);
  } catch (error) {
    if (groupControlClaim) await mutateState(config, key, state, (current) => ({
      ...current, processedGroupControls: (current.processedGroupControls || []).filter((id) => id !== groupControlClaim),
    }));
    throw error;
  }
  if (control) {
    await rememberChannelControl(config, sessionOptions);
    await appendAudit(config, {
      event: "control_turn",
      controlCommand: String(controlText || "").split(/\s+/, 1)[0],
      sessionId: state.sessionId,
      identitySource: identity.source,
      identityFields: identity.fields,
      provider: state.provider,
      model: state.model,
    });
    return { ok: true, ...control };
  }
  const completedTurnStillFresh = Number(state.completedTurnAt || 0) > 0
    && Date.now() - Number(state.completedTurnAt || 0) < COMPLETED_TURN_TTL_MS;
  if (!automationContinuation
      && turnFingerprint
      && state.completedTurnFingerprint === turnFingerprint
      && completedTurnStillFresh) {
    return suppressed("completed-turn-fingerprint");
  }
  let turnClaimed = false;
  if (!automationContinuation && turnFingerprint) {
    const now = Date.now();
    const updated = await mutateState(config, key, state, (current) => {
      const completedStillFresh = current.completedTurnFingerprint === turnFingerprint
        && Number(current.completedTurnAt || 0) > 0
        && now - Number(current.completedTurnAt || 0) < COMPLETED_TURN_TTL_MS;
      const activeStillFresh = current.activeTurnFingerprint === turnFingerprint
        && Number(current.activeTurnClaimedAt || 0) > 0
        && now - Number(current.activeTurnClaimedAt || 0) < ACTIVE_TURN_TTL_MS;
      if (completedStillFresh || activeStillFresh) return current;
      turnClaimed = true;
      return {
        ...current,
        activeTurnFingerprint: turnFingerprint,
        activeTurnClaimedAt: now,
      };
    });
    Object.assign(state, updated);
    if (!turnClaimed) return suppressed("user-turn-already-claimed-or-completed");
  }
  const toolsFromHost = actionableTools(tools);
  if (toolsFromHost.length) {
    state.tools = toolsFromHost;
    const updated = await mergeState(config, key, state, { tools: toolsFromHost });
    Object.assign(state, updated);
  }
  const effectiveTools = toolsFromHost.length ? toolsFromHost : actionableTools(state.tools);
  const pendingBackgroundIds = pendingBackgroundAgentIds(messages);
  const turnConfig = {
    ...config,
    provider: state.provider,
    codexModel: state.model,
    codexReasoning: state.reasoning,
    codexThreadId: state.threadId,
    openRouterModel: state.model,
    openRouterReasoning: state.reasoning,
    adapterSessionId: state.sessionId,
  };
  const threadEpoch = Number(state.threadEpoch || 0);
  await appendAudit(config, {
    event: "turn_start",
    sessionId: state.sessionId,
    identitySource: identity.source,
    identityFields: identity.fields,
    provider: state.provider,
    model: state.model,
    messageCount: messages.length,
    sessionOptionKeys: objectKeyPaths(sessionOptions),
    controlProbe: controlProbe(messages),
    messageTextFingerprints: messages.slice(-8).map((message) => {
      const text = collectText(message?.content ?? message);
      return {
        role: messageRole(message),
        length: text.length,
        sha256: createHash("sha256").update(text).digest("hex").slice(0, 16),
      };
    }),
    toolCount: effectiveTools.length,
    toolNames: effectiveTools.map((tool) => tool.name),
    messageShapes: messages.slice(-16).map(auditMessageShape),
  });
  let result;
  try {
    result = state.provider === "openrouter"
      ? await runOpenRouter(turnConfig, messages, effectiveTools, dependencies.fetchImpl)
      : await runCodex(turnConfig, messages, effectiveTools, dependencies.codexFactory);
    if (result.emptyResponse) {
      const completion = latestAutomationCompletion(messages);
      if (pendingBackgroundIds.length) {
        result = { ...result, text: "", emptyResponse: false };
      } else if (automationContinuation && completion?.text) {
        result = { ...result, text: completion.text, emptyResponse: false, emptyRecovery: "automation-completion" };
      } else {
        throw new Error(`${state.provider === "codex" ? "Codex SDK" : "OpenRouter"} returned an empty response after one retry`);
      }
    }
    result.toolCalls = rewriteHostToolCallIds(result.toolCalls);
  } catch (error) {
    if (turnClaimed) {
      await mutateState(config, key, state, (current) => current.activeTurnFingerprint === turnFingerprint
        ? { ...current, activeTurnFingerprint: null, activeTurnClaimedAt: null }
        : current).catch(() => {});
    }
    if (continuationClaimed) {
      await mutateState(config, key, state, (current) => {
        const claims = { ...(current.automationContinuationClaims || {}) };
        delete claims[continuationSignature];
        return { ...current, automationContinuationClaims: claims };
      }).catch(() => {});
    }
    const diagnostic = redactDiagnostic(error?.message || error);
    await appendAudit(config, {
      event: "turn_error",
      sessionId: state.sessionId,
      provider: state.provider,
      model: state.model,
      error: diagnostic,
    });
    throw error;
  }
  if (result.threadId) {
    state.threadId = result.threadId;
    await saveThreadId(config, key, state.provider, state.model, result.threadId, threadEpoch);
  }
  let waitingForBackground = false;
  if (pendingBackgroundIds.length) {
    const remainingCalls = (result.toolCalls || []).filter((call) => !isDeliveryToolCall({
      function: { name: call.toolName, arguments: jsonString(call.args || {}) },
    }));
    if (result.text || remainingCalls.length !== (result.toolCalls || []).length || !remainingCalls.length) {
      result = { ...result, text: "", toolCalls: remainingCalls };
      waitingForBackground = !remainingCalls.length;
      if (waitingForBackground) {
        // Grok requires an acknowledgement for the originating user request.
        // Silence causes its ack-redrive recovery to retry that request even
        // after a separate child-completion request has delivered the result.
        // This fixed acknowledgement is justified by the paired launch receipt;
        // it never forwards the provider's unverified result or delivery call.
        result.text = "Sub-agent started. I’ll wait for its actual result.";
      }
      if (!waitingForBackground) await suppressed("background-delivery-deferred-while-tools-continue");
    }
  }
  if (continuationSignature) {
    const updated = await mutateState(config, key, state, (current) => {
      const claims = { ...(current.automationContinuationClaims || {}) };
      delete claims[continuationSignature];
      return {
        ...current,
        automationContinuationClaims: claims,
        processedAutomationContinuationSignatures: [
          ...(Array.isArray(current.processedAutomationContinuationSignatures)
            ? current.processedAutomationContinuationSignatures
            : []),
          continuationSignature,
        ].slice(-64),
      };
    });
    Object.assign(state, updated);
  }
  if (turnClaimed) {
    const completed = Boolean(result.text) && !(result.toolCalls || []).length;
    const updated = await mutateState(config, key, state, (current) => {
      if (current.activeTurnFingerprint !== turnFingerprint) return current;
      return {
        ...current,
        activeTurnFingerprint: null,
        activeTurnClaimedAt: null,
        ...(completed ? {
          completedTurnFingerprint: turnFingerprint,
          completedTurnAt: Date.now(),
        } : {}),
      };
    });
    Object.assign(state, updated);
  }
  if (waitingForBackground) {
    await suppressed("background-task-awaiting-completion");
  }
  await recordToolLinks(config, key, result.toolCalls);
  await appendAudit(config, {
    event: "turn_ok",
    sessionId: state.sessionId,
    provider: state.provider,
    model: result.model || state.model,
    responseCharacters: result.text?.length || 0,
    toolCallCount: result.toolCalls?.length || 0,
    toolNames: (result.toolCalls || []).map((call) => call.toolName).filter(Boolean),
    toolCallIds: (result.toolCalls || []).map((call) => call.toolCallId).filter(Boolean),
    ...(result.emptyRecovery ? { emptyRecovery: result.emptyRecovery } : {}),
    ...(result.retriedEmpty ? { retriedEmpty: true } : {}),
    ...(result.recoveredTextualToolCall ? { recoveredTextualToolCall: true } : {}),
    ...(result.normalizedLiteralDelivery ? { normalizedLiteralDelivery: true } : {}),
    ...(result.textualToolDiagnostics ? { textualToolDiagnostics: result.textualToolDiagnostics } : {}),
  });
  const {
    emptyResponse: _emptyResponse,
    retriedEmpty: _retriedEmpty,
    emptyRecovery: _emptyRecovery,
    recoveredTextualToolCall: _recoveredTextualToolCall,
    normalizedLiteralDelivery: _normalizedLiteralDelivery,
    textualToolDiagnostics: _textualToolDiagnostics,
    ...publicResult
  } = result;
  return { ok: true, provider: state.provider, ...publicResult };
}

async function main() {
  const input = JSON.parse(await readStdin());
  const result = await runTurn(input);
  process.stdout.write(JSON.stringify(result));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch(async (error) => {
    const message = redactDiagnostic(error instanceof Error ? error.message : error, 1_000);
    try {
      const raw = { ok: false, error: message };
      process.stdout.write(JSON.stringify(raw));
    } finally {
      process.exitCode = 0;
    }
  });
}
