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
