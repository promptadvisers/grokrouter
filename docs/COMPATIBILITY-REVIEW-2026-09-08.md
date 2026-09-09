# Compatibility investigation, 2026-09-08

This is a candidate investigation, not a release acceptance receipt.

## Grok Bot 0.36.0

The official Apple silicon DMG was downloaded from `https://downloads.cursor.com/grokbot/stable/darwin-arm64/0.36.0/Grok_Bot_0.36.0.dmg`. The installed app reports 0.36.0, identifier `com.anysphere.sand`, and the valid Developer ID signature of Anysphere Incorporated, team `DCNK4UB866`. The candidate installer verifies this identity with an inline codesign requirement before restarting the app.

After an explicit stock restore, the existing test computer exposed this exact unmodified cloud host:

- SHA-256: `3364e421402302f8264f961637addb3997a817fde84a91b19635a0c28ff3941f`
- Bytes: `25656693`
- Architecture: `x86_64`
- Each of the four adapter anchors: exactly one occurrence
- Patch dry run: pass

This is the same exact stock host previously reviewed for desktop 0.30.0. The new 0.36.0 manifest and signed registry include only this observed entry. They do not copy unobserved 0.30.0 entries or accept structurally similar unknown hosts. Provider configuration records the desktop version verified by the installer, and management commands, repairs, and registry updates use its version-specific paths.

The host fingerprint does not establish fresh-Bot, native-tool, channel, or sub-agent compatibility. Those require the full live acceptance procedure on the final artifact.

The official current download endpoint also offered desktop 0.44.0 during this investigation. It remains unsupported pending separate inspection and acceptance. The source does not use version ranges to accept it.

## Packaging correction

Windows package.json pins Electron 41.10.3, but the previous packaging script explicitly selected 40.10.6. The script now reads the pinned dependency version from its staged package.json, keeping the packaged runtime aligned with the lockfile.
The native Models menu entry reached inference and generated an incorrect single-model catalog in the first new 0.36 Bot. Its typed /models command returned all six configured models immediately.

The own test Bot transcript shows that Grok expands a selected native skill into a complete invocation wrapper with its folder, recipe, and trailing @models mention. The candidate had mistaken the wrapper's explicit invocation for unrelated visible prose. The repair recognizes the complete observed wrapper and its matching GrokRouter marker. Unrelated prose, mismatched names, and retained definitions remain rejected.

Unit and integration tests assert this path returns a deterministic control receipt and never calls provider inference. Live retesting on a rebuilt artifact is in progress. No capability or release gate is marked passed yet.

## Live delivery recovery defect

The repaired native Models invocation returned exact configured catalogs on both Codex and OpenRouter in a second genuinely new Bot. A subsequent normal identity question exposed a separate failure: the correct answer was followed by a false background-task launch acknowledgement.

The redacted audit showed a `CallDynamicTool` call and matching result before the empty-response recovery. Grok had already delivered the answer through that broker. The receipt guard now recognizes a broker invocation of an internal message-delivery tool, using its matching tool-call ID. State updates and unrelated dynamic tools do not count as answer delivery. The generic fallback that inferred a background launch from any historical `CallDynamicTool` has been removed. Tests cover both current delivery and an unrelated historical Shell invocation; live retesting remains required.

## Reinstall state preservation

A reinstall changed the test Bot from its selected OpenRouter model to the installer default. The runtime swap copied provider configuration but omitted the per-Bot state directory. The candidate now carries the state directory, legacy state file, and redacted audit history into the new runtime; temporary writes and process locks are excluded.

The installer integration test creates two Bots with different providers and models, establishes a Codex thread, reinstalls with a different default, and verifies both existing selections, the resumed thread, a new Bot's default, and the pre-upgrade audit. Those checks pass. Retained previous runtime directories remain untouched. This is separate from the live upgrade acceptance gate.
