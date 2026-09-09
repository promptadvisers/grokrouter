# Beta.47 60e5c12 acceptance on Grok Bot 0.36.0

Status: superseded by the final-format routing correction; not final release acceptance. All times are UTC on September 9, 2026.

- Production commit: `60e5c12`.
- Source digest: `2c52c57bc3b7413710b65e933eba25d6b95d2df3a5fdba6d2ac957f6e0c52e26`.
- Mac ZIP SHA-256: `daf7b2c8b1c4a3de796b672d6995fcfe05a9fc353ebe73f1be0474facb6885c2`.
- Clean source ZIP SHA-256: `19624a8f97bed2bbcc584893ab8a6be605fcb76faedbbf4beabaee98f2888a3a`.
- Desktop: official vendor-signed Grok Bot 0.36.0.

All 64 runtime tests, 16 Python patch/executor tests, installer/payload integration checks, 12 Windows contract tests, and 5 release/compatibility tests pass. The Mac build and independent clean-source installation into an isolated Applications directory both passed signature verification. Logs are retained in the local maintenance verification directory.

Initial installation completed by 06:50, verifying six unique native commands for 29 Bots and channels before host restart. The same artifact then removed the six commands and restored stock. At approximately 06:52, the actual terminal returned `ok: true`, `status: restored`, `GROKBOT_ROUTER_UNINSTALL_OK`, and exact stock SHA-256 `3364e421402302f8264f961637addb3997a817fde84a91b19635a0c28ff3941f`; runtime and backup were retained. Reinstallation of the same artifact completed by 06:54:40, again verifying six unique native commands for 29 Bots and channels before restart. Desktop Check health is running. Fresh-Bot controls, isolation, channels, and both-provider capability acceptance remain pending.

Desktop Check health completed before 06:56. The actual terminal verified `hostAdapterVerified: true`, `stockBackupVerified: true`, `stockBackupTrust: exact-allowlist`, `ok: true`, `status: installed`, and `supportedVersion: 0.36.0`, then emitted `GROKBOT_ROUTER_DOCTOR_DONE`. Codex was signed in and the protected OpenRouter credential had valid shape.

The genuinely new `Router47 Release A036` was created after that complete lifecycle and health check at approximately 06:56. Fresh controls and capability verification are in progress.

## Fresh controls

A greeted once at 06:56:37: “Hey! I’m ready whenever you are.” All six native entries were discovered and invoked. Native Doctor at 06:57:22 returned beta.47 health, Reasoning at 06:57:25 returned medium and exact change syntax, Models at 06:57:29 listed the Codex catalog and explicit switch instructions, and Model/Provider/Router at 06:57:41–06:57:48 returned matching Codex Sol status. Literal `/router doctor` at 06:57:50 matched native health. `/provider openrouter` at 06:57:59 switched to Claude; native Models at 06:58:03 listed the OpenRouter catalog and switch instructions. Bare `openai/gpt-5.6-luna` switched at 06:58:05, confirmed by `/provider` at 06:58:08. The identity response, exact-text, edge cases, and audit verification are pending.

The identity response at 06:58:30 agreed with OpenRouter Luna. The exact-text request returned one `FRESH_BOT_TEXT_OK` at 06:59:01, still single at 06:59:56. Literal pasted edge checks returned deterministic status/help: `/Provider` at 06:59:56, `/Router   Doctor` at 06:59:59, `/router foo` at 07:00:01, `/provider open router` at 07:00:15, `/reasoning MAX` at 07:00:18, and `unlisted/vendor-model` at 07:00:20. `/models anthropic/claude-sonnet-4.6` switched successfully at 07:00:23.

The second genuinely new Bot, `Router47 Release B036`, greeted once at 06:59:47 and returned the installer default Codex SDK / `gpt-5.6-sol` / medium at 07:00:35, independently of A's OpenRouter override. Remote audit inspection independently confirmed zero tool names on A's 06:56:37.712 greeting and B's 06:59:47.613 greeting. A's runtime session ID is `c1052f7fbb236723c08b573c`. The installed remote runtime SHA-256 is `c60bf395cf706cf595f5eab9cb4f5283475fabf1ca64b6d2c48cfba4b68ac7ed`, exactly matching the final artifact.

## Final-format defect discovered

OpenRouter completed the requested Shell/Read/Screenshot proof at 07:06:29. A delegation prompt at 07:06:39 included “reply with exactly” as its final formatting requirement. The broad text-only detector removed prerequisite tools, and the provider returned empty twice; the runtime reported an error at 07:06:46 instead of claiming a launch. Rephrasing without that embedded match launched a child at 07:07:50 and returned one `OPENROUTER_CHILD_OK 56` at 07:07:56, still single at 07:10. That success does not excuse the first failure. The correction restricts schema removal to unambiguous standalone literal requests and clarifies both provider prompts. Three mixed-work regressions preserve offered tools and forced delegation. Final-artifact acceptance must restart after this correction.
