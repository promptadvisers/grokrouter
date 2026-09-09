# Beta.47 644a9c4 acceptance on Grok Bot 0.30.0

Status: required release gates passed. Times are UTC on September 9, 2026.

The production source and Mac artifact are identical to the 0.36.0 acceptance record:

- Production commit: `644a9c4`.
- Source digest: `86e10453fc44d718321226487aa7f7dd5d3572c900cc96d16fe55e857b48af02`.
- Mac ZIP SHA-256: `7d648ff8f65cf1421f83c177c217d8f95c4620834be0eefd00164bee5e2b430f`.
- Runtime SHA-256: `2bf4e117c00ef7799dd89bfea57abb6514def31d4539ce751114dbd0829c1ba9`.
- Clean source ZIP SHA-256: `8e9fbbee0164ef839ec8120c98e45c66718a5126020baf2f4710154fd0ff747c`.

The preceding 0.36.0 installation was explicitly restored to reviewed stock. The actual terminal reported `ok: true`, `status: restored`, stock SHA-256 `3364e421402302f8264f961637addb3997a817fde84a91b19635a0c28ff3941f`, and `GROKBOT_ROUTER_UNINSTALL_OK` (pre-restore backup timestamp `1788949128189`). On quitting, Grok applied its queued 0.44.0 update. The pre-copy version assertion caught this before moving files; the updated application was preserved separately. No 0.44.0 compatibility is claimed.

The official `Grok_Bot_0.30.0.dmg` download was mounted read-only, its application version checked as exactly 0.30.0, and its vendor signature verified against the expected identifier/team requirement. That application was copied to `/Applications/Grok Bot.app`, verified again, and launched. Initial installation of the unchanged router artifact is in progress. The separate clean-source installation runs in `clean-644a9c4-030/Applications`; neither original user installer nor source checkout is overwritten.


The clean-source installation completed successfully with signature verification (`episode-summary-clean-source-030.log`). The initial desktop installation verified exact Grok Bot 0.30.0, installed the payload successfully, and registered six unique commands for 40 Bots/channels before requesting host restart. Its Restore stock action is now running as part of the unchanged-artifact lifecycle.


The actual 0.30.0 restore receipt reported `ok: true`, `status: restored`, exact stock SHA-256 `3364e421402302f8264f961637addb3997a817fde84a91b19635a0c28ff3941f`, and `GROKBOT_ROUTER_UNINSTALL_OK`; its timestamped pre-restore backup ends in `1788949533164.bak`. The desktop remained exactly 0.30.0 after reconnection. The same artifact's final reinstall is in progress.


The final reinstall succeeded, registered all six commands for 40 Bots/channels, and requested restart after registration. Desktop Doctor's actual terminal receipt reported `hostAdapterVerified: true`, `stockBackupVerified: true`, `ok: true`, `status: installed`, supported version `0.30.0`, and `GROKBOT_ROUTER_DOCTOR_DONE`. Codex was signed in and OpenRouter's protected credential was configured. This completes the exact-artifact lifecycle on 0.30.0. `Router47 RC A030` was created afterward at approximately 10:32 for the independent fresh-Bot procedure.

## Fresh controls and initial capability receipts

`Router47 RC A030` greeted normally at 10:32:17. All six native menu entries were individually selected: Doctor 10:32:59, Models 10:33:08, Model 10:33:20, Reasoning 10:33:31, Router 10:33:40, and Provider 10:34:01. Their receipts correctly reported beta.47 and default Codex Sol/medium, including the catalog and reasoning help.

A switched to OpenRouter at 10:34:13. Its catalog at 10:39:39 included explicit switching instructions. A bare listed Luna ID switched at 10:39:55; Provider at 10:40:06 and ordinary identity at 10:40:14 agreed on OpenRouter `openai/gpt-5.6-luna`. `Router47 RC B030` was created after that override, greeted normally at 10:40:52, and independently reported default Codex Sol/medium at 10:41:03.

A returned one plain `FRESH_ROUTER_OK` at 10:41:18. Case-insensitive `/Provider`, whitespace-normalized `/Router   Doctor`, `/router foo`, `/provider open router`, `/reasoning MAX`, and an unlisted bare ID produced the expected deterministic status or rejection/help receipts between 10:41:28 and 10:42:05. The plural `/models anthropic/claude-sonnet-4.6` switched correctly at 10:42:11.

