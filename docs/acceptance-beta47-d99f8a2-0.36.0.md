# Beta.47 d99f8a2 acceptance on Grok Bot 0.36.0

Status: superseded by the background launch-receipt guard; not final release acceptance. All times are UTC on September 9, 2026.

- Production commit: `d99f8a2`.
- Source digest: `519de0b5ade5ffa0075cc085f09d9c3702db0bc83d816f48cfd96a5143161ebd`.
- Mac ZIP SHA-256: `35c872ae880ae6dca22d7e2cc53e985cb102f3cc6386f5543d1391a821fa23b0`.
- Clean source ZIP SHA-256: `bede17c1d2a6fd9c5af8d0866301a61a5d89f89bd39ff722963de4746b763f1f`.
- Runtime SHA-256: `6600f6da375d31f3c24b59adbf861d44f631cfcaac1bf08251276caed3129bdc`.
- Desktop: official vendor-signed Grok Bot 0.36.0.

All 65 runtime tests, 16 Python patch/executor tests, installer/payload integration checks, 12 Windows contract tests, and 5 release/compatibility tests pass. The Mac build and independent clean-source installation into an isolated Applications directory both passed signature verification. Logs are retained as `final-format-tests.log`, `final-format-build.log`, and `final-format-clean-source.log` in the local maintenance verification directory.

Initial installation completed at approximately 07:13 after the Bot computer reconnected during transfer and the checksummed payload retried safely. The terminal reported a successful install; the installer verified six unique native commands for 31 Bots and channels before requesting the host restart, then closed its diagnostic port and reopened Grok Bot normally. Stock restoration of the same artifact is underway.

Stock restoration completed and the actual terminal receipt was inspected at approximately 07:15. It reported `ok: true`, `status: restored`, exact stock SHA-256 `3364e421402302f8264f961637addb3997a817fde84a91b19635a0c28ff3941f`, and `GROKBOT_ROUTER_UNINSTALL_OK`; runtime and stock backup were retained. The same Mac artifact was then selected for reinstallation.

Reinstallation completed by approximately 07:16, reporting success and verifying six unique native commands for 31 Bots and channels before host restart. Desktop Check health then completed by 07:18 after reconnection. The actual terminal confirmed `hostAdapterVerified: true`, `stockBackupVerified: true`, `stockBackupTrust: exact-allowlist`, `ok: true`, `status: installed`, and `supportedVersion: 0.36.0`, followed by `GROKBOT_ROUTER_DOCTOR_DONE`. Codex was signed in, and the protected OpenRouter credential had valid shape. The installer was closed before creating the new acceptance Bots.

## Fresh controls

The genuinely new `Router47 Verified A036` was created after the final lifecycle and desktop health check. It greeted once at 07:18:49: “Hey! What can I help you with?” All six native menu entries were discovered and invoked: Doctor at 07:19:17 returned beta.47 health, Reasoning at 07:19:20 returned medium plus exact switch syntax, Models at 07:19:24 showed the Codex catalog and explicit switch instructions, and Model/Provider/Router at 07:19:33–07:19:40 returned matching Codex Sol status. Literal `/router doctor` at 07:19:43 matched. `/provider openrouter` switched to Claude, native Models at 07:19:54 showed the OpenRouter catalog and switch instructions, and bare `openai/gpt-5.6-luna` switched at 07:19:57, confirmed by `/provider` at 07:19:59.

The model-authored identity answer at 07:20:07 matched OpenRouter Luna. The standalone exact-text request returned one `FRESH_BOT_TEXT_OK` at 07:20:37, still single at 07:21:14. The second genuinely new Bot, `Router47 Verified B036`, greeted once at 07:20:52 and `/provider` at 07:21:06 returned the independent installer default Codex SDK / `gpt-5.6-sol` / medium.

A's pasted edge cases all returned deterministic status/help: `/Provider` at 07:21:14, `/Router   Doctor` at 07:21:17, `/router foo` at 07:21:19, `/provider open router` at 07:21:28, `/reasoning MAX` at 07:21:31, and `unlisted/vendor-model` at 07:21:33. `/models anthropic/claude-sonnet-4.6` switched successfully at approximately 07:21:36. Audit verification is pending.

Remote audit inspection independently verified the final runtime SHA-256 `6600f6da375d31f3c24b59adbf861d44f631cfcaac1bf08251276caed3129bdc`. A's runtime session is `f7b4dd81d94b839f9a666389`; B's is `c1d0cb0b615a2b1727a8acc6`. Their greeting `turn_ok` receipts at 07:18:48.999 and 07:20:52.168 respectively contain zero tool names. A's exact-text receipt at 07:20:37.755 also has zero tool names. GitHub Mac/Windows CI and CodeQL passed on `d99f8a2` (CI run 34322506953, CodeQL run 34322506779).

## Premature child delivery discovered

OpenRouter completed the real Shell/Read/Screenshot proof at 07:23:29. The original mixed delegation prompt was accepted at 07:24:20 and forced `GetDynamicTools` at 07:24:25.795, then `CallDynamicTool` at 07:24:31.604. The child `sand-subagent-e3080490-8d0f-45a4-9cc9-4312fa117cab` actually returned `56`. However, the parent native journal `905057db-4c3c-45dc-886e-b4e9e634a818` proves the parent sent `OPENROUTER_CHILD_OK 56` after the task launch receipt with `isBackgrounded: true`, before the hidden child-completion message. After actual completion it sent “Already delivered — staying silent.” at 07:24:41. This is a failed acceptance result, not successful child-return evidence.

The follow-up runtime guard pairs orchestration call IDs with structured successful background launch receipts after the current input boundary. Until actual completion, it withholds premature final text and direct or brokered delivery calls while allowing other requested tool calls to continue. It emits an explicit redacted suppression receipt. New user input, actual completion, failed/unpaired receipts, and unrelated tool or quoted text do not trigger this guard. Both providers and empty recovery are covered by regressions. Final-artifact acceptance must restart.
