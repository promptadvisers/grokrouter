# Beta.47 bff08ee verification on Grok Bot 0.36.0

Status: superseded by the exact native first-run envelope correction. This record is source-specific; all times are UTC on September 9, 2026.

- Production commit: `bff08ee`.
- Source digest: `ed613b8f92b87805945f0a69ef7a48757c4ddde27fd64e652b3349b40652f070`.
- Mac ZIP SHA-256: `969d88876cb677d8d55e4ddcdf65aaf80fb44bad081592a4621d4cc900417ef0`.
- Clean source ZIP SHA-256: `9c7016f391560d260b8c635a9a44e5da53c2ef93dce4a75fb04dc2198103d2b0`.
- Desktop: official vendor-signed Grok Bot 0.36.0.

The complete automated suite passes: 63 runtime tests, 16 Python patch/executor tests, installer/payload integration, 12 Windows contract tests, and 5 release/compatibility tests. The primary Mac artifact built and passed signature verification. An independent `git archive bff08ee` source ZIP built and installed into an isolated Applications directory with signature verification. These checks do not replace live host and fresh-Bot acceptance.

## Initial installation (in progress)

Before changing the host adapter, the previously installed b5eb6ce was explicitly restored to verified stock. At approximately 06:35, the actual terminal returned `ok: true`, `status: restored`, `GROKBOT_ROUTER_UNINSTALL_OK`, and exact stock SHA-256 `3364e421402302f8264f961637addb3997a817fde84a91b19635a0c28ff3941f`. The desktop removed all six native commands before restore. This is a precondition for the new adapter, not its own completed install/restore/reinstall cycle.

The new candidate installation began at approximately 06:36 and completed by 06:38. The desktop observed the authoritative install receipt, verified six unique commands for 28 Bots and channels before restart, and reopened Grok normally. Greeting and native group-control regression probes are pending, followed by the complete final sequence on both supported desktop versions.

## Group regression passed; greeting still failed

The installed runtime SHA-256 was independently checked as `c214d335932dd41c13985b79ef726a56681b2a437a4faddda4274831d68aeeb7`, matching bff08ee. In the existing test-only group, A's addressed `/provider` returned exact OpenRouter Claude status at 06:39:39, B's addressed `/provider` returned exact Codex Sol status at 06:40:35, and A's addressed `/model openai/gpt-5.6-luna` switched only A at 06:40:37. No other member produced a follow-up message. B's independent direct request returned exactly `GROUP_ISOLATION_OK` at 06:40:55. A's direct `/provider` at 06:41:26 retained the group-selected Luna model.

The group audit interval 06:39:38–06:40:45 contains exactly three `control_turn` events and 26 explicit suppressions across A/B, with zero `turn_start` or `turn_ok` inference events. Controls occurred at 06:39:38.614, 06:40:35.064, and 06:40:37.403. Suppression reasons were `delivery-after-latest-input` (3), `channel-control-already-processed` (9), and `channel-control-not-addressed` (14).

A genuinely new Bot, `Router47 bff Greeting`, greeted at 06:40:16. Its audit session `d0a831c832cc3ecd1f2732e3` nevertheless called GetDynamicTools at 06:40:08.536 before the normal reply. The native transcript ID is `04f0723e-15c7-4d34-8431-f629ed23730c`. The actual first message is `[SAND_HIDDEN_PROMPT][first run]`, wrapped in the host's timestamped user query and preceded by a user-role procedure-context message. The previous empty-visible-input predicate incorrectly treated that procedure as a human request. The corrected shared greeting predicate recognizes the exact latest first-run envelope with its native request ID, while later human requests and real completion/tool-result turns keep normal capabilities. The new test covers this complete shape for both providers. Full acceptance remains pending on the corrected source.
