# Maintenance candidate beta.47

This candidate is not released. `docs/release-acceptance.json` remains pending until the final artifact passes every live gate on each supported desktop version.

## Implemented

- Unknown, foreign, and modified live hosts cannot be replaced automatically from an old backup. Explicit verified stock restore remains available.
- Exact stock hash and byte-count verification is restored. Structural checks provide diagnostics only.
- Existing beta.45/beta.46 adapters are reconstructed byte-for-byte from a trusted original before upgrade. Doctor verifies adapter identity separately from backup health.
- Channel-control suppression is scoped to the host's root request, preserving unrelated conversations and explicit controls.
- Official Grok Bot 0.36.0 has a separate exact desktop gate, reviewed host entry, signed registry, and persisted version selection. macOS checks the vendor signature before installation.
- Native skill-menu invocations are parsed from the observed expanded recipe and trailing mention. Mismatched names and unrelated prose do not gain command authority.
- Windows packaging uses the Electron version pinned in its dependency manifest.
- Release version consistency, per-version live evidence, and passing CI are required before source tagging. The README retains the last published download until the new tag exists.

## Verified so far

- The automated runtime, patcher, installer/payload, Windows-contract, and release/compatibility suites pass locally.
- The Mac artifact builds and passes codesign verification.
- GitHub Mac and Windows builds and CodeQL passed on `5eeb8ee`; later commits require their own successful checks.
- The candidate installed on official Grok Bot 0.36.0. The native menu's Models failure was reproduced in a genuinely new Bot, repaired, and is being retested on the rebuilt artifact.
- The source installer builds and installs into a clean test Applications directory. This does not substitute for the live restore/reinstall or capability gates.
- Main now requires the Mac and Windows checks and pull-request merging. Secret scanning, push protection, Dependabot security updates, and CodeQL are enabled.

## Issue disposition

All open installation reports have tracking labels. Issue #8's exact pinned download now returns HTTP 200 and that download defect is closed; this is not a claim that the reporter's full installation was verified. Issues #1, #2, #3, #5, and #7 remain open while compatibility and live recovery evidence is gathered. #5 also requires native Windows evidence and a clear prior-router sequence.

The older implementation checkout and all its uncommitted work remain preserved. See `LOCAL-CHANGE-RECONCILIATION.md`.
