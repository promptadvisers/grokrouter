<p align="center"><img src="installer/Assets/grokbot-router-mascot-1024.png" width="176" alt="GrokRouter"></p>
<h1 align="center">GrokRouter</h1>
<p align="center"><strong>Choose the model for each Grok Bot.</strong><br>Use Codex SDK or OpenRouter from Grok Bot's existing chat.</p>

GrokRouter is an experimental, unofficial, reversible model router. Each Bot remembers its own provider and model. Grok Bot continues to own conversations, files, the computer, permissions, and any outer tools it supplies to the routed model.

> **Maintenance candidate:** This branch prepares `0.1.0-beta.47`. It is not released or live-verified yet. The pinned command below continues to reference the published beta.46 source until the replacement tag exists. beta.46 uses structural host acceptance; this candidate restores exact reviewed hash-and-size verification and repairs unsafe backup fallback.

## Compatibility

| Component | Current boundary |
| --- | --- |
| Grok Bot desktop | Published beta.46: **0.30.0**. Candidate beta.47: exact **0.30.0 and 0.36.0** gates, with live acceptance still pending |
| macOS | Apple silicon, macOS 12+, Apple Command Line Tools |
| Windows x64 / Arm64 | Source preview; CI packaging is separate from native installation verification |
| Codex SDK | Sign in with your existing Codex account in the Bot computer |
| OpenRouter | Your OpenRouter API key; provider usage is billed by OpenRouter |
| Computer and sub-agents | Available only when Grok offers the necessary schemas; see the [verification matrix](docs/TEST-MATRIX.md) for provider-specific evidence |

