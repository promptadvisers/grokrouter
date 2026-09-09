# Beta.47 acceptance on Grok Bot 0.36.0

Status: superseded by the Reasoning status correction. These receipts belong to `544ef2d` only. All times are UTC on September 9, 2026.

- Production source: `544ef2d`, digest `2a87b92a747b17f105172a22452d858bc82854d93605d22f86512358ae5bd90d`.
- Tested Mac ZIP: SHA-256 `5eecdaa48e2f9c8d25a049da93ac7a9db5e17793cee77dc5ad45b9cca5e1e612`.
- Official desktop: 0.36.0, vendor signature checked by the installer before every operation.

## Completed lifecycle

The same artifact installed at approximately 05:23, restored stock, and reinstalled at approximately 05:36. The restore terminal returned `ok: true`, `status: restored`, `GROKBOT_ROUTER_UNINSTALL_OK`, and exact stock SHA-256 `3364e421402302f8264f961637addb3997a817fde84a91b19635a0c28ff3941f` (reviewed size 25,656,693 bytes). It retained the runtime and backup. Six shared router commands were removed before restore; reinstall verified six unique commands for 24 Bots and channels before restarting the host.

Desktop Check health ran the management Doctor after reinstall. The visible terminal receipt verified the installed adapter, exact-allowlist stock backup, supported version 0.36.0, signed-in Codex, and valid protected OpenRouter credential shape. At 05:37:22, the existing test Bot returned OpenRouter `anthropic/claude-sonnet-4.6` despite the installer default remaining Codex `gpt-5.6-sol`.

## Clean source installation

The source ZIP from `git archive 544ef2d` has SHA-256 `a7e6cf6ffb6ba83dcb18cb8a5f8a279be2800e333e2763a1e18f2107f9e5b0d5`. Its `scripts/install-macos.sh` built and installed the desktop app into an isolated Applications directory while official Grok Bot 0.36.0 was installed. `codesign --verify --deep --strict` passed. The host lifecycle above used the named Mac ZIP build; the clean-source check separately verifies building and installing the desktop application from the source archive.

## Remaining acceptance

Fresh-Bot controls, two-Bot isolation, channel controls, and complete Codex/OpenRouter capabilities after the final reinstall are pending. Earlier development capability receipts are in `verification-beta47.md`; they do not replace this final sequence.

The fresh Bot greeted at 05:38:48. All six native entries were discoverable. Doctor, Models, Provider, Model, and Router returned deterministic expected receipts. Bare native Reasoning returned unknown-command help, contradicting its descriptor's promise to show the current effort. This failed the control gate and led to a small runtime correction. Exact pasted `/Provider`, `/Router   Doctor`, `/router foo`, `/provider open router`, `/reasoning MAX`, and `unlisted/vendor-model` returned the expected status/help. An earlier keyboard-typed spaced command was changed by macOS punctuation substitution and was excluded from that check.
