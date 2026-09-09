# Beta.47 verification record

This is a partial maintenance record, not release acceptance. Times below are UTC on September 9, 2026 unless explicitly described as local. Only the dated build named in a receipt owns that result. `release-acceptance.json` remains pending.

## Automated and source-build evidence

The complete suite passed after commit `e6961cf`: 53 runtime tests, 14 Python patch tests, installer/payload integration checks, 10 Windows contract tests, and 5 release/compatibility tests. The installer integration exercises state retention across replacement and Doctor success, invalid-runtime failure, altered-adapter failure, and recovery.

The `e6961cf` Mac build completed and a separate clean source ZIP built into an isolated Applications directory. The clean app reports `0.1.0-beta.47` and passes `codesign --verify --deep --strict`.

| Item | SHA-256 |
| --- | --- |
| Production source digest at `e6961cf` | `feea44866d16902987eeca679acc069104f5e97c66640a50f6a1ec4a49e7822a` |
| Clean source ZIP from `git archive e6961cf` | `c674435924b167297de8aad34053431a54c9fc94e6b6df97d5db77c2b8250669` |
| Locally built Mac ZIP at `e6961cf` | `092efa4f7c9bd3fae725f80330db60bf151ccb03af2f7c81edd4cf70d72ed73e` |

## Official Grok Bot 0.36.0 development tests

The installed desktop app is official 0.36.0. Its signature was verified against identifier `com.anysphere.sand` and vendor team `DCNK4UB866`. The reviewed stock host is SHA-256 `3364e421402302f8264f961637addb3997a817fde84a91b19635a0c28ff3941f`, 25,656,693 bytes. This does not authorize newer desktop releases or other host files.

### Expanded native controls and delivery

On `014426e`, a new Bot created at local 11:16 PM returned the packaged Codex and OpenRouter catalogs from the native Models menu, switched to OpenRouter Luna, and returned the matching native Provider status. The identity answer then exposed a false background-task acknowledgement. That failure led to `c6f3748`.

On `c6f3748`, after explicitly restoring that Bot's OpenRouter Luna selection, the identity question returned one correct answer at 03:33:50. The exact-text request returned one `FRESH_BOT_TEXT_OK` at 03:35:08. No extra acknowledgement appeared during subsequent observation. An earlier identity answer after installation had used the installer default because state had been lost; it is not an OpenRouter pass.

### State-preserving upgrade

The `f0d2bca` installer was run with Codex as the default while the existing test Bot selected OpenRouter `openai/gpt-5.6-luna`. It reported a successful payload installation and six unique command registrations for 19 Bots and channels. The selected Bot's remote state still contained OpenRouter Luna, the fallback controller state contained Codex `gpt-5.6-sol`, and the prior audit retained 36 events.

The installed management Doctor reported `hostAdapterVerified: true`, `stockBackupVerified: true`, exact-allowlist stock trust, desktop version 0.36.0, a signed-in Codex CLI, and a protected OpenRouter credential of valid shape. The host process was running. Grok had a temporary reconnect delay: a control queued while offline failed to send. A subsequent native Provider invocation completed at 03:48:59 and visibly confirmed OpenRouter Luna. The management command's inverted process exit status was then corrected in `e6961cf`; the earlier printed healthy receipt does not verify the corrected exit behavior live.

### Codex outer-tool development probe

A new Bot created after `f0d2bca` installation greeted at 03:49:44 with one line: “Ready. What would you like me to work on?” Its real tool request used Codex `gpt-5.6-sol`. Redacted audit receipts recorded outgoing `Shell` at 03:51:03, `Read` at 03:51:22, and `Screenshot` at 03:51:30. The visible answer at 03:51:42 reported the proof token with one trailing newline and correctly described an empty desktop with dock icons; no window was open yet. A `turn_suppressed` receipt recorded `delivery-after-latest-input` at 03:51:42.

The follow-up screenshot correctly identified `Terminal - box@cursor: /workspace`. The parent acknowledged a child launch at 03:54:10, but no completed arithmetic result arrived. The child transcript contained its arithmetic request without a final assistant message. Audit showed child inference completing with no provider tool calls, while the adapter's fallback invented `SendToUser` even though the child session offered execution tools without a user-delivery tool. This failed the returned-child gate and led to a correction: when no delivery tool is offered, finish through the host's normal response stream. The executor regression test separately verifies child text, parent delivery, silent tool turns, and duplicate cleanup.

The proof file was independently read in the Bot computer and contained exactly `CODEX_OUTER_TOOL_OK\n`. These development probes do not substitute for the final artifact's full fresh-Bot procedure, lifecycle, or per-version release gates.

### Registration timeout after the child-delivery revision

The `75bd756` payload installed from verified stock on 0.36.0, but desktop registration stopped with a diagnostic-connection timeout. Running Repair on the same artifact verified the already-installed adapter and registered six unique commands for 20 Bots and channels. Investigation found that macOS closed diagnostic requests after 12 seconds, even though workflow-library readiness allows 45 seconds; the equivalent Windows limit was 30 seconds. Registration now receives a separate 240-second bound covering readiness and retries. Other transport calls retain their short defaults. A virtual-time Windows transport test proves a 45-second nested evaluation succeeds while an ordinary unresponsive request still expires.

