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

## b5eb6ce final-candidate probe, 2026-09-09

See `acceptance-beta47-final-0.36.0.md` for the exact artifact, successful install/restore/reinstall, Repair and strict Doctor on official 0.36.0, native controls, per-Bot isolation, and real computer/child results from both providers. Final acceptance failed because the first Codex greeting called GetDynamicTools despite displaying a normal greeting. The follow-up correction restricts greeting tools through the prompt, output schema, and malformed-output boundary. All 62 runtime tests plus the full patch, installer, Windows, and release suites pass locally. Source-bound acceptance remains pending.

## Native group control failure and correction, 2026-09-09

While `bb32d6e` (the Codex greeting correction) built locally, the installed `b5eb6ce` was used to probe a new group containing only `Router47 Final A036` and `Router47 Final B036`. An addressed `/provider` at 06:16:54 reached inference: the host wrapped it in room history and speaker labels and did not populate raw transcript text at the existing adapter boundary. The visible status was model-authored; later member turns produced unwanted follow-ups and errors. This fails channel acceptance. No `bb32d6e` live acceptance was claimed.

The correction forwards the latest actual human transcript entry, durable message ID, room ID, and current member identity from the native group dispatcher to the existing inference adapter. Runtime controls use that structured provenance instead of parsing quoted room prose. Only the addressed member handles the command; receipts keyed by room/message/member suppress concurrent or later replays across changing host roots. A distinct failed delivery receipt permits one recovery. Fresh ordinary human messages bypass the older root-based follow-on latch, while agent-authored quoted commands cannot acquire human command authority. The adapter requires exactly one group-dispatch anchor and preserves strict stock verification.

The automated regression checks concurrent replay, another addressed member, per-Bot provider state, same message ID in another room, failed delivery replay, agent-authored spoofing, and unrelated normal input. A patch-execution test verifies the actual dispatcher-to-session metadata path and rejects forwarding outside a group member turn. Live acceptance of the corrected group path remains pending.

## bff08ee live group success and first-run envelope correction

The new native group metadata path passed its real two-Bot regression, with exactly three deterministic controls and no inference in the inspected interval. Per-Bot state carried back to direct chats, and the other Bot's independent exact-text request completed. See `acceptance-beta47-bff08ee-0.36.0.md` for the artifact and audit receipts. The fresh greeting still discovered a tool because its preceding user-role host procedure defeated the empty-visible-input assumption. The shared greeting predicate now recognizes the exact native hidden first-run envelope and request ID. The complete automated suite passes with 64 runtime tests and 16 Python patch/executor tests; final-candidate live acceptance remains pending.

## September 9, 2026 — pending-child receipt guard (`b03bd89`)

The d99f8a2 live probe exposed a parent answer after a successful background launch receipt but before actual child completion, followed by an unnecessary “already delivered” message. The new guard recognizes paired successful structured native launch receipts, defers premature final text and direct/brokered delivery calls, permits other tool work, and resumes at the actual completion or new user boundary. Failed, quoted, unpaired, and unrelated-tool receipts do not trigger the guard.

All 67 runtime tests, 16 Python patch/executor tests, installer/payload checks, 12 Windows contract tests, and 5 release/compatibility tests pass. The Mac build and independent clean-source installation pass signature verification. Source digest: `2cded0c7abc6e85c5f625c8a49d17b09e4c7870d11b625397b31433e91bd8f13`. Mac ZIP SHA-256: `43e78d08ff365bec499b03ab97976f743fdfea6457d90b9288371c32b048978d`. Source ZIP SHA-256: `3400f586859e42e3309a65d7d27fe98f32a53ba3d6041263d25d8c056fcffd19`. Runtime SHA-256: `15187d2a58e4b1cf0345d393d01b1aba10cfffeda7db35fd4c40ff452e2b80c7`. Live regression validation is underway before restarting final acceptance.

The b03bd89 live regression installed successfully and registered six native commands for 33 Bots/channels. OpenRouter returned `OPENROUTER_GUARD_OK 221` once at 07:37:03, and Codex returned `CODEX_GUARD_OK143` once at 07:38:22. These visible results do not verify the guard: the redacted audit showed no background-wait suppression. Grok's native tool-result part contains both `result` and `experimental_content`; the initial guard parsed their combined provider rendering instead of the authoritative structured `result`. The correction reads the paired structured result directly and adds that duplicate-rendering wrapper to the both-provider regression. Full automated checks remain green at 67 runtime tests.

