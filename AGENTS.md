# Coding-agent guide

This repository is an unofficial, reversible model router for exact official Grok Bot desktop versions listed in `compatibility/supported-apps.json`. Keep the stock Grok interface, computer, tools, and orchestration layer intact; change only the version-gated inference seam.

## Cold start

Read these files in order:

1. `README.md` for the product promise and supported user flow.
2. `docs/HOW-IT-WORKS.md` for the plain-English end-to-end flow and claim boundary.
3. `docs/ARCHITECTURE.md` for the two-process adapter design.
4. `docs/FRESH-BOT-ACCEPTANCE.md` for the release gate.
5. `docs/TEST-MATRIX.md` before changing any verified claim.

The main implementation is `runtime/run-provider.mjs`. `patch/router_patch.py` injects the small host executor. `remote/install.sh` installs the checksummed payload. `installer/GrokBotRouterInstaller.swift` is the native Mac installer.

## Non-negotiable rules

- Never bundle Grok Bot's proprietary host source.
- Never loosen the exact app-version, stock-host hash, or source-anchor gates.
- Never print, log, commit, or copy provider credentials into project files. Platform renderers must clear password fields immediately after the protected handoff.
- Preserve the verified stock backup and one-click restore path.
- Treat provider/model/thread state as per-Bot state, never global state.
- Keep normal text turns single-delivery. Tool turns must resume only after the real Grok tool result appears.
- While an outer tool call is unresolved, assistant-visible status text, reasoning, or a permission bubble is not completion. Only the matching tool result or a new user boundary can settle that call.
- Ordinary hidden continuation prompts must not become fresh user requests. Hidden messages carrying Grok's `sandAutomationCompletionId` are different: they contain completed background/sub-agent work and must revive the parent turn.
- Treat `grokbot-router-send-*`, `sandAutomationCompletionId`, and Grok request/tool IDs as durable protocol identifiers. Deduplicate by those IDs under the per-Bot lock, not by model text or transcript position alone.
- Normalize known Grok tool-call and tool-result wrapper variants before provider conversion. Drop orphan results and synthesize a bounded result for a dangling call so OpenRouter never receives an invalid call/result transcript.
- Generate router-owned provider tool-call IDs; never trust a provider's raw ID as a host protocol identifier.
- Every early turn suppression must write a redacted `turn_suppressed` audit event with its reason and relevant non-secret IDs. A silent return is a debugging regression.
- Treat an empty provider response as recoverable once. A completed background task must fall back to its tagged completion text instead of disappearing from the parent chat.
- In-chat controls must be deterministic and must never leak to model inference.
- Evaluate controls before replay/fingerprint latches. `/router reset` must invalidate any in-flight Codex thread write so a late result cannot resurrect the reset thread.
- Exact or literal text-only requests must not expose outer tools to OpenRouter; they are the single-delivery smoke test, not an invitation to explore tools.
- A brand-new Bot's automatic greeting has no visible user query and must never receive outer-tool schemas. It should return one short greeting directly before the user does anything.
- Do not claim a live capability from code inspection or mocks. Record it in `docs/TEST-MATRIX.md` only after the visible live test and redacted audit receipt both pass.

## Required checks

Run `npm test` after implementation changes. Run `npm run build:macos` for installer or release changes. Before calling a build usable, install that exact artifact on a supported Mac and complete the full fresh-Bot procedure in `docs/FRESH-BOT-ACCEPTANCE.md` from a Bot created after installation. Existing Bots and a previously installed build are not substitutes.
