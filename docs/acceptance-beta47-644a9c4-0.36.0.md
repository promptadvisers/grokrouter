# Beta.47 644a9c4 acceptance on Grok Bot 0.36.0

Status: required live gates passed for 0.36.0, with the ancillary provider-empty observation recorded below. Overall release acceptance remains pending 0.30.0. Times are UTC on September 9, 2026.

- Production commit: `644a9c4`.
- Source digest: `86e10453fc44d718321226487aa7f7dd5d3572c900cc96d16fe55e857b48af02`.
- Mac ZIP SHA-256: `7d648ff8f65cf1421f83c177c217d8f95c4620834be0eefd00164bee5e2b430f`.
- Runtime SHA-256: `2bf4e117c00ef7799dd89bfea57abb6514def31d4539ce751114dbd0829c1ba9`.
- Clean source ZIP SHA-256: `8e9fbbee0164ef839ec8120c98e45c66718a5126020baf2f4710154fd0ff747c`.
- Desktop: official vendor-signed Grok Bot 0.36.0.

All 70 runtime tests, 17 Python patch/executor tests, installer/payload integration, 12 Windows contract tests, and 5 release/compatibility tests pass. Mac build and independent clean-source installation pass signature verification. Logs are `episode-summary-tests.log`, `episode-summary-build.log`, and `episode-summary-clean-source.log` in the local maintenance verification directory.

The previous adapter was explicitly restored to reviewed stock, with the actual terminal reporting `ok: true`, `status: restored`, exact SHA-256 `3364e421402302f8264f961637addb3997a817fde84a91b19635a0c28ff3941f`, and `GROKBOT_ROUTER_UNINSTALL_OK`. The initial candidate installation then succeeded and registered six unique commands for 37 Bots/channels before host restart.

## Native helper regression

The installed runtime matched the candidate hash. Existing development Bots `Router47 Ship A036` (OpenRouter Luna; `ef2e4097295da4be42c801db`) and `Router47 Ship B036` (Codex Sol; `df864746895d7132c52e2771`) received deterministic controls beginning at 09:48:54. The audit interval from 09:48:50 through inspection after 09:51:48 contained 12 `control_turn`, 12 reasoned `turn_suppressed`, 14 `native_text_task_start`, and 14 `native_text_task_ok` events. It contained no ordinary `turn_start`, helper error, or host bridge error.

Each provider completed memory extraction without tools. OpenRouter's periodic `episode-summary` completed at 09:51:22.391 and Codex's at 09:51:48.548, each with an empty tool list. These are the actual periodic host calls after its six-exchange boundary, not a manual helper invocation. They verify both isolated task markers live. Final fresh-Bot acceptance uses new Bots after the unchanged artifact's restore/reinstall cycle.

## Exact-artifact lifecycle

The candidate's Restore stock action removed all six native command entries. The actual terminal reported `ok: true`, `status: restored`, exact reviewed stock SHA-256 `3364e421402302f8264f961637addb3997a817fde84a91b19635a0c28ff3941f`, and `GROKBOT_ROUTER_UNINSTALL_OK`. Its timestamped pre-restore backup ends in `1788947572747.bak`. The unchanged candidate's final reinstall is in progress. No final lifecycle or fresh-Bot gate is marked passed yet.


The final reinstall succeeded and registered six commands for 37 Bots/channels before restart. Desktop Doctor's actual terminal receipt reported `hostAdapterVerified: true`, `stockBackupVerified: true`, `ok: true`, `status: installed`, supported version `0.36.0`, and `GROKBOT_ROUTER_DOCTOR_DONE`. This completes the exact-artifact lifecycle gate on 0.36.0.

## Fresh-Bot controls

`Router47 RC A036` was created after the final lifecycle and greeted normally at 09:59:06. All six native menu entries were individually selected and returned deterministic receipts between 09:59:28 and 10:00:03. Both model catalogs ended with switch instructions. Bare `openai/gpt-5.6-luna` switched A at 10:00:32; Provider confirmed the exact model at 10:00:42, and its model-authored identity agreed at 10:00:56. `Router47 RC B036` was created after A's override, greeted normally at 10:01:16, and retained the installer default Codex Sol/medium at 10:01:30. Exact text, command variants, live tool capabilities, and group isolation are in progress.


A's exact-text request at 10:01:42 produced one plain `FRESH_BOT_TEXT_OK` at 10:01:44, with no later duplicate before subsequent controls. Case/whitespace Doctor and Provider returned correct status; `/router foo`, `/provider open router`, and `/reasoning MAX` returned deterministic help. The unlisted bare ID returned list/switch guidance. `/models anthropic/claude-sonnet-4.6` switched successfully at 10:03:14. The OpenRouter live outer-tool proof began at 10:03:25.


## Capability proof (audit reconciliation pending)