Structured-receipt revision `0d0239d` has source digest `b641f09c9240568b5e97d91b22c465da2d57457a609085a31a0243bb2e86bf39`, Mac ZIP SHA-256 `27bb1642095fe37a9d6ff3400599d40611f78ad459c99d6ecddd636aa0244739`, runtime SHA-256 `ae32e75d88d196afb5ab4b2e63dbf3672915c8382c2f5d66ccffe3aae0c4ee27`, and clean source ZIP SHA-256 `1ef4a46fa79423f28e5827a01314f5909e4c30cbc370818d6d73b542887ea9f3`. Full tests, Mac build, and independent clean-source installation pass. Live guard receipt verification is pending.

The 0d0239d live probe returned `OPENROUTER_RECEIPT_OK 209` once at 07:46:25, but still produced no background-wait suppression. Inspection of this acceptance Bot's stored model-message blobs identified the exact cause: the native `CallDynamicTool` call uses `toolName: Task`, and its `result` is the host's canonical `<cursor_untrusted_data_1337 source="Task">` launch receipt, not the structured launch object preserved in the native journal. The receipt contains the fixed running-state sentence, the native `sand-subagent-<UUID>`, and exact resume-parameter help. The next correction recognizes only that complete canonical receipt, with matching wrapper IDs, inside a paired orchestration result. JSON launch objects remain supported. Both providers, direct/brokered delivery, empty recovery, continued tools, mismatched wrappers, unrelated tools, orphan results, and quoted user copies are covered. Full automated checks and the expanded 67-test runtime suite pass.

Canonical Task-receipt revision `ab444d7` has source digest `04606a4a0ace2ba86471956d9d2bee71b4225c14a1de6f69f56e2cfc5e38a3dd`, Mac ZIP SHA-256 `b1d246f105a2c3f4c55a3dfeb78a0728a61b8135523ed610ce3f73d7aeb40bec`, runtime SHA-256 `d095ed142127ff1454609a38b3f2a772c3bd162321f21313ade7fbc10f918521`, and clean source ZIP SHA-256 `ea75540ca99cd35ee0f4d01ab5a59e6cd740f8d766433416998fe9b41a0187be`. Full automated checks, the expanded runtime regression, Mac build, and independent clean-source installation pass. Live guard verification is pending.

The ab444d7 live probe returned `OPENROUTER_CANONICAL_OK 391` once at 07:55:40 and `CODEX_CANONICAL_OK253` once at 07:55:58, but still did not emit the new suppression reason. A private minimal reproduction was built from the exact stored native assistant call and paired Task result (`grokbot-router-tool-030aea4c-f462-47d4-aecb-4b2547391b54`). Running the installed matcher directly against those two native messages isolated an exact formatting mismatch: the canonical Task receipt contains two newlines between its running-state sentence and `Agent ID`. Applying that spacing correction in memory produced a successful regex match and the actual pending child ID `sand-subagent-d89f80e0-bd75-4754-8ef5-ec9b6e18b3e7`. The source and regression fixtures now use that verified native spacing; the full automated suite passes. The private reproduction stays on the test Bot computer, contains only this harmless test task and receipt, and is not part of the repository or payload.

Native-spacing revision `351bdf7` has source digest `f23c7f7c56f9f7f0c723c19dd04d440a7409c294efbe5d998642c830ff2f99b6`, Mac ZIP SHA-256 `8d91b3de020ca0f31859844025af18a4926f2a6428ecf302129a9d38f9a22fdd`, runtime SHA-256 `c8acce6cc97be1b941069177e47d6ebf6afc21db4952d6684ccbf2189c9b1a29`, and clean source ZIP SHA-256 `3dbe051669c44b95eb437ff4c1cca4af5f59256224b4e8cdd8887320e5bbf8b9`. Full tests, Mac build, and independent clean-source installation pass. The direct in-memory reproduction was extended with the actual native user message and `sandStartOfTurnAckReminder`; it still identified boundary 0 and the correct pending child ID. Live end-to-end guard verification and final acceptance remain pending.

