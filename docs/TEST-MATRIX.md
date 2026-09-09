# Verification matrix

Verification lock: September 9, 2026. GrokRouter `0.1.0-beta.47`, production commit `644a9c4`. All seven required live gates passed independently on official Grok Bot **0.30.0 and 0.36.0** with the same Mac artifact. The protected release workflow passed and the source prerelease was published September 9, 2026. See [publication verification](release-beta47-publication.md).

Source digest: `86e10453fc44d718321226487aa7f7dd5d3572c900cc96d16fe55e857b48af02`.
Mac test ZIP SHA-256: `7d648ff8f65cf1421f83c177c217d8f95c4620834be0eefd00164bee5e2b430f`.

The dated receipts are in [0.30.0 acceptance](acceptance-beta47-644a9c4-0.30.0.md) and [0.36.0 acceptance](acceptance-beta47-644a9c4-0.36.0.md). The [machine-readable record](release-acceptance.json) binds every gate to the production source and both exact desktop versions.

| Required gate | 0.30.0 | 0.36.0 | Evidence checked |
| --- | --- | --- | --- |
| Mac install → stock restore → reinstall | Passed | Passed | Actual terminal success markers, exact restored stock hash, strict adapter and backup Doctor |
| Fresh-Bot controls | Passed | Passed | New Bots after reinstall, normal tool-free greetings, all six native entries, catalog/model/identity, exact text, command edge cases |
| Two-Bot isolation | Passed | Passed | Second new Bot retains installer default after the first Bot's override |
| Addressed channel controls | Passed | Passed | Three exact control receipts, zero ordinary inference in group interval, durable suppression reasons, independent direct chat |
| Codex capabilities | Passed | Passed | Real outer Shell, Read, Screenshot; actual completed native child returned once to the parent |
| OpenRouter capabilities | Passed | Passed | Real outer Shell, Read, Screenshot; explicit discovery-first delegation, actual completed child returned once |
| Clean source installation | Passed | Passed | Fresh candidate archive, isolated Applications directory, successful local build and signature verification |

Provider capability tests used Codex SDK `gpt-5.6-sol` and OpenRouter `anthropic/claude-sonnet-4.6`. OpenRouter Luna was verified for model selection, identity, and exact text. These results do not establish tool parity for every catalog model.

## Automated checks

The final production revision passed 70 runtime tests, 17 Python patch/executor tests, installer/payload integration checks, 12 Windows contract tests, and five release/compatibility tests. Mac build/signature verification and clean-source installation passed. GitHub CI `34336489366` passed Mac and native Windows packaging; CodeQL `34336489412` passed JavaScript and Python analysis. Documentation revision `aac8b99` also passed all required checks.

Coverage includes exact host trust, foreign/modified-host refusal, previous-adapter reconstruction, independent Doctor failures, atomic per-Bot state, command authority, tool-call IDs, literal envelope decoding, background completion/acknowledgment ordering, and isolated native memory/episode-summary tasks.

## Limits and observed provider behavior

- Windows x64 and Arm64 ZIP/Setup packaging passed CI. Native Windows Grok Bot launch, installation, restoration, and capability acceptance remain unverified; Windows stays a source preview.
- Only exact supported desktop versions and independently reviewed host hash/size pairs are accepted. Grok Bot 0.44.0 was observed during an automatic update and is unsupported.
- One Codex memory-extraction helper on 0.36.0 returned empty after its bounded retry. It was logged explicitly, did not produce a user error bubble or alter command state, and subsequent extraction and episode-summary helpers succeeded. The 0.30.0 fresh run recorded no provider/helper/host bridge errors. This is not a guarantee that providers never fail.
- An explicit named outer tool takes scheduling priority in a mixed OpenRouter request that also describes delegation. The discovery-first capability probe names the sub-agent tool directly. The earlier mixed probe is recorded separately, not counted as forced-discovery evidence.
- Native maintenance sessions such as memory synthesis retain Grok's original inference backend. Marked extraction and episode summaries use isolated text-only calls and do not share routed chat threads, cached tools, or completion receipts.
- A read-only capability result does not authorize unrelated tools or broader actions. Grok owns offered schemas, permissions, and execution.

Earlier failures and superseded implementations remain in [beta.47 development receipts](verification-beta47.md) and the [historical matrix](TEST-MATRIX-HISTORY.md). Historical passes do not substitute for this release's evidence.
