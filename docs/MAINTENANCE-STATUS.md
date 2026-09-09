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
- Native child sessions finish through the host response stream, preserving their final text for the parent. Parent replies retain the canonical delivery handler even when inference schemas omit it.
- Failed delivery receipts cannot suppress the unfinished answer. Recovery is scoped to durable failure IDs, including failures while returning a completed child's result.
- Native child wake-up messages use their durable host request IDs after unwrapping Grok's model-facing user-query envelope; automation inbox messages retain their explicit completion IDs. Identical result text does not merge distinct completion requests. Earlier prefix-only recognition failed live; the normalized envelope path returned actual completed-child results with both providers on development build `544ef2d`. Final-candidate acceptance remains pending.
- Codex receives one recovery attempt for an empty response on the same thread. A tagged completed-child result remains available as the fallback if both responses are empty, with a redacted recovery receipt.
- The management Doctor returns success only when its runtime syntax and host-adapter checks pass. In-chat and desktop health checks now have separately documented scopes.
- Native workflow registration has an operation-specific diagnostic deadline long enough for the host library's readiness wait and bounded retries; ordinary transport calls keep their shorter deadlines.
- Desktop install and repair register native commands before requesting the host restart, avoiding a gateway disconnect during registration. The restart must produce its own receipt.
- Windows packaging uses the Electron version pinned in its dependency manifest.
- Release version consistency, per-version live evidence, and passing CI are required before source tagging. The README retains the last published download until the new tag exists.

- Bare native Reasoning now reports the current effort and gives its exact change command. A fresh-Bot probe exposed the missing status branch; the deterministic regression passes.

- Codex automatic greetings now expose zero outer tools and enforce an empty structured tool-call array, including empty-response recovery and malformed output. A final-candidate audit exposed one unnecessary discovery call behind an otherwise normal greeting.

- Native group controls receive the latest human transcript entry and durable room/message/member identity from the host dispatcher. Addressed controls execute once, other members suppress them with explicit audit reasons, and fresh ordinary input remains independent. This fixes a live channel-envelope failure and requires final-candidate retesting.

- Standalone exact-text requests withhold OpenRouter tools, while final-format instructions attached to real work preserve prerequisite tools and forced delegation. A live mixed request exposed the over-broad detector.

- A paired successful background launch receipt now defers final answers and delivery tools until actual completion. Other requested tools can continue; quoted, failed, and unrelated receipts do not gain authority. The native Task broker receipt, including its paragraph spacing, is covered explicitly. The guard was verified live with both providers on `351bdf7`. Revision `fdbae51` then passed both-provider native journal checks: one receipt-backed launch acknowledgement, actual child completion, one final answer, and zero ack-redrive recovery prompts. Final fresh-Bot acceptance on both supported versions remains pending.

- Native memory extraction now receives a dedicated text-task marker at its exact host executor call. Memory extraction retains its system instructions, exposes no chat tools, returns text directly to the host, and does not alter saved chat threads or completion receipts. Explicit native maintenance sessions retain Grok's original inference backend and structured-text contract. The fdbae51 live audit exposed this ancillary-task defect; corrected live acceptance remains pending.

- Standalone literal replies normalize a complete printed SendToUser wrapper only when its text exactly matches the requested literal. The wrapper is decoded as text and never executed; unoffered native calls on literal/greeting turns are rejected. This repairs the final 65254d4 OpenRouter Luna probe.

## Verified so far

- The automated runtime, patcher, installer/payload, Windows-contract, and release/compatibility suites pass locally.
- The Mac artifact builds and passes codesign verification.
- GitHub Mac and Windows builds and CodeQL all passed for acknowledgement revision `fdbae51` (CI run `34328276039`, CodeQL run `34328276050`).
- On official Grok Bot 0.36.0, a genuinely new Bot returned the correct native Models catalogs, switched providers and models, and reported the matching native Provider status after the expanded-invocation repair. The OpenRouter identity and exact-text retests produced one settled answer after the brokered-delivery repair.
- Reinstalling `f0d2bca` with Codex as the default preserved the existing Bot's OpenRouter Luna selection and 36 prior audit events. Desktop Doctor verified the exact adapter and stock backup. Grok briefly failed to reconnect and one offline control failed to send; a later native Provider control completed with the preserved selection.
- A Codex development probe completed real Shell, Read, and Screenshot calls. Earlier returned-child probes exposed delivery and message-envelope defects. Development build `544ef2d` returned actual completed-child results for both Codex and OpenRouter; the final-candidate sequence remains pending. See `verification-beta47.md` for dated, build-specific receipts.
- The source installer built from a fresh `f0d2bca` Git archive into a clean test Applications directory, reported beta.47, and passed codesign verification. This does not substitute for the live restore/reinstall or capability gates.
- Main now requires the Mac, Windows, and CodeQL checks and pull-request merging. Secret scanning, push protection, Dependabot security updates, and CodeQL are enabled.

## Issue disposition

All open installation reports have tracking labels. Issue #8's exact pinned download now returns HTTP 200 and that download defect is closed; this is not a claim that the reporter's full installation was verified. Issues #1, #2, #3, #5, and #7 remain open while compatibility and live recovery evidence is gathered. #5 also requires native Windows evidence and a clear prior-router sequence.

The older implementation checkout and all its uncommitted work remain preserved. See `LOCAL-CHANGE-RECONCILIATION.md`.