One-time launch acknowledgement revision `fdbae51` has source digest `989dd6bb785ac65943de07e9eca9ad9f63975a87510822c32e997747232c7ec7`, Mac ZIP SHA-256 `e3d28ec84698658165b667e86c18c23df19a63f111b01e256518713586651457`, runtime SHA-256 `2c383e89a048a6229145e7e577cd66bf5d78d5587e5a896a3b5bb88a0669deeb`, and clean source ZIP SHA-256 `c9596c932c0396c670cf3e8fb747567094f9643918161c35701d0d0f33e9cf83`. Full automated checks, Mac build, and independent clean-source installation pass. It retains the live-verified pending-child guard and supplies one fixed launch acknowledgement to avoid Grok's originating-request ack-redrive recovery. Replayed acknowledged launches do not invoke either provider again in the regression. Live acknowledgement and final-artifact acceptance remain pending.


The fdbae51 live acknowledgement probes passed with both providers and zero native ack-redrive prompts. Its full official 0.36.0 install → exact stock restore → reinstall and desktop Doctor also passed. Fresh control testing then exposed a separate memory-extraction task reusing the chat executor and cached tool state. See `acceptance-beta47-fdbae51-0.36.0.md`. The native task isolation correction passes all 69 runtime tests, 17 Python patch/executor tests, installer/payload integration, 12 Windows contracts, and 5 release/compatibility tests. Source digest: `6a49d838bf750f4aafe4d3e8cd9b26f58bbe4bf5837fe4c1de7971b2872238ac`. Final acceptance remains pending.


Native text-task isolation revision `6647bd4` has source digest `6a49d838bf750f4aafe4d3e8cd9b26f58bbe4bf5837fe4c1de7971b2872238ac`, Mac ZIP SHA-256 `921d2be4a8122aaf0a64bba9bb99e2a8b2d768ce66fe597a722854ff025598cb`, runtime SHA-256 `123246902371d9d6b5cce0324a953762991d97a1aa4cc59a3f761e93494af26c`, and clean source ZIP SHA-256 `24679287bd3a712c5433813a82c43246404499d3d0394a45c81db9a06bd0a6b0`. Full tests, Mac build, and independent clean-source installation pass. Before installing the changed adapter, the prior desktop installer explicitly restored the exact reviewed stock hash and emitted `GROKBOT_ROUTER_UNINSTALL_OK`; no unknown-adapter upgrade bypass was used. Live native text-task regression and final acceptance are pending.


Revision 6647bd4 installed successfully on official 0.36.0 and registered six commands for 35 Bots/channels. Its installed runtime hash matched. Native memory extraction passed with OpenRouter at 08:54:52.731 and Codex at 08:55:06.882, with zero tool schemas/calls and separate `native_text_task_ok` receipts. Bot A was `85fb9316bbb0b575841f6414`; B's corrected audit ID is `394f8207efa6f86b9ff5c5fc`. Each visible unlisted-model response remained deterministic.

The generic summarization branch was too broad: a separate native memory-synthesis task returned empty chat-wrapper output and emitted helper errors. Source inspection confirmed synthesis collects structured JSON text through the host's own maintenance executor; no provided orchestration tool is involved. The correction retains Grok's original inference backend for explicit `isSummarizationSession` sessions and keeps the new routed text-task marker scoped to the verified memory-extraction call. README and the architecture explanation state that boundary. The exact native session test proves this bypass leaves the stock path intact while ordinary routed chat and marked memory extraction remain separate. Final acceptance remains pending.


Native maintenance-boundary revision `65254d4` has source digest `ae20ebbed86bc7134711b7a0abb1f3de2188e354fa13fd0ac9c6cfdc22ba79d1`, Mac ZIP SHA-256 `df47c8839100e8cc24848f161478abcc8d86ab360a6d44e99a8389ec4a0995fd`, runtime SHA-256 `bd43fd2032650b209f9992c2bf6e05aabbc854a4c77014700dfb4bb2bc04cf0e`, and clean source ZIP SHA-256 `6a0a30f05725254b2e0765aa65aae5de242cf7e69fb6a4d8b3f6d7e9a36a1175`. Full tests (69 runtime, 17 Python, installer integration, 12 Windows, 5 release/compatibility), Mac build, and independent clean-source installation pass. The prior adapter was explicitly restored to exact stock and its success receipt inspected before installing the changed adapter. Live acceptance remains pending.


