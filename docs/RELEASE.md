# Source-build release procedure

GrokRouter is distributed as public source for Apple silicon Macs. Viewers build the native app locally instead of downloading an unsigned binary. The canonical repository is <https://github.com/promptadvisers/grokrouter>.

## Viewer installation paths

The README offers two equivalent paths:

1. Paste the one-line command that downloads and runs `scripts/install-macos.sh`.
2. Download the repository ZIP and double-click `Install GrokRouter.command`.

Both paths compile the same checked-in Swift source, ad-hoc sign the resulting local app, verify it, install it to `~/Applications/GrokRouter.app`, and open it. Neither path needs `sudo`, a DMG, a distributed binary, or an Apple Developer certificate.

If Xcode Command Line Tools are missing, macOS opens Apple's installer. The viewer finishes that installation and runs the GrokRouter command again.

## Release checklist

1. Confirm the official Grok Bot version is still exactly 0.30.0.
2. Update version fields and release notes.
3. Run `npm ci --prefix runtime --ignore-scripts --no-audit --no-fund`.
4. Run `npm test`.
5. Run `npm run build:macos`.
6. Run `bash -n scripts/install-macos.sh "Install GrokRouter.command"`.
7. Test `Install GrokRouter.command` from a clean repository ZIP on an Apple silicon Mac.
8. Complete install → restore → reinstall with the exact build.
9. Create a genuinely new Bot and complete `docs/FRESH-BOT-ACCEPTANCE.md`.
10. Record the result in `docs/TEST-MATRIX.md`, commit, and wait for green CI.
11. After the version bump has merged to `main`, create the source tag: run **Tag source release** from the Actions tab with the exact version (for example `0.1.0-beta.46`), or put `[tag-release]` in the message of the commit that lands on `main` and the workflow tags that commit with the version in `package.json`. The workflow refuses to tag a commit whose `package.json`, runtime and Windows package versions, `scripts/install-macos.sh` source ref, or README pinned command disagree with the requested version, and refuses an existing tag. Pushing the tag by hand from a clone with tag-push rights is equivalent.

## Compatibility changes

If Grok Bot updates its app version, refusal is the expected behavior. Do not edit a version string merely to get past the gate. Inspect the untouched stock host, add an exact reviewed manifest, run every automated check, and repeat the complete live gate before claiming support.

Rotating 0.30.0 host builds behind the same app version are different: they are accepted by structural verification (`anchorVerifiedHosts` in `patch/manifests/0.30.0.json`) without a registry update. The exact signed list still runs first and remains the way to pin a specific reviewed build. Changing the size band, disabling the policy, or changing the foreign-router marker is an installer release, not a registry-only update.

## Updating the 0.30.0 signed host registry

Grok may rotate the Bot-computer host while the Mac app still reports 0.30.0. Since structural verification landed, a signed registry entry is optional for such hosts; add one when you want a specific build recorded as reviewed, or when a host is rejected structurally but proves stock on inspection.

1. Collect the complete safe report from beta.46. It must contain both SHA halves, byte count, cloud architecture, four anchor counts, and `PATCHDRYRUN=PASS`.
2. Inspect the untouched stock host through the approved read-only process. Never ask a reporter to post proprietary host source.
3. Add only the exact reviewed `{ "sha256", "bytes" }` pair to `compatibility/0.30.0-hosts.json`.
4. Sign it from the repository root:

   ```bash
   node scripts/sign-host-registry.mjs
   ```

   The private Ed25519 key lives outside the workspace at `~/.config/grokrouter/release/host-registry-private.pem` by default. Never print, copy, or commit it.
5. Run `npm test`, verify the signature and tamper-rejection tests, then complete the exact live repair and genuinely-new-Bot acceptance gate for that host before describing it as supported.
6. Commit and publish the registry JSON and signature together. Existing beta.46 installations will verify the signature before accepting the new exact entry.

Changing source anchors, the patch transformation, Grok Bot version, or signing key is not a registry-only update. It requires a new installer release and the full release gate.

## Optional signed distribution later

A signed and notarized ZIP can be added later without changing the source installer. That is a separate release path and requires a Developer ID Application certificate, notarization credentials, checksum verification, Gatekeeper acceptance, and a fresh-machine live gate. Until those conditions are met, do not publish an unsigned downloadable app or ask viewers to bypass Gatekeeper.