OpenRouter reported successful outer Shell/Read verification of `/tmp/grokrouter-644a9c4-openrouter-036.txt` at 10:03:54. Its initial screenshot accurately described the fresh Bot's empty desktop. Terminal was then opened visibly, and an additional outer Screenshot request identified the Xfce Terminal window and its `/workspace` prompt at 10:05:30. A delegation request at 10:06:05 produced one fixed launch acknowledgement at 10:06:21 and one `OPENROUTER_RC_OK 481` at 10:06:26. There was no later duplicate before the explicit provider switch at 10:06:55. Native completion ordering and provider tool receipts will be reconciled before marking the capability gate passed.

The same Bot switched to Codex Sol and began its outer Shell/Read/Screenshot proof at 10:07:12.


Codex's outer-tool reply at 10:07:40 verified its proof file and the visible Terminal. Its delegation produced one fixed acknowledgement at 10:08:57 and one `CODEX_RC_OK 287` at 10:09:06. Audit reconciliation found no errors from 09:59 onward. A's runtime identity is `ab7ff56114153de8f13915ab`; B's is `acda65e621c5538f39658482`. Greeting `turn_ok` receipts at 09:59:06.181 and 10:01:16.900, plus A's literal receipt at 10:01:44.832, all had empty outgoing tool lists. Both proof files independently matched their exact requested bytes including one newline.

The audit recorded real outer Shell, Read, and Screenshot calls for each provider, with zero non-router-prefixed call IDs. OpenRouter's first explicit delegation request forced and called GetDynamicTools at 10:06:09.829, followed by the native Task broker. A's suppression records through reconciliation contained 29 `delivery-after-latest-input` and two `background-task-awaiting-completion` receipts. Its 18 expected controls were recorded separately.

Native parent journal `dc216119-017c-4a55-9d1f-9483c3364616` contained ten rows for each delegation boundary: tool discovery at row 1, actual task launch at row 3, one acknowledgement at row 5, the actual hidden completion at row 7, and one final delivery at row 8. Both boundaries had zero ack-redrive prompts. The completion payloads explicitly contained 481 and 287 respectively. The parent did not calculate the result; the child used its own tool path. These receipts complete both provider capability proofs on 0.36.0.

## Addressed group controls

A group containing only RC A036 and RC B036 was created. A's addressed Provider returned OpenRouter Claude at 10:14:07; B's returned Codex Sol at 10:14:29. An addressed model change for A began at 10:14:39. Final direct-chat checks and group audit are in progress.


The addressed model switch returned at 10:14:46. B subsequently returned one plain `GROUP_ISOLATION_OK` at 10:15:21 and remained on Codex; A's direct Provider confirmed OpenRouter Luna at 10:15:30. The group interval 10:14:00–10:15:00 contained exactly three control events and zero ordinary `turn_start` events. Its ten suppressions had explicit reasons: five `channel-control-not-addressed`, three `delivery-after-latest-input`, and two `channel-control-already-processed`. Direct-control intervals separately contained ten and seven controls with zero ordinary provider turns. This completes the controls, two-Bot isolation, and channel-control gates.

One ancillary Codex memory-extraction task returned empty after its one allowed recovery at 10:14:40.388, producing a redacted helper error and host bridge diagnostic. The visible group command remained correct; no error bubble or state leak appeared. The next memory extraction completed at 10:14:52.781, episode summary at 10:14:59.244, and further memory tasks at 10:15:08.529 and 10:15:26.402, all without tools. This is recorded as a provider-empty limitation affecting that background memory pass, not omitted or represented as an error-free run. The required user-facing and routing gates passed.

The clean-source installation listed above ran against official 0.36.0. All seven required gates are now verified for this exact candidate on 0.36.0. The immutable artifact must still complete the full independent 0.30.0 matrix before publication.


## Final local restoration and Repair verification

After the independent 0.30.0 acceptance, the same router explicitly restored the reviewed stock host again (`ok: true`, `status: restored`, stock hash `3364e421402302f8264f961637addb3997a817fde84a91b19635a0c28ff3941f`, `GROKBOT_ROUTER_UNINSTALL_OK`). Quitting applied Grok's queued 0.44.0 update; that application was preserved under its actual version. The official mounted 0.36.0 application was copied back only after vendor-signature and exact-version verification.

The unchanged accepted beta.47 artifact then installed successfully on official 0.36.0 and registered six unique commands for 43 Bots/channels before host restart. Its explicit **Repair** action also succeeded and reconciled those six commands before restart. The following desktop Doctor's actual terminal receipt reported `hostAdapterVerified: true`, `stockBackupVerified: true`, `ok: true`, `status: installed`, supported version `0.36.0`, and `GROKBOT_ROUTER_DOCTOR_DONE`. Existing Codex sign-in and the protected OpenRouter credential remained configured. RC A036's Provider receipt at 11:04:43 UTC retained its prior OpenRouter Luna/medium selection.

This verifies issue #7's official 0.36.0 Repair blocker on the exact reviewed host; it does not assert reporter confirmation or support for another host fingerprint. The accepted local installer was placed at `~/Applications/GrokRouter.app`, with the prior beta.45 app preserved in `~/Applications/GrokRouter Backups/`. The original source checkout and its unrelated edits remain untouched.