Revision 65254d4 passed both-provider native memory extraction with zero tools and no router maintenance errors, and its final 0.36.0 exact-artifact lifecycle and strict desktop Doctor passed. Fresh-Bot testing then exposed a printed delivery envelope around Luna's exact-text reply. See `acceptance-beta47-65254d4-0.36.0.md`. The literal-delivery normalization repair passes all 70 runtime tests plus 17 Python tests and the complete installer, Windows, and release suites. Source digest: `a10fdaa04f8a9ac5d75329024a1d2733636b5f684ddc363d22b07ca1d3121350`. Final acceptance remains pending.


Literal-delivery revision `d942423` has source digest `a10fdaa04f8a9ac5d75329024a1d2733636b5f684ddc363d22b07ca1d3121350`, Mac ZIP SHA-256 `d73babe332dc800f9a4266bc7fd96bbc37ea001ee4c04fe56669c83022c2e9dc`, runtime SHA-256 `49e289d66c459007312f3711b453eae4a9db822e2c71197cdba596bc822391ac`, and clean source ZIP SHA-256 `7d68bf4563ec863f40a86e06559aaa5dd5ae443e73776fba30423f50c3429f38`. Full automated checks, Mac build, and independent clean-source installation pass. Its host adapter is unchanged from 65254d4; only runtime response normalization changed. Live regression and final acceptance remain pending.


Revision d942423 installed on official 0.36.0 and registered all six commands for 37 Bots/channels. The repeated literal request at 09:33:26 returned one printed `CallDynamicTool` wrapper at 09:33:31, with namespace `cursor`, tool name `SendToUser`, and arguments containing the exact requested text. The direct-delivery decoder did not recognize this brokered form. The next correction accepts only that complete known broker envelope, rejects extra outer/inner keys and other namespaces/tools, and still requires exact requested text. It never executes the wrapper. Final acceptance remains pending.


Broker literal-delivery revision `cc1c849` has source digest `15da0410c7aa42bfcf7ba99ece4768a4e74fb1ae7b3a77c13f9c3e02608520eb`, Mac ZIP SHA-256 `75d0c8a43ad4e456d530e2015e5e717e1c5c61f95469d357a478325234736ce5`, runtime SHA-256 `541f5b9011f1593ad057ab91e3a7a56ed876a8745fce7d9016e6f779e5cd3f7e`, and clean source ZIP SHA-256 `9db1cd739504d67f9155c2198ddbef8604957608014bf9a109a8d6572ce150b7`. The full 70-runtime-test suite, 17 Python tests, installer integration, Windows contracts, release checks, Mac build, and independent clean-source installation pass. The preceding failed live probe's installed runtime matched d942423; its Bot session was `ef2e4097295da4be42c801db`, its outgoing tool list was empty, and the next continuation was suppressed with `delivery-after-latest-input`.


Revision cc1c849 verified literal normalization live at 09:40:34.540, but subsequent redacted audit exposed the native periodic episode-summary helper reusing cached chat tools. See `acceptance-beta47-cc1c849-0.36.0.md`. The next revision isolates that exact `summarizeEpisode` executor call alongside memory extraction. Both helpers retain original instructions, no tools, and separate thread/state behavior. Full automated tests pass.


Episode-summary revision `644a9c4` has source digest `86e10453fc44d718321226487aa7f7dd5d3572c900cc96d16fe55e857b48af02`, Mac ZIP SHA-256 `7d648ff8f65cf1421f83c177c217d8f95c4620834be0eefd00164bee5e2b430f`, runtime SHA-256 `2bf4e117c00ef7799dd89bfea57abb6514def31d4539ce751114dbd0829c1ba9`, and clean source ZIP SHA-256 `8e9fbbee0164ef839ec8120c98e45c66718a5126020baf2f4710154fd0ff747c`. Full automated checks, Mac build, and independent clean-source installation pass. Before installation of this changed adapter, the preceding installer restored exact stock SHA-256 `3364e421402302f8264f961637addb3997a817fde84a91b19635a0c28ff3941f` and the actual terminal reported `ok: true`, `status: restored`, and `GROKBOT_ROUTER_UNINSTALL_OK`. Live helper regression and final acceptance remain pending.
