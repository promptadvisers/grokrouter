# How it works, without the jargon

The shortest explanation is: **Grok Bot keeps being the app you use, while a small router lets each Bot choose a different AI model for the actual thinking.**

![GrokRouter end-to-end diagram](diagrams/grokbot-router-end-to-end.svg)

YouTube-ready files:

- [4K PNG, 3840×2160](diagrams/grokbot-router-end-to-end-4k.png)
- [Editable 16:9 SVG, 1920×1080](diagrams/grokbot-router-end-to-end.svg)

## Read the diagram in 45 seconds

1. **You type in Grok Bot.** The app, Bot, conversation history, files and computer stay where they already are.
2. **The router checks that Bot's saved choice.** One Bot can use Claude through OpenRouter, another can use a Codex model, and changing one does not change the others.
3. **The chosen AI handles the turn.** The router sends the cleaned conversation and the tools Grok made available for that turn to Codex SDK or OpenRouter.
4. **The answer returns to the same chat.** You do not move to another app or learn another interface.
5. **If an action is needed, Grok still does it.** The selected AI can request a computer, file, browser or orchestration tool only when Grok supplied that tool for the turn. Grok's permission layer still applies. The result goes back to the same selected AI, which finishes the answer.
6. **Recovery is built in.** Installation verifies that the Grok host is genuinely stock, saves the untouched original, and can restore the stock inference path later.

## What happens during installation

The native macOS installer—and the source-preview Windows shell built around the same payload—is a guided delivery mechanism. It does not replace the Grok Bot app.

1. It confirms that the installed desktop app is an exact supported Grok Bot 0.30.0 or 0.36.0 build.
2. It restarts Grok Bot with a temporary diagnostic connection bound only to `127.0.0.1` on the local computer.
3. It opens an existing Bot computer and verifies that its Terminal is really focused before typing anything.
4. It transfers a small compressed payload through Grok's own remote-computer connection. The payload is checked with SHA-256 before extraction.
5. Inside the Bot computer, it installs pinned runtime dependencies and requires an exact reviewed stock-host SHA-256 and byte count. The entry comes from the bundled manifest or an Ed25519-signed registry. Every source anchor must match exactly once, and the transformed code must pass `node --check`. Structural similarity alone never authenticates a stock host. The untouched original is stored under persistent `sand-data` before patching.
6. It installs the narrow provider adapter. The runtime recognizes Grok's existing completion identity when returning child results to the parent. The larger provider logic remains in a separate runtime that can be replaced or removed independently.
7. It verifies the payload success marker and native command registration, then restarts the Grok host, verifies the restart receipt, closes the diagnostic connection and reopens Grok Bot normally.

If the app version, source anchors, payload checksum, registry signature, Terminal focus or generated code does not match expectations, installation stops rather than guessing. A rejected host produces a safe fingerprint, the read-only syntax result, the trust tier, and the reason; Grok host source is never uploaded. The Bot terminal is read back through screenshot OCR, so installer attempt IDs use only characters OCR does not confuse, and the completion timeout restarts whenever a new phase is observed.

## What happens when you send a message

### A normal conversation turn

1. Grok creates the same conversation session it normally would.
2. The injected executor starts the isolated router runtime and supplies the transcript, stable Bot identifiers and any tools Grok offered for that turn.
3. The runtime loads this Bot's provider and model from its own state file.
4. Codex SDK resumes that Bot's Codex thread, or OpenRouter receives an OpenAI-compatible request for the selected model.
5. The provider returns text.
6. The runtime hands that text to Grok's normal delivery mechanism, so it appears once in the original conversation.

The original beta.32 failure came from treating a changing request ID as part of the Bot's identity. That made a model switch look successful but sent the next message to a new default state file. Stable IDs now take priority, with a real Bot ID winning over the channel or conversation around it. That lets a Bot retain its own model when it joins a group, and changing the group's membership does not change the Bot's router state. Existing combined-ID state is migrated on first use.

### A router command

