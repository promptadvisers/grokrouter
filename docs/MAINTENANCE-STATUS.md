# Maintenance candidate beta.47

This candidate is not released. `docs/release-acceptance.json` remains pending until the final artifact passes every live gate on each supported desktop version.

## Implemented

- Unknown, foreign, and modified live hosts cannot be replaced automatically from an old backup. Explicit verified stock restore remains available.
- Exact stock hash and byte-count verification is restored. Structural checks provide diagnostics only.
- Existing beta.45/beta.46 adapters are reconstructed byte-for-byte from a trusted original before upgrade. Doctor verifies adapter identity separately from backup health.
- Channel-control suppression is scoped to the host's root request, preserving unrelated conversations and explicit controls.
- Official Grok Bot 0.36.0 has a separate exact desktop gate, reviewed host entry, signed registry, and persisted version selection. macOS checks the vendor signature before installation.
- Native skill-menu invocations are parsed from the observed expanded recipe and trailing mention. Mismatched names and unrelated prose do not gain command authority.
- Runtime upgrades preserve per-Bot selections, saved threads, durable receipts, and audit history.
- Brokered `SendMessage` results count as delivered answers. Historical dynamic-tool calls cannot fabricate a background-task acknowledgement.
- The management Doctor returns success only when its runtime syntax and host-adapter checks pass. In-chat and desktop health checks now have separately documented scopes.
- Windows packaging uses the Electron version pinned in its dependency manifest.
- Release version consistency, per-version live evidence, and passing CI are required before source tagging. The README retains the last published download until the new tag exists.

## Verified so far

- The automated runtime, patcher, installer/payload, Windows-contract, and release/compatibility suites pass locally.
- The Mac artifact builds and passes codesign verification.
- GitHub Mac and Windows builds and CodeQL passed on `f0d2bca`; later commits require their own successful checks.
- On official Grok Bot 0.36.0, a genuinely new Bot returned the correct native Models catalogs, switched providers and models, and reported the matching native Provider status after the expanded-invocation repair. The OpenRouter identity and exact-text retests produced one settled answer after the brokered-delivery repair.
- Reinstalling `f0d2bca` with Codex as the default preserved the existing Bot's OpenRouter Luna selection and 36 prior audit events. Desktop Doctor verified the exact adapter and stock backup. Grok briefly failed to reconnect and one offline control failed to send; a later native Provider control completed with the preserved selection.
- The source installer built from a fresh `f0d2bca` Git archive into a clean test Applications directory, reported beta.47, and passed codesign verification. This does not substitute for the live restore/reinstall or capability gates.
- Main now requires the Mac, Windows, and CodeQL checks and pull-request merging. Secret scanning, push protection, Dependabot security updates, and CodeQL are enabled.

## Issue disposition

All open installation reports have tracking labels. Issue #8's exact pinned download now returns HTTP 200 and that download defect is closed; this is not a claim that the reporter's full installation was verified. Issues #1, #2, #3, #5, and #7 remain open while compatibility and live recovery evidence is gathered. #5 also requires native Windows evidence and a clear prior-router sequence.

The older implementation checkout and all its uncommitted work remain preserved. See `LOCAL-CHANGE-RECONCILIATION.md`.