The subsequent Codex delegation retest ended at 04:05:49 with a visible router error. The redacted audit identified `Codex SDK returned an empty response`, not a successful child return. Recovery now makes one additional run on the same Codex thread without replaying the full input. Both attempts' usage is accumulated, repeated emptiness fails clearly, and an actual tagged completion can fall back to its returned text with durable deduplication. The expanded automated suite passes 56 runtime tests, 15 patch/executor tests, installer integration checks, 11 Windows tests, and 5 release/compatibility tests. Live verification remains pending.

### Failed delivery is not completion

The same development Bot switched to OpenRouter Claude at 04:10:06. Its computer-tool probe created `/tmp/grokrouter-47-openrouter-proof.txt`; independent inspection found exactly `OPENROUTER_OUTER_TOOL_OK\n`. The chat nevertheless stopped without replying. Its transcript recorded `send_message` with empty arguments followed by `{"error":{"error":"Invalid arguments: type: Required"}}`, then hidden host recovery prompts. The audit repeatedly recorded `delivery-after-latest-input`. This was a failed delivery incorrectly treated as success, not a completed capability test.

The correction rejects structured failure receipts as delivery proof and makes each new failed-delivery ID reopen the unfinished input once. Replays of that same receipt remain deduplicated. The child stream path is explicitly scoped to the host's `isSubagent` flag; parent sessions retain the canonical `SendToUser` fallback because their internal delivery handler is not always listed among inference schemas. Tests cover both parent and child paths, direct and brokered failures, and recovery while returning a tagged child completion.

### Host restart and registration order

The `caa333e` payload installed, but registration reported `gateway-unreachable: gateway importAgentWorkflowText unreachable (network)`. The longer deadline exposed the gateway failure instead of masking it with a transport timeout. The desktop had been registering workflows after `remote/install.sh` scheduled a host restart. The installer now defers that restart until registration succeeds, then requires a dedicated restart receipt. Repair supports the same deferred sequence. Stock restore already removes native commands before restarting.

The complete local suite passes 59 runtime tests, 15 patch/executor tests, installer/payload integration, 12 Windows tests, and 5 release/compatibility tests. The Windows sequence test models a gateway that becomes unavailable on restart and proves registration completes first; a registration failure cannot proceed to restart. Live acceptance is still pending.

### Native child wake-up requests

A new Bot created after `caa333e` installation greeted at 04:31:56. Its Codex child calculated 9 × 9 and stored a final assistant message containing `81` at 04:33:30. The parent transcript received the actual hidden background-completion message containing `81`, but the router recorded zero tagged completions and suppressed the unfinished parent answer. A premature child resume also produced a separate host checkpoint error. This was not a returned-child pass.

Inspection of the reviewed host found two paths. The automation inbox injects `sandAutomationCompletionId`; native child revival calls the runner with a hidden prompt, and user-message conversion preserves the run's `providerOptions.cursor.requestId`. The runtime now recognizes the exact native hidden-completion envelope only when that durable request ID is present. Its deduplication key uses the request ID, never the returned text. Regression coverage rejects ordinary hidden reminders and untagged lookalikes, suppresses replay of one completion, and allows separate completion requests with identical results. Live retesting is required.

### `bf2a381` candidate installation

The complete local suite passed: 61 runtime tests, 15 patch/executor tests, installer/payload integration, 12 Windows tests, and 5 release/compatibility tests. The Mac application built, and a separate clean source ZIP built and installed into an isolated Applications directory with signature verification.

| Item | SHA-256 |
| --- | --- |
| Production source digest | `828ca1e3d62e6ad02407e1814203c36e5a3b3269b882139943a83e0995d75c6d` |
| Clean source ZIP from `git archive bf2a381` | `89bd26440e94d1edb1efb666289f22161641a6cbd512be187f6a8740486a3727` |
| Locally built Mac ZIP | `c05c9fc7ee8287540ebe21c17f8207da188ef9320f9b8612327f1c126658a144` |

At approximately 04:57 on official 0.36.0, the desktop installer reported a successful payload install, verified six unique router commands for 21 Bots and channels, and then requested the host restart. It closed the temporary diagnostic port and reopened Grok normally. The desktop subsequently showed its reconnect state. This verifies the corrected install/registration order; it does not yet complete restore/reinstall or fresh-Bot acceptance.

A genuinely new Bot greeted at 04:59:10 and launched a real Codex child for 8 × 8. The child stored `64`, and the parent transcript received that actual result in a hidden completion. At 05:00:44 the visible parent instead said the returned value had not appeared; subsequent audit rows still recognized zero completions. The installed runtime SHA-256 matched the built source exactly. Request-ID recognition alone therefore failed the live gate.