Commands such as `/models`, `/provider`, `/doctor`, and `/router doctor` are handled by the router before any provider request is made. Small user-invocable skill descriptors make the command families discoverable in Grok's native `/` menu, while the runtime remains the only component that performs the control. You can choose an entry from that menu or type the literal command into the normal composer. In a channel, put a Bot mention directly before the command—for example, `@Research Bot /provider`—to inspect or change that Bot without affecting another member. That is why a model cannot deny that the commands exist or invent a different answer.

### A tool turn

1. Grok may include tool definitions with the turn.
2. The router translates those exact schemas into the format expected by Codex SDK or OpenRouter.
3. The selected AI may return a structured request for one of those tools.
4. Grok performs the action and applies its normal permission behavior.
5. The matching result returns to the same provider thread.
6. Only then does the provider produce the final chat answer.

The router will not execute a provider's printed imitation of a tool call when Grok supplied no matching schema. The latest OpenRouter Shell gate had zero actionable host schemas, so the request correctly remained inert. Computer, Screenshot and sub-agent parity are therefore not blanket current-release claims even though the bridge and automated contracts exist.

## What stays, what changes

| Stays in Grok Bot | Changes through the router |
| --- | --- |
| Desktop app and chat interface | Model used for inference |
| Bots and conversation history | Per-Bot provider/model setting |
| Bot computer and `/workspace` | Provider thread identifier |
| Files, browser and host tools | Translation between provider calls and Grok tool schemas |
| Grok permission behavior | Redacted router audit and diagnostics |

The stock Grok model is bypassed only for routed turns. Disabling or restoring the router returns the original inference path.

## What each Bot remembers

Every Bot gets an isolated state record containing its provider, model, reasoning setting, provider thread reference and replay-control metadata. Updates are written atomically under a short per-Bot lock. A model switch or reset increments the thread epoch, so a late response cannot silently undo the change.

This is why the acceptance test always creates two new Bots: the first is switched to Luna, while the second must still start on the installer default.

## Credentials and data boundaries

- The OpenRouter key is saved through Grok Bot's protected Secrets store and loaded only when a request is made.
- Provider credentials are not written to this repository, per-Bot state files or audit logs.
- The chosen provider necessarily receives the conversation content and media needed to answer that routed turn.
- Grok remains the executor for outer computer, file, browser and orchestration tools. A provider receives their results only when that tool path actually runs.
- Audit events contain bounded protocol information, provider/model receipts and suppression reasons; recognizable key material and raw provider error payloads are redacted.
- Child processes receive an explicit environment allowlist rather than every host environment variable.

Read [SECURITY.md](../SECURITY.md) for the security boundary and [ARCHITECTURE.md](ARCHITECTURE.md) for the implementation-level protocol.

## Restore, disable and update

- **Restore Stock Grok Bot** copies the SHA-256-verified persistent backup over the routed host, disables routing and restarts the host after the installer sees the restore marker.
- `grokbot-router disable` leaves the adapter installed but sends new sessions down the stock path.
- `grokbot-router enable` turns routing back on.
- A future Grok Bot version is unsupported until its exact host is inspected, its hash and anchors are added, and the complete automated plus fresh-Bot live gate passes.

The latest recorded complete Mac control lifecycle is beta.45; the maintenance candidate must repeat its own full live gate. See [TEST-MATRIX.md](TEST-MATRIX.md) for the evidence rather than relying on the diagram as a test claim.

## Suggested 55-second YouTube narration

> The easiest way to understand this is that Grok Bot stays the same, but the AI brain can change. I still type inside the normal Grok Bot chat. A small router checks which model this specific Bot is set to use, then sends the turn to Codex or a model through OpenRouter. The answer comes straight back into the same conversation.
>
> If the AI needs to use the computer, a file or the browser, it can only request a tool Grok actually made available, and Grok's normal permissions still apply. Grok performs the action, sends the result back to the selected model, and the final answer appears here.
>
> The installer also checks the exact Grok version and saves a verified copy of the original host. So if I want to undo the whole thing, Restore Stock puts Grok's original inference path back.

For the complete recording order and honest claim boundary, use [YOUTUBE-DEMO.md](YOUTUBE-DEMO.md).
