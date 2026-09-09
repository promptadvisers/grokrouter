# Architecture

This document is the implementation-level companion to [How it works, without the jargon](HOW-IT-WORKS.md). The repository never replaces Grok Bot as the user interface or tool host. It inserts one exact-version-gated executor at the inference seam and keeps the provider-specific logic in a separate runtime.

![GrokRouter end-to-end](diagrams/grokbot-router-end-to-end.svg)

## System boundary

| Layer | Owns | Does not own |
| --- | --- | --- |
| Official Grok Bot | Chat UI, Bots, transcript, computer, files, browser, tool execution, permission UX and assistant delivery | Routed provider credentials or per-Bot provider selection |
| Patched host executor | Decide stock versus routed path, sanitize the host payload, launch the router runtime and translate its result back into Grok's protocol | Provider implementation, long-term state or arbitrary tool execution |
| Router runtime | Deterministic controls, stable Bot identity, provider/model state, replay protection, provider calls, transcript conversion and redacted audit | Grok's UI, permission decisions or the computer itself |
| Codex SDK / OpenRouter | Model inference and provider-native thread state | Authority to invent a Grok tool that the host did not offer |
| Native platform installer shells | Swift/AppKit on macOS and sandboxed Electron on Windows: exact compatibility checks, loopback/noVNC transport, checksummed install, provider setup, restore and cleanup | Grok account data or an unknown host build |

## Install and update flow

1. The native installer verifies the supported Grok Bot app and exact version before opening a diagnostic session.
2. Grok Bot is restarted with Electron diagnostics bound to `127.0.0.1` only. The installer reuses an existing noVNC computer target when possible.
3. Accurate macOS Vision OCR or the pinned offline Windows Tesseract worker, plus a harmless prompt probe, establishes that the Bot's Terminal is open and focused. Transfer stops if that cannot be proved.
4. The installer types a small bootstrap through the connected noVNC RFB controller. Text is paced, every retry begins with Ctrl-C, and the archive plus every payload member has an expected SHA-256.
5. `remote/install.sh` stages pinned Node dependencies and the router payload inside the Bot computer.
6. `patch/router_patch.py` verifies an allowlisted stock-host SHA-256 and byte-count pair plus every source anchor exactly once. The exact pair can come from the payload or a downloaded host registry whose Ed25519 signature was verified against the public key pinned in the payload. It writes a persistent verified original under `/home/box/sand-data/grokbot-router-backup/`, syntax-checks the generated JavaScript and atomically activates it.
7. The desktop installer runs installation with a deferred restart, observes the authoritative payload sentinel, and verifies native command registration while the gateway remains available. It then requests the host restart and requires its receipt before closing the diagnostic connection and reopening Grok Bot normally. Repair uses the same order; stock restore removes router commands before restarting.

The installed runtime also starts a small persistent watchdog and registers it with the Bot desktop's XDG autostart. If Grok later replaces the live host with an allowlisted stock build while routing remains enabled, the watchdog reapplies the same exact hash, byte-count and anchor-gated patch and restarts that host. On an unknown replacement it checks for a signed registry update at most once per hour. An unsigned entry, unknown hash, wrong byte count, missing anchor, intentional stock restore or disabled router is never repaired automatically.

An update follows the same path. If the live file already contains a router, the patcher must exactly reconstruct it from a trusted stock backup using a supported published transformation before upgrading it. A marker alone is insufficient. An unknown or foreign live file is never automatically replaced from an older backup. Provider/model selections are preserved unless the installer explicitly changes them, while the packaged model catalog and runtime are replaced. A newly reviewed stock host for an already supported desktop version can be added to the signed registry without replacing the installer. A new Grok Bot version or changed source seam still requires a new bundled manifest and the complete automated and fresh-Bot live gate.

## Control turn

The normal composer is the control surface. `/models`, `/provider`, `/model`, `/reasoning`, `/doctor`, `/router doctor`, `/router reset` and their documented aliases are parsed before replay detection or provider inference. The payload also installs user-invocable skill descriptors under Grok's documented user skill root, which makes the six command families eligible for its native `/` suggestion menu. Those descriptors do not implement or authorize a control; the runtime remains the only command authority. In a channel, the parser also accepts a pure leading Bot address such as `@Research Bot /provider`; prose that merely mentions a command is not intercepted. A recognized command updates only that addressed Bot's state and returns a deterministic receipt through Grok's normal delivery path.

The installer links only missing skill names or links already owned by the current GrokRouter installation. A pre-existing user skill wins, is never replaced, and is reported as a discovery conflict by Doctor. Removing GrokRouter removes only its own links. Command determinism comes from interception before inference, not from autocomplete registration. Invalid near-misses and unlisted bare model IDs also stop at the control plane instead of inviting a model to invent an answer.

