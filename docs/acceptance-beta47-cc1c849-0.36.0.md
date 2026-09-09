# Beta.47 cc1c849 acceptance on Grok Bot 0.36.0

Status: superseded by episode-summary task isolation; not final release acceptance. Times are UTC on September 9, 2026.

- Production commit: `cc1c849`.
- Source digest: `15da0410c7aa42bfcf7ba99ece4768a4e74fb1ae7b3a77c13f9c3e02608520eb`.
- Mac ZIP SHA-256: `75d0c8a43ad4e456d530e2015e5e717e1c5c61f95469d357a478325234736ce5`.
- Runtime SHA-256: `541f5b9011f1593ad057ab91e3a7a56ed876a8745fce7d9016e6f779e5cd3f7e`.
- Clean source ZIP SHA-256: `9db1cd739504d67f9155c2198ddbef8604957608014bf9a109a8d6572ce150b7`.
- Desktop: official vendor-signed Grok Bot 0.36.0.

All 70 runtime tests, 17 Python patch/executor tests, installer/payload integration, 12 Windows contract tests, and 5 release/compatibility tests pass. The Mac build and independent clean-source installation pass signature verification. Logs are `broker-literal-tests.log`, `broker-literal-exact-fixture.log`, `broker-literal-build.log`, and `broker-literal-clean-source.log` in the local maintenance verification directory.

The initial live installation is in progress. The native host adapter is unchanged from 65254d4; this revision extends only the literal-response decoder to the exact known brokered delivery envelope. No fresh-Bot or lifecycle gates are recorded as passed yet.


The initial install succeeded and registered six commands for 37 Bots/channels. At 09:39:22 the repeated literal request failed with an empty OpenRouter response after one recovery; the router recorded the error and suppressed the next duplicate continuation. A fresh literal request at 09:40:29 returned exactly `BROKER_LITERAL_OK` once at 09:40:34. Its installed runtime matched the candidate hash, and audit `turn_ok` at 09:40:34.540 recorded `normalizedLiteralDelivery: true`, no outgoing tools, and subsequent `delivery-after-latest-input` suppression. This verifies the text decoder live.

The same audit exposed a distinct periodic episode-summary helper at 09:40:36.235, after successful isolated memory extraction. This helper reused the main chat executor with only system/user text and inherited cached tools, causing an unintended GetDynamicTools request. Native call-site inspection identified `summarizeEpisode` separately from `extractMemories`; both collect plain text. The next revision marks the exact episode-summary executor call and runs it through the existing isolated native text-task path. No final fresh-Bot or lifecycle gate is claimed for this superseded revision.
