# Beta.47 fdbae51 acceptance on Grok Bot 0.36.0

Status: superseded by the native memory-task isolation correction; not final release acceptance. Times are UTC on September 9, 2026.

- Production commit: `fdbae51`.
- Source digest: `989dd6bb785ac65943de07e9eca9ad9f63975a87510822c32e997747232c7ec7`.
- Mac ZIP SHA-256: `e3d28ec84698658165b667e86c18c23df19a63f111b01e256518713586651457`.
- Clean source ZIP SHA-256: `c9596c932c0396c670cf3e8fb747567094f9643918161c35701d0d0f33e9cf83`.
- Runtime SHA-256: `2c383e89a048a6229145e7e577cd66bf5d78d5587e5a896a3b5bb88a0669deeb`.
- Desktop: official vendor-signed Grok Bot 0.36.0.

All 67 runtime tests, 16 Python patch/executor tests, installer/payload checks, 12 Windows contract tests, and 5 release/compatibility tests pass. Mac build and independent clean-source installation pass signature verification. Logs: `background-ack-tests.log`, `background-ack-build.log`, and `background-ack-clean-source.log` in the local maintenance verification directory.

## Pre-acceptance acknowledgement regression

Initial installation succeeded and registered six unique native commands for 33 Bots/channels. Independent inspection matched the installed runtime hash above.

Existing development Bot A (`f7b4dd81d94b839f9a666389`, native parent `905057db-4c3c-45dc-886e-b4e9e634a818`) received the 37 × 7 task at 08:23:55. OpenRouter sent the fixed launch acknowledgement at 08:24:17 and one `OPENROUTER_ACK_OK 259` at 08:24:23. Existing B (`c1d0cb0b615a2b1727a8acc6`, native parent `2d8c3240-b02c-4c7c-b0b9-de4305183825`) received 37 × 11 at 08:24:15. Codex acknowledged at 08:24:40 and returned one `CODEX_ACK_OK407` by 08:25:00.

For each native journal, scoped from the actual human request and excluding hidden prompts as boundaries, the launch acknowledgement was row 5, actual hidden completion row 7, and final delivery row 8. Both had zero native ack-redrive recovery prompts. Empty row 6/9 entries were tool-result receipts, not extra user-visible messages. The audit recorded `background-task-awaiting-completion` at 08:24:17.667 and 08:24:40.467, then explicit `delivery-after-latest-input` suppressions after acknowledgement and final delivery. No duplicate visible final appeared during subsequent inspection.

These existing-Bot probes verify the acknowledgement repair; they do not replace the final lifecycle and genuinely fresh-Bot gates below.

## Exact-artifact lifecycle

The desktop Restore stock action removed six router-owned workflow entries. Its native terminal receipt reported `ok: true`, `status: restored`, exact stock SHA-256 `3364e421402302f8264f961637addb3997a817fde84a91b19635a0c28ff3941f`, and `GROKBOT_ROUTER_UNINSTALL_OK`. The retained runtime and backup remained available for recovery. Reinstallation of the unchanged fdbae51 artifact is in progress.

Reinstallation succeeded, verified six commands for 33 Bots/channels, and requested host restart after registration. Desktop Check health then reported `hostAdapterVerified: true`, `stockBackupVerified: true`, `ok: true`, `status: installed`, supported version `0.36.0`, and `GROKBOT_ROUTER_DOCTOR_DONE`. Codex was signed in and OpenRouter credential shape was valid.

## Fresh controls and isolation (in progress)

`Router47 FD A036` was created after the completed lifecycle. Its automatic greeting at 08:32:21 was “Hi! What can I help you with?” The exact native menu entries Doctor, Models, Model, Reasoning, Router, and Provider were individually selected and returned deterministic expected receipts between 08:32:33 and 08:33:12. Doctor identified beta.47 and runtime/credential health. Both provider catalogs ended with explicit switching instructions; bare `openai/gpt-5.6-luna` switched A at 08:33:38 and Provider confirmed it at 08:33:44. The independently fresh `Router47 FD B036` was created after that override.

A's model-authored identity at 08:33:57 agreed with OpenRouter Luna status. One `FRESH_BOT_TEXT_OK` appeared at 08:34:57 with no subsequent duplicate during the control sequence. B greeted normally at 08:34:15 and `/provider` returned the installer default Codex Sol/medium at 08:34:38. A's `/Provider`, pasted `/Router   Doctor`, `/router foo`, `/provider open router`, `/reasoning MAX`, and `unlisted/vendor-model` all returned deterministic status or help from 08:35:06–08:35:42. `/models anthropic/claude-sonnet-4.6` switched successfully at 08:35:50. Audit confirmation and capability/channel gates remain in progress.

## Native memory extraction failure

Audit inspection confirmed A's greeting (`85fb9316bbb0b575841f6414`) at 08:32:21.340 and B's greeting (`394f8207efaf686b9ff5c5fc`) at 08:34:14.991 returned no outer tool calls. A's native parent is `1f83a769-ff6e-4abc-8bce-001677ba29dc`; B's is `1e8abc40-f77f-4f2b-8fbc-08add3a59a4c`.

After the unlisted-model help response, A's audit showed a separate two-string system/user inference at 08:35:42.392 and a cached `GetDynamicTools` call by 08:35:46.704. The native chat journal had only the intended help receipt, with no extra chat message. Source inspection identified the separate host memory-extraction helper: it builds an Existing memory / Latest exchange prompt and reuses `session.getExecutor()`. The router treated this helper input as a fresh chat request, exposing cached chat tools and sharing conversation state. This is a real ancillary-task defect even though the visible control response was correct.

The correction marks the exact native memory-extraction executor call, keeps its output on the host text stream, and routes memory extraction and explicitly flagged native summarization without chat commands, cached tools, saved chat threads, or human/completion receipts. Both providers preserve the native task instructions, forbid outer tool output, and retain one text-only empty-response recovery. Codex helper threads use read-only sandboxing with network and web search disabled. Automated checks pass; the changed adapter requires a new exact-artifact acceptance cycle.