## Turn flow

1. Grok Bot creates its normal session with the conversation, system instructions, and currently available tools.
2. The small host adapter checks `provider.json`. If routing is disabled, the original inference path continues untouched.
3. If enabled, the adapter launches the isolated Node runtime and sends sanitized JSON over stdin: config, transcript, tool schemas, and stable session identifiers.
4. The runtime selects the provider stored for that Bot.
5. Codex starts/resumes an SDK thread; OpenRouter sends a Chat Completions request with native function schemas.
6. A normal text response is wrapped in Grok's user-delivery tool. A provider tool request is returned to Grok for execution.
7. Grok executes computer/browser/file/orchestration tools in its existing host. Their results re-enter the transcript and the same provider thread continues.

Grok's ordinary hidden continuation prompts are filtered so a native tool result is not mistaken for another user request. A visible status message or permission bubble does not count as completion while an outer tool call remains unresolved; the matching result must still resume the provider. Every suppressed turn is recorded with a bounded reason and non-secret protocol IDs so a host-side approval gap cannot look like a silent provider failure.

A finished background task is a distinct case. The automation inbox injects a hidden message tagged with `sandAutomationCompletionId`. Native child revival uses a separate hidden parent request. The runtime unwraps Grok's model-facing `user_query` envelope, matches the exact hidden child-completion prefix, and uses the preserved `providerOptions.cursor.requestId` as its durable identity. Timestamps and separate message-ID parts do not hide the completion. Missing IDs, quoted lookalikes, and ordinary hidden reminders do not become completion events. The stock completion formatter is unchanged. It removes internal markers before forwarding the completion to the active provider and treats the completion as a new delivery boundary inside the existing user turn. This allows the child result to reach chat without replaying the earlier “subagent started” response. A durable signature combines that completion ID with later non-delivery tool-result IDs. It is claimed under the per-Bot lock before inference, expires after a bounded interval, and is cleared by reset. Sequential or concurrent host replays run once while controls and genuinely new tool rounds still proceed.

## Tool turn

Tool authority always flows from Grok outward:

1. Grok includes the tool schemas available to the current turn.
2. The runtime converts only those schemas for the selected provider.
3. The provider may request one of them. Provider-originated call IDs are replaced with router-owned UUIDs before crossing the host boundary.
4. The host executor returns the structured request to Grok. It does not perform the action itself.
5. Grok applies its existing permission behavior and performs the computer, file, browser or orchestration action.
6. The matching host result appears in a later transcript invocation. The runtime normalizes it and resumes the same provider thread.
7. Parent replies use Grok's canonical assistant-delivery handler. Native child sessions, identified by the host's `isSubagent` flag, finish through the response stream so Grok can collect their final text. A failed delivery result is not a completed answer; its durable receipt permits one recovery without replaying that receipt indefinitely.

Printed pseudo-tool syntax is not authority. The guarded OpenRouter compatibility parser can recover a model's textual dialect only when it maps to the exact schema Grok offered for that turn. If Grok supplied no actionable schema, the text remains inert. This is why the latest OpenRouter Shell gate is correctly recorded as blocked rather than presented as tool parity.

## Codex bridge

Codex receives a JSON response schema with `text` and `toolCalls`. Grok's outer tools are described in the prompt with their JSON schemas. Codex can do native Codex work inside `/workspace` or request an outer Grok tool. The adapter never claims a tool completed until Grok returns its result in a later transcript turn.

Images are written to a private temporary directory and passed as Codex `local_image` inputs. At most four images and 20 MB per image are accepted per turn.

## OpenRouter bridge

Grok messages are converted to OpenAI-compatible roles/content. Outer tools become native function definitions. Known camel-case and snake-case Grok wrappers are normalized, provider IDs are replaced with router-owned UUIDs, orphan results are dropped, and dangling calls receive a bounded synthetic result before the transcript is sent upstream. Visual tool results become a follow-up multimodal user message. The secret is loaded at request time and is not serialized into state or audit output.

An explicit OpenRouter delegation request is provider-aware. If Grok offered a dedicated sub-agent tool, that tool is forced on the first round; otherwise an offered `GetDynamicTools` broker is forced so the model discovers the real orchestration schema before calling it. If Grok exposed no actionable schema, the provider is told that it cannot launch a real child and must not invent a launch or completion. This improves use of available orchestration without weakening the rule that the router cannot create tool authority the host did not supply.

