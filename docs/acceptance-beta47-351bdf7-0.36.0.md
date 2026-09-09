# Beta.47 351bdf7 acceptance on Grok Bot 0.36.0

Status: superseded by the one-time launch acknowledgement correction; not final release acceptance. All times are UTC on September 9, 2026.

- Production commit: `351bdf7`.
- Source digest: `f23c7f7c56f9f7f0c723c19dd04d440a7409c294efbe5d998642c830ff2f99b6`.
- Mac ZIP SHA-256: `8d91b3de020ca0f31859844025af18a4926f2a6428ecf302129a9d38f9a22fdd`.
- Clean source ZIP SHA-256: `3dbe051669c44b95eb437ff4c1cca4af5f59256224b4e8cdd8887320e5bbf8b9`.
- Runtime SHA-256: `c8acce6cc97be1b941069177e47d6ebf6afc21db4952d6684ccbf2189c9b1a29`.
- Desktop: official vendor-signed Grok Bot 0.36.0.

All 67 runtime tests, 16 Python patch/executor tests, installer/payload checks, 12 Windows contract tests, and 5 release/compatibility tests pass. The Mac build and independent clean-source installation into an isolated Applications directory pass signature verification. Logs are retained as `task-receipt-spacing-tests.log`, `task-receipt-spacing-build.log`, and `task-receipt-spacing-clean-source.log` in the local maintenance verification directory.

Initial installation completed at approximately 08:08, reporting a successful install and verifying six unique native commands for 33 Bots and channels before requesting the host restart. A live regression probe in existing development Bots precedes stock restoration and reinstallation. It does not substitute for fresh-Bot acceptance after the final lifecycle.

## Live guard proof and acknowledgement recovery

The installed runtime hash independently matched `c8acce6cc97be1b941069177e47d6ebf6afc21db4952d6684ccbf2189c9b1a29`. Existing development Bot A (`f7b4dd81d94b839f9a666389`, OpenRouter Claude) emitted `background-task-awaiting-completion` at 08:09:42.977 and subsequent pending continuations; B (`c1d0cb0b615a2b1727a8acc6`, Codex Sol) emitted the same reason at 08:10:21.314 and subsequent pending continuations.

The native parent journals verified launch receipt → actual hidden completion → final delivery for both providers. OpenRouter's child `sand-subagent-c384d4e3-4a1d-4950-9cc2-0644892f4617` independently returned `319`, and parent `905057db-4c3c-45dc-886e-b4e9e634a818` delivered one `OPENROUTER_VERIFIED_OK 319` at 08:10:06. Codex's child `sand-subagent-52430f0a-4f8b-452b-a285-b51d39c98e5c` independently returned `217`, and parent `2d8c3240-b02c-4c7c-b0b9-de4305183825` delivered one `CODEX_VERIFIED_OK217` at 08:10:58. Neither delivered a numeric result from the launch receipt.

The journals also exposed repeated native `[ack-redrive-...]` recovery prompts because the originating user request had received no initial acknowledgement. The correction replaces a blocked premature final answer with one fixed, truthful acknowledgement justified by the paired launch receipt, while still reserving the result for actual completion. Replayed acknowledged launches do not invoke either provider again; separate completed-child requests still resume once. Full automated checks pass. Final-artifact acceptance must restart for this correction.
