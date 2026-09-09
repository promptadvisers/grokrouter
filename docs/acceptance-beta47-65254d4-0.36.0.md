# Beta.47 65254d4 acceptance on Grok Bot 0.36.0

Status: superseded by literal-delivery text normalization; not final release acceptance. Times are UTC on September 9, 2026.

- Production commit: `65254d4`.
- Source digest: `ae20ebbed86bc7134711b7a0abb1f3de2188e354fa13fd0ac9c6cfdc22ba79d1`.
- Mac ZIP SHA-256: `df47c8839100e8cc24848f161478abcc8d86ab360a6d44e99a8389ec4a0995fd`.
- Clean source ZIP SHA-256: `6a0a30f05725254b2e0765aa65aae5de242cf7e69fb6a4d8b3f6d7e9a36a1175`.
- Runtime SHA-256: `bd43fd2032650b209f9992c2bf6e05aabbc854a4c77014700dfb4bb2bc04cf0e`.
- Desktop: official vendor-signed Grok Bot 0.36.0.

All 69 runtime tests, 17 Python patch/executor tests, installer/payload integration, 12 Windows contract tests, and 5 release/compatibility tests pass. Mac build and independent clean-source installation pass signature verification. Logs are `native-maintenance-boundary-tests.log`, `native-maintenance-boundary-build.log`, and `native-maintenance-boundary-clean-source.log` in the local maintenance verification directory.

Before this changed adapter was installed, the previous installer explicitly restored stock. The native terminal reported `status: restored`, `ok: true`, SHA-256 `3364e421402302f8264f961637addb3997a817fde84a91b19635a0c28ff3941f`, and `GROKBOT_ROUTER_UNINSTALL_OK`. No automatic unknown-adapter fallback was used.

Initial installation of this candidate completed at approximately 09:06. The installer reported success, verified six unique native commands for 35 Bots/channels, and requested restart only after registration. A brief existing-Bot native memory regression precedes the exact-artifact restore/reinstall and fresh-Bot gates.


## Native helper regression

The installed runtime independently matched the hash above. Existing A received `unlisted/vendor-model` at 09:07:15 and returned deterministic help; its OpenRouter memory extraction completed at 09:07:17.230. B received the same input at 09:07:25 and returned deterministic help; Codex memory extraction completed at 09:07:30.898. Both `native_text_task_ok` receipts had an empty tool list. The inspected interval after 09:07:10 contained no `turn_start`, `native_text_task_error`, or `host_bridge_error`; only `memory-extraction` appeared as a routed native task kind. The explicit native maintenance-session bypass is separately exercised by the patch execution regression.

The unchanged candidate then began its final Restore stock → reinstall sequence. Fresh-Bot acceptance has not yet started.


## Final exact-artifact lifecycle

The candidate Restore stock action removed six native router commands. The actual terminal receipt reported `ok: true`, `status: restored`, exact stock hash `3364e421402302f8264f961637addb3997a817fde84a91b19635a0c28ff3941f`, and `GROKBOT_ROUTER_UNINSTALL_OK`; the runtime and backup remained recoverable. The unchanged candidate was then reopened and its final installation started.


The final reinstall succeeded and again registered six commands for 35 Bots/channels before host restart. Desktop Check health produced an independently inspected terminal receipt with `hostAdapterVerified: true`, `stockBackupVerified: true`, `ok: true`, `status: installed`, supported version `0.36.0`, and `GROKBOT_ROUTER_DOCTOR_DONE`. Codex was signed in and the protected OpenRouter credential had valid shape. This completes the exact-artifact lifecycle gate for 0.36.0.

## Final fresh-Bot controls (in progress)

`Router47 Ship A036` was created at approximately 09:14 after the complete final lifecycle and health check. It is distinct from every development and superseded acceptance Bot.


A greeted normally at 09:14:48. Native Doctor, Models, Model, Reasoning, Router, and Provider were individually selected from the native menu and returned expected deterministic receipts from 09:15:16–09:15:55. Doctor identified beta.47 and runtime/credential health. Both provider catalogs ended with switch instructions. Bare `openai/gpt-5.6-luna` switched A at 09:16:15; Provider confirmed OpenRouter Luna/medium at 09:16:18. `Router47 Ship B036` was created after this override at approximately 09:16:40.


B greeted normally at 09:16:49 and retained the installer default Codex Sol/medium at 09:17:11. A's model-authored identity agreed with OpenRouter Luna at 09:16:29. However, the standalone exact-text request at 09:17:23 failed: at 09:17:26 Luna printed a complete `to=functions.SendToUser` envelope containing the requested `FRESH_BOT_TEXT_OK`, including a `code` decoration with four non-ASCII characters. With no tools offered on this literal request, the executable-tool recovery correctly had no schema, but the text wrapper leaked visibly. Case/whitespace controls still returned deterministic receipts afterward.

The correction decodes only a complete SendToUser text envelope whose sole content exactly matches the explicitly requested standalone literal. It returns plain text, never an executable call. Wrong text, additional fields/recipients, other tools, leading prose, trailing prose, and multiple envelopes remain outside that normalization boundary. Literal/greeting turns also reject native tool calls when no tool was offered. The regression includes the exact observed decoration and quoted literals. All 70 runtime tests and the full 17-test Python, installer, Windows, and release suites pass. Final acceptance must run on the corrected artifact.
