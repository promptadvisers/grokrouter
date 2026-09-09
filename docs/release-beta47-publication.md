# Beta.47 publication verification

Published September 9, 2026 at 11:14:19 UTC as a GitHub source prerelease:
https://github.com/promptadvisers/grokrouter/releases/tag/source-v0.1.0-beta.47

- Merged PR: #12.
- Accepted main/tag commit: `d5cb8439d820f35611c7c20350e109d30239bd49`.
- Immutable annotated tag: `source-v0.1.0-beta.47`.
- PR CI: `34342888080`; CodeQL: `34342888092`; all required checks passed.
- Protected tag workflow: `34343666279`; test/build, Windows packaging, and tag jobs all passed.
- Production digest: `86e10453fc44d718321226487aa7f7dd5d3572c900cc96d16fe55e857b48af02`, identical to the final live-tested source `644a9c4`.
- Public installer SHA-256: `37266f921e38e4cf5d80a2f39d4e8d24cb314da2530e16b7c4c8f27c5aed2a15`.
- Downloaded public source ZIP SHA-256: `008f260265250823edeee62ae90d6587983957834f76a363f633921bcfbbe6c8`.

The pinned raw installer and GitHub source archive both downloaded successfully after the tag existed. The extracted public source passed `verify-acceptance.mjs`; its installer bytes exactly matched the separately downloaded raw installer. Running that public installer outside a source checkout downloaded its tagged source, built the Mac app, installed it in an isolated test Applications directory, and passed signature verification. `GROKROUTER_NO_OPEN=1` prevented that verification from changing the user's active installer or live router.

The README command was promoted only after those public-download checks. The source tag was not moved. No prebuilt unsigned Mac binary was attached; the public installer builds and ad-hoc signs locally. Windows remains a source preview despite successful package CI.

Issue #7 was closed after the final artifact's official 0.36.0 Repair, native command reconciliation, strict Doctor, and preserved Provider receipt passed. This is maintainer verification on the exact reviewed host, not reporter confirmation. Issues #1, #2, #3, and #5 remain open for authenticated host evidence or native Windows acceptance. Issue #8's pinned-download defect was already closed separately.

The original source checkout and local edits remain preserved. The accepted local beta.47 installer is at `~/Applications/GrokRouter.app`; beta.45 was retained in `~/Applications/GrokRouter Backups/`. The active official Grok Bot application was returned to vendor-verified 0.36.0 and the unchanged router passed reinstall, Repair, and strict Doctor.