A's freshly opened computer had a visible Xfce Terminal before the capability request. OpenRouter completed Shell, Read, and Screenshot between 10:43:10 and 10:43:25, reporting `OPENROUTER_OUTER_TOOL_OK` with a newline from `/tmp/grokrouter-644a9c4-openrouter-030.txt` and the observed `Terminal - box@cursor: /workspace` title. Its explicit native background delegation began at 10:43:40, acknowledged once at 10:43:56, and delivered `OPENROUTER_RC030_OK 301` once at 10:44:02. Audit and native-journal reconciliation remains to be completed.


## Final capability and isolation reconciliation

A's runtime session is `9271b2de2aa141ded83cba42`; B's is `6abecb16e9207f4aee831a6d`. Their greeting `turn_ok` receipts expose zero outgoing tools. A's native parent transcript is `093fa791-4748-4b4d-bba7-bd2f83ab5ca5`.

Independent terminal reads verified the exact bytes of both proof files: `OPENROUTER_OUTER_TOOL_OK\n` and `CODEX_OUTER_TOOL_OK\n`. OpenRouter's outer audit records Shell at 10:43:13.300, Read at 10:43:17.029, Screenshot at 10:43:18.860, and delivery at 10:43:25.404. Codex records discovery at 10:44:29.898, Shell at 10:44:42.170, Read and Screenshot at 10:44:50.275, and completion at 10:44:57.805.

Codex's delegated task at 10:45:16 produced one launch acknowledgment at 10:45:49 and one `CODEX_RC030_OK 319` at 10:46:09. Its native task ID is `6fe4b1ce-be97-473f-84a2-1386f21414e5`; the scoped parent journal contains task row 1, acknowledgment row 3, actual hidden child completion row 5, and final delivery row 6, with zero acknowledgment-redrive prompts.

The initial OpenRouter prompt explicitly named both Shell and delegation. The named outer Shell received scheduling priority before discovery. That probe is evidence for eventual returned-child delivery, not the forced-orchestration-first gate. The independent explicit sub-agent-tool request at 10:48:10 passed that gate: first `GetDynamicTools` at 10:48:13.807, `requestedTool: GetDynamicTools`, one native call and zero recovered textual calls; then `CallDynamicTool` at 10:48:18.406. The actual child Shell appears at 10:48:20.899. The native child ID is `a9c868f9-950a-45dc-859d-b0a8ed2aa0e6`. Parent journal order is discovery row 1, Task row 3, acknowledgment row 5, actual completion containing `423` row 7, and final delivery row 8. One acknowledgment appeared at 10:48:22 and one `OPENROUTER_DISCOVERY030_OK 423` at 10:48:29. A later scan of the entire parent journal found exactly one final delivery for this token and exactly one for the Codex token, with zero acknowledgment-redrive prompts.

A group containing only RC A030 and RC B030 returned A's OpenRouter Claude status at 10:49:35 and B's Codex Sol status at 10:49:57. Addressing only A switched it to OpenRouter Luna at 10:50:08. B's independent direct request returned one `GROUP_ISOLATION_OK` at 10:50:43; A's direct Provider receipt at 10:51:00 retained Luna. The 10:49:30–10:50:30 group interval contains exactly three control receipts, zero ordinary `turn_start` events, thirteen successful isolated native text tasks, and eleven reasoned suppressions: five not-addressed, three already-processed, and three delivery-after-latest-input.

Direct-control intervals 10:32:50–10:40:10 and 10:41:25–10:42:15 contain ten and seven controls respectively, with zero ordinary provider turns; eleven and eight isolated native text tasks completed separately. The fresh run through the final audit has zero `turn_error`, `native_text_task_error`, or `host_bridge_error` events and zero tool-call IDs outside the `grokbot-router-tool-` namespace.

All seven required gates passed on the unchanged artifact. This is an exact-version, exact-reviewed-host result. It does not establish Windows native support, compatibility with 0.44.0, or compatibility with an unreviewed host hash. Mixed requests that explicitly name an outer tool can schedule that tool before delegation; the verified discovery-first prompt names the sub-agent tool directly.