An otherwise empty OpenRouter response is retried once. If it occurs while reviving a completed background task, the adapter returns the tagged child-completion text deterministically rather than losing the result. An ordinary empty response still fails closed after the retry.

When the newest user request explicitly asks for an exact literal reply, OpenRouter still performs the inference but receives no outer-tool schemas for that turn. The same no-tools rule applies to Grok's automatic new-Bot greeting, identified by the absence of a visible user query, tool result, or tagged background completion. This prevents a simple text proof or first greeting from wandering into an unrelated long-running tool call.

## State and concurrency

A SHA-256 state key is derived from Grok's stable identity fields. A Bot ID takes priority over agent and conversation IDs, so the same Bot keeps its provider/model choice when it participates in a channel. Roster arrays are never treated as identity: reordering, adding or removing other channel members cannot fork that Bot's state. If an older build stored a combined Bot-and-conversation key, the runtime migrates that state lazily on the first turn. Every Bot gets its own JSON state file and atomic rename path. Short-lived per-Bot lock directories prevent concurrent control commands from corrupting state. All targeted mutations re-read and merge under that lock. A thread epoch is incremented on reset or provider/model changes; a long Codex turn persists its thread ID only if the provider/model and epoch still match, preventing a late completion from undoing a switch or resurrecting a reset thread.

Stable Bot, agent, chat, thread, lineage and root identifiers outrank request-scoped IDs. Within that stable set, Bot identity outranks conversation scope. The beta.31 implementation combined a stable Bot ID with a changing request ID, which split one Bot across state files and caused the next message to fall back to the installer default. The beta.32 identity order fixed that class, and the exact beta.38 artifact proved Luna persisted into the following normal inference while a second new Bot remained on its own default.

## Patch boundary

The project never bundles Grok Bot's proprietary host source. `router_patch.py` is an original transformation with exact hashes and anchors. It injects one executor, one session selection branch, stable Bot identity forwarding, without changing the native child formatter. All large provider logic remains outside the host in the independently replaceable runtime.

## Restore and bypass flow

- `grokbot-router disable` leaves the installed adapter in place but sends new sessions down the stock path.
- `grokbot-router enable` resumes routing.
- `grokbot-router repair`, or **Repair** in GrokRouter, reapplies the adapter only when the live host passes the exact stock hash and anchor gates. It also reenables the lifecycle watchdog.
- `grokbot-router uninstall`, or **Restore stock** in GrokRouter, verifies the persistent stock backup, copies it over the routed host and emits the restore sentinel before a delayed restart.
- GrokRouter closes its temporary loopback diagnostic session and reopens Grok Bot normally whether install or restore succeeds or fails.

The exact beta.38 artifact passed install, verified stock restore and post-restore reinstall before its final fresh-Bot routing proof. Restore is therefore part of the acceptance cycle, not an untested emergency instruction.

## Trust and data boundaries

- Provider credentials enter through the installer and Grok Bot's protected Secrets store. They are loaded at request time and are excluded from state, repository files and audit output.
- The selected provider receives the conversation and media required for that routed turn. Selecting another provider changes this data recipient.
- Grok remains the executor and permission boundary for outer tools. The provider receives tool results only after Grok executes an offered tool.
- The child runtime receives an explicit environment allowlist instead of the full host environment.
- Audit records use bounded event names, counts, provider/model receipts, suppression reasons and non-secret protocol identifiers. Recognizable key shapes and raw provider errors are redacted.
- The diagnostic Electron endpoint binds to `127.0.0.1` and exists only during an installer operation.

See [SECURITY.md](../SECURITY.md) for the threat model and [TEST-MATRIX.md](TEST-MATRIX.md) for the difference between code-level capability and live-verified behavior.

## Failure behavior

- Missing/disabled config: stock inference path.
- Provider error: a private diagnostic message is delivered; secrets and raw provider stderr are not sent to chat.
- Host adapter exception: the chat receives the bounded generic error and the redacted audit receives a `host_bridge_error` event, so a host failure cannot exist only in the remote console.
- Unknown host: installation stops before modification.
- Invalid generated JavaScript: installation stops before atomic replacement.
- Runtime activation failure: prior router runtime restored.
- Provider changed while a turn is running: stale thread ID is not written over the new selection.
- Background task started but no tagged completion arrives: the launch receipt is not represented as the child result; the live acceptance gate remains failed until the returned result is visible.
- Provider returns an empty background continuation: retry once, then deliver the tagged completion text. Empty ordinary turns still fail closed.
- Child runtime: receives only an explicit environment allowlist; unrelated host secrets are not inherited.
- Installer operation ends: its loopback diagnostic port is closed and Grok Bot is relaunched normally, whether the operation succeeded or failed.
