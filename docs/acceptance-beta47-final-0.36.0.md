# Beta.47 final candidate on Grok Bot 0.36.0

Status: superseded by the Codex greeting correction; these receipts apply only to `b5eb6ce`. All times are UTC on September 9, 2026.

- Production commit: `b5eb6ce`.
- Production digest: `857854d86093241a22b91016900d147855f10654dd377d94904f26e439d36ab2`.
- Mac ZIP SHA-256: `b1aad0620a51bad76239c3bd2d3a175148ad0cf50aa95dbcc74c81e75e41f41d`.
- Clean source ZIP SHA-256: `b63aeb0059179a4cf728631f067160fdf69a60a61bec417f7754f3f82b497278`.
- Official desktop 0.36.0; the installer checks its vendor signature before each operation.

## Lifecycle

The same candidate installed successfully, restored stock at approximately 05:52, and reinstalled by 05:59. The restore terminal showed `ok: true`, `status: restored`, `GROKBOT_ROUTER_UNINSTALL_OK`, and exact stock SHA-256 `3364e421402302f8264f961637addb3997a817fde84a91b19635a0c28ff3941f`. Runtime and stock backup were retained. Restore removed six native commands; reinstall verified six unique commands for 25 Bots and channels before requesting the host restart. The desktop installer reported successful installation and reopened Grok normally.

Repair completed at approximately 06:00 on official 0.36.0, verified six unique commands for 25 Bots and channels before restart, and reported `Router repaired. Automatic repair is enabled.` This verifies the desktop-version blocker described in issue #7 on the reviewed host; it does not authenticate every reporter’s unknown host. Desktop Check health completed by 06:02. The actual terminal returned `hostAdapterVerified: true`, `stockBackupVerified: true`, `stockBackupTrust: exact-allowlist`, `ok: true`, `status: installed`, and `supportedVersion: 0.36.0`; Codex was signed in and the protected OpenRouter credential had valid shape. The first fresh final acceptance Bot was then created at approximately 06:02.

## Clean source

The clean `git archive b5eb6ce` source ZIP built and installed into an isolated Applications directory while official desktop 0.36.0 was installed. Signature verification passed. Logs remain in the local maintenance verification directory. This independently verifies source installation of the desktop application; the live host cycle used the Mac artifact named above.

## Fresh controls (in progress)

`Router47 Final A036` was created after the final lifecycle and health check. Its only initial greeting at 06:02:51 was “Ready. What would you like me to work on?” All six native entries were discovered and invoked. Native Doctor at 06:03:22 returned beta.47 health; native Reasoning at 06:03:29 reported medium with the exact change syntax. Models, Model, Provider, and Router returned their deterministic catalog/status receipts. Literal `/router doctor` at 06:03:59 matched the native health scope. `/provider openrouter` at 06:04:01 switched to Claude; native Models showed the OpenRouter catalog and explicit switch instructions. Bare `openai/gpt-5.6-luna` at 06:04:13 switched to Luna, and `/provider` at 06:04:16 confirmed OpenRouter Luna. Audit verification and the rest of the procedure remain pending.

At 06:04:21, ordinary model inference correctly identified OpenRouter `openai/gpt-5.6-luna`. The next request returned exactly one `FRESH_BOT_TEXT_OK` at 06:04:45, still single when inspected after the second Bot was created. Exact pasted `/Provider`, `/Router   Doctor`, `/router foo`, `/provider open router`, `/reasoning MAX`, and `unlisted/vendor-model` all returned deterministic status/help at 06:05:30–06:05:48. `/models anthropic/claude-sonnet-4.6` switched successfully at 06:05:56.

`Router47 Final B036` was created independently at approximately 06:05 and greeted once at 06:05:25: “What would you like me to work on?” Its `/provider` at 06:06:00 returned installer-default Codex SDK `gpt-5.6-sol`, medium reasoning, while A retained its OpenRouter override.

## OpenRouter capabilities (in progress)