**Already updated Grok Bot?** The published beta.46 installer cannot support 0.36.0. This candidate adds a separately verified 0.36.0 desktop gate and signed host registry; it is still undergoing live acceptance. Other versions remain unsupported. Reports are tracked in [#1](https://github.com/promptadvisers/grokrouter/issues/1) and [#7](https://github.com/promptadvisers/grokrouter/issues/7). A successful source build does not establish compatibility with a newer Grok app or cloud host.

## Install on a Mac

1. Open the official Grok Bot **0.30.0** app from `/Applications`. Select a Bot, open its **Computer**, and leave it visible.
2. Run the published source installer in your **Mac's Terminal**:

   ```bash
   /usr/bin/curl --fail --silent --show-error --location https://raw.githubusercontent.com/promptadvisers/grokrouter/source-v0.1.0-beta.46/scripts/install-macos.sh --output /tmp/grokrouter-install.sh && /bin/bash /tmp/grokrouter-install.sh
   ```

   This downloads tagged source, builds and signs the app locally, installs it at `~/Applications/GrokRouter.app`, and opens it. It does not need `sudo`. If Apple Command Line Tools are missing, finish Apple's installation and repeat the command.
3. Choose **Codex SDK**, **OpenRouter**, or both. Choose the default provider for new Bots. If using OpenRouter, enter its complete key in the installer; the installer hands it to Grok's protected Secrets store and clears the field.
4. Click **Install Router**. Wait for a successful installation receipt. If using Codex, choose **Codex sign-in** and complete the sign-in shown in the Bot terminal.
5. Create a **brand-new Bot after installation**. Type these commands manually into its normal chat, one at a time:

   ```text
   /router doctor
   /provider
   ```

   In-chat Doctor must identify the installed router and report runtime and credential health. Use the desktop **Check health** action to verify the live host adapter and stock backup. `/provider` must name the provider and model you selected. Send a normal message and verify it produces one answer.

The slash-suggestion menu is a convenience. If an entry is missing, type the complete command manually; a menu entry alone does not prove routing works.

The ZIP alternative is **Code → Download ZIP → Install GrokRouter.command**. A ZIP from a development branch contains that branch's candidate, so use the tagged source for a published version. If macOS asks whether to open the command, Control-click it and choose **Open**. Do not disable Gatekeeper.

## Choose a model in chat

| Command | Result |
| --- | --- |
| `/provider` | Show this Bot's provider and model |
| `/provider codex` | Switch this Bot to Codex SDK |
| `/provider openrouter` | Switch this Bot to OpenRouter |
| `/models` | List configured models and switching instructions |
| `/model vendor/model` or `/models vendor/model` | Select a model explicitly |
| A listed `vendor/model` ID by itself | Select that model |
| `/reasoning low`, `/reasoning medium`, `/reasoning high` | Change a supported reasoning setting |
| `/doctor` or `/router doctor` | Check routing health |
| `/router reset` | Reset the Bot's provider thread while retaining its Grok transcript |
| `/router help` | Show exact supported controls |

In a channel, address a Bot directly, for example `@Research Bot /provider`. Each Bot owns its model state. A control receipt suppresses only follow-on work associated with that same host request; it must not suppress an unrelated conversation. Exact-candidate channel verification is part of the release gate.

## Recovery

Use the **GrokRouter desktop app** for installation, health checks, repair, and restoration. Do not ask a Grok conversation to install or patch its own host.

| Symptom | Next step |
| --- | --- |
| Unsupported app version | Stop and check the compatibility table. Reinstalling the same router cannot add version support. |
| Unknown host hash or wrong byte count | Copy safe diagnostics. The candidate leaves the live host untouched, even if an old backup exists. A maintainer must review an exact host entry. |
| Prior OpenGrok or another router | Do not layer routers. Use that router's documented removal or explicit verified stock restoration before attempting GrokRouter installation. |
| Runtime version looks correct but adapter is stock or unknown | Runtime files and the live adapter are separate. Run desktop **Check health**. Repair succeeds only for a reviewed stock host or an exactly reconstructed supported router upgrade. |
| Modified router with a valid stock backup | Automatic repair refuses it. Use explicit **Restore stock** if you intend to replace the live host, then install again on a supported version. |
| No verified backup | Stop. Do not copy an arbitrary backup or force installation. Include the complete safe fingerprint in a support issue. |
| Dependency download failure | Check the Bot computer's network, then retry from the desktop installer. |
| Grok answers `/provider` conversationally | Interception is not working. Use desktop health checks and safe diagnostics; the model's explanation is not a router receipt. |
| Missing slash-menu entries | Type the command manually. Repair reconciles GrokRouter-owned entries while preserving conflicting user commands. |
| Windows preview failure | Include the exact CI artifact and Windows architecture; do not run the Mac install command. |

**Restore stock** is an explicit operation. It copies an exactly reviewed original back to the live host and disables the repair watchdog. The runtime and recoverable backups remain on the Bot computer. **Repair** is different: it must never replace an unknown host with an older backup just because that backup exists.

For [installation support](https://github.com/promptadvisers/grokrouter/issues/new?template=installation-failure.yml), include your GrokRouter version, Grok Bot version, platform, prior-router history, and **Copy safe diagnostics** output. Keep `HOSTSHA1`, `HOSTSHA2`, `HOSTBYTES`, `ANCHORS`, `PATCHDRYRUN`, and `HOSTTRUST`. Never post an API key, sign-in code, private conversation, or Grok's host source.

## What verification means

The candidate requires an exact reviewed **SHA-256 and byte count**, then checks every source anchor and syntax-checks the transformed file. Entries come from the bundled manifest or an Ed25519-signed compatibility registry. Structural similarity and a successful syntax check are diagnostic evidence; they do not authenticate an unknown file as stock vendor code.

Router upgrades reconstruct the expected existing adapter from a trusted original. A marker string alone is insufficient. Doctor verifies the live adapter against that reconstruction and reports stock-backup health separately.

The selected model can request only the outer tools Grok supplies for that turn. Grok still applies its permissions and performs those actions. A screenshot or sub-agent bridge in the source is not proof that every provider has passed those workflows. Historical and current results are kept in [TEST-MATRIX.md](docs/TEST-MATRIX.md).

Provider credentials stay out of repository files, Bot state, and diagnostic logs. Routed conversation content is sent to the provider you choose. Read [SECURITY.md](SECURITY.md) and [HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md) for the data boundary.

## Development and releases

```bash
npm ci --prefix runtime --ignore-scripts --no-audit --no-fund
npm test
npm run build:macos
```

Windows developers can use `npm run build:windows -- x64` or `npm run build:windows -- arm64`. Native Windows CI builds ZIP and Setup artifacts; source-preview status remains until native acceptance is recorded.

A release requires passing tests/builds and the complete [fresh-Bot procedure](docs/FRESH-BOT-ACCEPTANCE.md) on the exact candidate. The tag workflow reruns CI and checks the versioned, source-bound [acceptance record](docs/release-acceptance.json). It refuses a pending or stale record. The README's install command advances only after the new immutable tag is downloadable, preventing another missing-tag 404.

- [Architecture](docs/ARCHITECTURE.md)
- [Release procedure](docs/RELEASE.md)
- [Verification matrix](docs/TEST-MATRIX.md)
- [Release notes](RELEASE_NOTES.md)
- [Coding-agent instructions](AGENTS.md)

GrokRouter contains its own adapter and provider runtime. It does not distribute Grok Bot's proprietary host source or replace the official desktop app.
