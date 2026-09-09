# Source release procedure

GrokRouter is distributed as source. The Mac installer builds and ad-hoc signs the application locally. Windows artifacts remain a source preview until their native lifecycle is verified.

## Prepare the candidate

1. Start from current main on a separate branch. Preserve unrelated local changes.
2. Keep all package and lockfile versions, the runtime version, host error version, and `scripts/install-macos.sh` source ref consistent. Run `node scripts/verify-release.mjs`.
3. Keep the README's command on the **last published tag** while preparing the candidate. Do not advertise a tag that does not exist.
4. Run `npm ci --prefix runtime --ignore-scripts --no-audit --no-fund`, `npm test`, and `npm run build:macos`. Windows CI must build both architectures and their Setup artifacts.
5. Test the source installer from a clean candidate ZIP using a separate Applications test directory and `GROKROUTER_NO_OPEN=1`. Verify the actual built app version, signature, and archive checksum.

## Record live acceptance

Install the exact candidate on a supported Mac. Complete install → explicit verified stock restore → reinstall. Then create genuinely new Bots and complete every requirement in [FRESH-BOT-ACCEPTANCE.md](FRESH-BOT-ACCEPTANCE.md), including each enabled provider's actual tool results, returned-child result, no duplicate delivery, native slash discovery, deterministic controls, and per-Bot isolation. Also verify channel controls and independent request behavior.

Store redacted visible and runtime receipts in the verification record. Do not upload credentials, raw conversations unrelated to the tests, private Bot files, or proprietary host source.

`docs/release-acceptance.json` must identify the candidate version, supported Grok app versions, a passed result and evidence for every required gate, and the current digest from:

```bash
node scripts/verify-acceptance.mjs --digest
```

Then verify it:

```bash
node scripts/verify-acceptance.mjs
```

A changed production source invalidates the record. Rerun the affected live checks and record the complete candidate status before updating the digest; do not simply copy the new digest into an old record. A failed or missing provider capability is not a release pass. Earlier version evidence cannot substitute for the current candidate.

## Publish without a broken download interval

1. Commit the candidate, evidence, and release notes. Open a PR and wait for the required Mac and Windows checks and CodeQL analysis. Resolve findings before merging.
2. Merge the verified candidate. Main requires passing checks; do not bypass protection.
3. Dispatch **Tag source release** for the exact version on main, or use `[tag-release]` in the release commit message. The workflow reruns CI for that commit, checks the release versions and source-bound live record, then creates the annotated source tag. A published tag must never be moved. A repeated run is allowed only if the tag already names the identical commit.
4. Verify the tag resolves to the accepted commit, download its pinned installer and source archive, and verify the downloaded source. Existing Actions artifacts are not a substitute for this public-download check.
5. Update the README command to the newly verified tag in a documentation-only PR. Remove the maintenance-candidate notice and state only the versions and capabilities the release proved. This ordering prevents another missing-tag 404.
6. Publish source release notes linking the immutable tag and its known limitations. Do not attach an unsigned Mac binary as a beginner download.
7. Reconcile support issues with the verified fixes. Distinguish an original failure that is fixed from a subsequent unsupported-version report, and avoid claiming user confirmation that has not arrived.

## Exact host compatibility

The desktop app version and cloud-host hash are separate gates. A rotating cloud host must have an independently reviewed exact SHA-256 and byte count, every required anchor exactly once, a successful read-only transformation/syntax check, and live acceptance. A newer desktop app also needs its own inspected and tested compatibility entry. Never change only the version string to bypass a refusal.

Structural checking provides a safe diagnostic fingerprint. It does **not** establish stock provenance and cannot authorize patching or restoration. An unknown or foreign live host stays untouched even when an older trusted backup exists. Upgrade reconstruction is limited to known router transformations over an exactly trusted original. Explicit stock restoration is a separate user operation.

For a registry update:

1. Collect `HOSTSHA1`, `HOSTSHA2`, `HOSTBYTES`, `CLOUDARCH`, `ANCHORS`, and `PATCHDRYRUN`.
2. Inspect the untouched stock host through the local or Bot-computer development workflow. Keep proprietary source outside the repository and release payload.
3. Add only the independently reviewed exact pair to the appropriate compatibility file.
4. Sign with `node scripts/sign-host-registry.mjs`. The private key remains at `~/.config/grokrouter/release/host-registry-private.pem`; never print or copy it into the workspace.
5. Verify signature acceptance and tamper rejection, then the exact live repair and fresh-Bot gate before publishing support for that host.
6. Commit the registry and signature together. Existing clients verify the signature against the bundled public key.

Changing anchors, the transformation, supported desktop versions, or the signing key requires a new installer and complete acceptance, not merely a registry update.