A used OpenRouter `anthropic/claude-sonnet-4.6`. The exact file prompt requested outer Shell to create `/tmp/grokrouter-b5-036-openrouter-proof.txt` with `OPENROUTER_OUTER_TOOL_OK` plus one newline, outer Read, then Screenshot. At 06:06:39 the visible reply reported the correct content and correctly described an idle desktop with no open windows. Independent terminal inspection confirmed the exact file bytes. Redacted audit session `58307d8472b412311732c2bc` recorded Shell at 06:06:14.903, Read at 06:06:30.652, Screenshot at 06:06:32.484, SendToUser at 06:06:39.300, and suppression with reason `delivery-after-latest-input` at 06:06:39.473.

After opening Terminal through the UI, a second Screenshot request returned the observed title `Terminal - box@cursor: /workspace` at 06:08:06. The response also repeated the file receipt, exceeding the request for only the title; its window identification matched the independently inspected desktop. A real sub-agent request was sent at 06:08:21 to compute 7 × 8, return its actual child result, and deliver `OPENROUTER_CHILD_OK` plus the number. Completion verification is pending.

OpenRouter's first delegation call was `GetDynamicTools` at 06:08:25.996, followed by `CallDynamicTool` at 06:08:31.065. The separate child `sand-subagent-082fc16b-f430-4163-85a6-51985f288230` has exactly a user computation request and an assistant result `56`. The parent native transcript is `4edce0ab-eff0-4a8b-869c-8afa0a451479`. Parent delivery returned `OPENROUTER_CHILD_OK 56` at 06:08:42.011; the next continuation produced `turn_suppressed` with `delivery-after-latest-input` at 06:08:42.189. It was still a single completed-result bubble at 06:10:15. The earlier 06:08:35 visible waiting acknowledgement was not counted as completion.

Across the inspected audit interval beginning 06:02, all 15 tool-call IDs had the `grokbot-router-tool-` prefix, and all 27 suppressed turns had the explicit `delivery-after-latest-input` reason. Second-Bot runtime session is `d0402309be3a7ae28c33251c`; its greeting completed at 06:05:25.136 with zero tool calls.

A switched to Codex `gpt-5.6-sol` at 06:10:16 and received the equivalent real Shell/Read/Screenshot prompt at 06:10:18 for `/tmp/grokrouter-b5-036-codex-proof.txt`. Verification is in progress.

## Final audit failure and Codex development receipts

Codex's proof file independently matched `CODEX_OUTER_TOOL_OK\n`. Audit recorded outer Shell at 06:10:29.203, Read at 06:10:39.925, Screenshot at 06:10:47.205, and the correct visible reply at 06:10:55.054. The separate child `sand-subagent-61232064-790d-40ed-9a87-00acb759c72e` returned `63`. The parent emitted `CODEX_CHILD_OK 63` once at 06:13:37. A separate later hidden completion reported failure of a child retry (“Return the numeric result from your completed 9 times 7 task”); this led to an unnecessary no-further-action follow-up at 06:13:57. This was a distinct completion, not replay of the successful child's receipt. The earlier 06:13:22 response that the value had not arrived was not counted as completion.

The deeper greeting audit failed acceptance: A's normal-looking greeting had first invoked `GetDynamicTools` at 06:02:40.458 before returning its visible greeting at 06:02:51.189. B's greeting had zero calls. The Codex path lacked OpenRouter's automatic-greeting tool restriction. The correction removes offered outer schemas for automatic greetings, constrains the structured tool-call array to zero, explicitly forbids native tools in the greeting prompt, and prevents malformed provider output from dispatching a tool. Empty-response recovery keeps the same restriction. A regression exercises both direct malformed output and empty-then-malformed recovery.

This source change invalidates final-candidate acceptance. The lifecycle and capabilities above remain historical b5eb6ce receipts. Fresh-Bot, channel, both-provider, and both-desktop gates must be rerun on the corrected source.