The next adapter revision preserves the native completion's original dispatch identity before Grok's formatter discards it. It adds a hidden marker derived only from the child and tool-call/request IDs and leaves the stock result text intact. A missing durable ID cannot produce a fabricated marker. The runtime strips the marker before provider input and uses its identity for existing continuation deduplication. The exact formatter anchor is required in addition to the existing stock hash/size gates. Tests cover unchanged stock behavior when routing is disabled, missing IDs, identical output from different dispatches, stable identity when output text changes, reordered completion batches, marker parsing, and parent revival/replay. Full local checks pass with 61 runtime and 16 patch tests; live acceptance remains pending.

### `898fb1e` dispatch-marker revision

The previous installer removed six shared router commands and sent the verified-stock restore command. The `898fb1e` Mac artifact then installed successfully on 0.36.0 at approximately 05:11, verified six unique commands for 22 Bots and channels, and restarted the host after registration. Its ZIP SHA-256 is `01c108f95240d65c97f1ca6ba9cb2e0bb00698ef675dc47f6339bf4c83abedb2`; production source digest is `050394f303fa5e33ed6ebd8529d766133a8e0360fbb53cc315c076bbe430d23b`. This is an installation receipt, not completion of the exact-artifact lifecycle or capability gates.

A new Bot greeted at 05:13:05. Its real child completed 7 × 9 with `63`; the parent received the actual hidden result with the experimental dispatch marker. Nevertheless, at 05:14:27 the visible parent said the value had not appeared. Redacted audit shape inspection confirmed that the hidden user message also carried a `requestId` cursor key. The marker and existing request identity were present; neither was recognized because the parser expected the hidden prefix at the start of the entire model-facing content.

The reviewed host's user-message conversion adds an optional separate incoming-message-ID part and a timestamp, then encloses the original hidden text in `<user_query>`. The next runtime revision normalizes that single wrapper before recognizing a native completion, and strips it before sending completion text to either provider. The experimental formatter hook is removed because the existing host request identity is sufficient. Regression tests now use the observed wrapped shape, including timestamps and separate message-ID parts; quoted lookalikes, missing IDs, ordinary reminders, and ambiguous multiple query wrappers remain rejected. The full local suite passes 61 runtime tests, 15 patch tests, installer integration, 12 Windows tests, and 5 release checks. This correction still requires a live fresh-Bot pass.

### `544ef2d` normalized completion candidate

After stock restoration, the candidate installed successfully on official 0.36.0 at approximately 05:23. It verified six unique native commands for 23 Bots and channels before the host restart. A clean source archive also built and installed into an isolated Applications directory with signature verification.

| Item | SHA-256 |
| --- | --- |
| Production source digest | `2a87b92a747b17f105172a22452d858bc82854d93605d22f86512358ae5bd90d` |
| Clean source ZIP from `git archive 544ef2d` | `a7e6cf6ffb6ba83dcb18cb8a5f8a279be2800e333e2763a1e18f2107f9e5b0d5` |
| Locally built Mac ZIP | `5eecdaa48e2f9c8d25a049da93ac7a9db5e17793cee77dc5ad45b9cca5e1e612` |

A fresh Bot greeted at 05:24:08. Its real Codex child stored the final assistant result `48` for 6 × 8, independently verified in the child transcript. At 05:25:30 the parent said the result had not arrived yet; after the actual hidden completion arrived, the parent resumed and delivered one `CHILD_RETURN_OK 48` at 05:25:42. The audit recognized one automation completion in the resumed request and recorded `delivery-after-latest-input` after the final delivery. No second returned-result bubble appeared during subsequent inspection. The installed runtime SHA-256 matched the built source: `b457e8a1435a2f28545834bf6e737ed0b4d50678ca6b5dc2274d6e071bf77231`. This proves the repaired Codex returned-child path on this candidate and 0.36.0; it does not substitute for the remaining full acceptance gates.

The same Bot switched to OpenRouter Claude at 05:26:56. Its real `Shell`, `Read`, and `Screenshot` receipts were recorded at 05:27:32, 05:27:35, and 05:27:36. The visible answer at 05:27:59 reported the exact file token and correctly identified the Terminal window. Independent inspection confirmed `/tmp/grokrouter-544-openrouter-proof.txt` contained exactly `OPENROUTER_OUTER_TOOL_OK\n`.

The subsequent OpenRouter child probe used Grok's native `task` dispatch and produced a separate child transcript with final assistant text `72` for 8 × 9. The parent first reported waiting at 05:28:39 and then delivered one `OPENROUTER_CHILD_OK 72` at 05:28:44. A `delivery-after-latest-input` suppression followed; no second returned-result bubble appeared. All inspected outgoing tool-call IDs had the router-owned prefix. This probe used previously discovered orchestration schemas; the final fresh-Bot delegation check must still verify first-request discovery forcing with an explicit sub-agent request.

The installed management Doctor independently reported `hostAdapterVerified: true`, `stockBackupVerified: true`, `ok: true`, `status: installed`, and supported version 0.36.0. Its process exit was 0, the runtime syntax check passed, Codex was signed in, and the protected OpenRouter credential had valid shape. The final exact-artifact lifecycle and full fresh-Bot acceptance were then started.
