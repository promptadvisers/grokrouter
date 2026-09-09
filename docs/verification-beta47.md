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
