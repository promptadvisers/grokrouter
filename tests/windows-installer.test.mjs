import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const main = await readFile(new URL("../installer-windows/main.cjs", import.meta.url), "utf8");
const preload = await readFile(new URL("../installer-windows/preload.cjs", import.meta.url), "utf8");
const renderer = await readFile(new URL("../installer-windows/renderer.js", import.meta.url), "utf8");
const html = await readFile(new URL("../installer-windows/index.html", import.meta.url), "utf8");
const build = await readFile(new URL("../scripts/build-windows-app.sh", import.meta.url), "utf8");
const payloadBuild = await readFile(new URL("../scripts/build-payload.sh", import.meta.url), "utf8");
const signing = await readFile(new URL("../scripts/sign-windows.ps1", import.meta.url), "utf8");
const setup = await readFile(new URL("../scripts/build-windows-setup.ps1", import.meta.url), "utf8");
const ciWorkflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const rootPackage = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const windowsPackage = JSON.parse(await readFile(new URL("../installer-windows/package.json", import.meta.url), "utf8"));

test("Windows installer version matches the shared release version", () => {
  assert.equal(windowsPackage.version, rootPackage.version);
});

test("Windows installer keeps the exact compatibility and local-only gates", () => {
  assert.match(main, /SUPPORTED_GROK_VERSION = "0\.30\.0"/);
  assert.match(main, /metadata\.Status !== "Valid"/);
  assert.match(main, /127\.0\.0\.1:\$\{CDP_PORT\}/);
  assert.match(main, /--remote-debugging-address=127\.0\.0\.1/);
  assert.doesNotMatch(main, /ROUTER_ALLOW_UNKNOWN_HOST/);
  assert.doesNotMatch(main, /shell:\s*true/);
});

test("Windows installer preserves verified terminal transport and restore", () => {
  for (const marker of [
    "GROKBOT_ROUTER_TRANSPORT_OK",
    "GROKBOT_ROUTER_INSTALL_OK",
    "GROKBOT_ROUTER_DOCTOR_DONE",
    "GROKBOT_ROUTER_REPAIR_OK",
    "GROKBOT_ROUTER_UNINSTALL_OK",
  ]) assert.match(main, new RegExp(marker));
  assert.match(main, /emitted % 8 === 0/);
  assert.match(main, /format: "jpeg"/);
  assert.match(main, /quality: 55/);
  assert.match(main, /sha256sum -c -/);
  assert.match(main, /typeRemoteCommandsResilient/);
  assert.match(main, /INSTALL_PHASES/);
  assert.match(main, /INSTALLFAILED/);
  assert.match(main, /const failurePayload = Buffer\.from/);
  assert.match(main, /printf %s \$\{failurePayload\} \| base64 -d; echo \$code/);
  // The typed command must never carry a plain-text sentinel that OCR could
  // read from the echoed command line before install.sh finishes.
  assert.doesNotMatch(main, /echo GROKROUTER_\$\{installAttempt\}_INSTALL_FAILED/);
  assert.match(main, /Copy safe diagnostics/);
  assert.match(main, /typeRemoteCommand\("clear"/);
});

test("Windows installer exposes safe recovery without retaining secrets", () => {
  assert.match(html, /id="recovery"/);
  assert.match(html, /Try installation again/);
  assert.match(html, /Copy safe diagnostics/);
  assert.match(html, /Open support issue/);
  assert.match(preload, /grokrouter:copy-diagnostics/);
  assert.match(preload, /grokrouter:open-support/);
  assert.match(main, /This report intentionally excludes credentials, conversations, and Bot files/);
  for (const diagnosticMarker of [
    "HOSTSHA",
    "HOSTBYTES",
    "CLOUDARCH",
    "ANCHORS",
    "PATCHDRYRUN",
    "SUPPORTEDVERSION",
  ]) assert.match(main, new RegExp(diagnosticMarker));
  assert.match(main, /Last installer phase/);
  assert.match(main, /\[REDACTED_KEY\]/);
  assert.doesNotMatch(renderer, /lastInstallPayload|savedInstallPayload/);
});

test("Windows installer registers native commands through Grok's workflow service", () => {
  assert.match(main, /native-workflow-registration\.js/);
  assert.match(main, /updateNativeWorkflows/);
  assert.match(main, /GROKROUTER_NATIVE_CONTROL/);
  assert.match(main, /user-owned slash commands were preserved/);
  assert.match(build, /grokrouter-native-skills/);
});

test("Windows restore explains delayed native command cleanup", () => {
  assert.match(main, /Waiting for Grok Bot's shared command library before stock restore/);
});

test("Windows renderer is isolated from Node and never stores the OpenRouter key", () => {
  assert.match(main, /contextIsolation: true/);
  assert.match(main, /nodeIntegration: false/);
  assert.match(main, /sandbox: true/);
  assert.match(preload, /contextBridge\.exposeInMainWorld/);
  assert.match(renderer, /elements\.openRouterKey\.value = ""/);
  assert.doesNotMatch(renderer, /localStorage|sessionStorage/);
  assert.match(html, /type="password"/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /Bring your own model\./);
  assert.doesNotMatch(html, /Bring your own brain\./);
  assert.match(html, /GROK BOT 0\.30\.0/);
  assert.doesNotMatch(html, /PRIVATE BETA/);
});

test("Windows packaging covers both official architectures", () => {
  assert.match(build, /"x64" && "\$ARCH" != "arm64"/);
  assert.match(build, /GrokRouter\.exe/);
  assert.match(build, /windows-\$\{ARCH\}\.zip/);
  assert.match(build, /data:image\/png;base64/);
  assert.match(build, /Windows mascot marker must occur exactly once/);
  assert.match(build, /windows-\$\{ARCH\}-setup\.exe/);
  assert.match(build, /ROUTER_WINDOWS_REQUIRE_SETUP/);
  assert.match(build, /command -v 7z/);
  assert.match(build, /COPYFILE_DISABLE=1 zip/);
  assert.match(build, /ditto -c -k --norsrc/);
  assert.doesNotMatch(build, /--sequesterRsrc/);
  assert.match(setup, /Inno Setup 6/);
  assert.match(setup, /"arm64" \} else \{ "x64compatible"/);
  assert.match(setup, /ArchitecturesAllowed=\$architectureExpression/);
  assert.match(setup, /ArchitecturesInstallIn64BitMode=\$architectureExpression/);
  assert.match(setup, /DefaultDirName=\{localappdata\}\\Programs\\GrokRouter/);
  assert.match(setup, /Name: "\{autoprograms\}\\GrokRouter"/);
  assert.match(setup, /Description: "Open GrokRouter"/);
  assert.match(build, /cd "\$PROJECT_ROOT" && node -p/);
  assert.match(payloadBuild, /cd "\$PROJECT_ROOT" && node -p/);
  assert.match(build, /command -v sha256sum/);
  assert.match(payloadBuild, /command -v sha256sum/);
  assert.match(build, /basename "\$ZIP_PATH"/);
  assert.match(payloadBuild, /basename "\$ARCHIVE"/);
  assert.match(payloadBuild, /cp -R "\$PROJECT_ROOT\/skills\/\."/);
  assert.doesNotMatch(build, /require\('\$PROJECT_ROOT\/package\.json'\)/);
  assert.doesNotMatch(payloadBuild, /require\('\$PROJECT_ROOT\/package\.json'\)/);
});

test("Windows release mode fails closed without Authenticode credentials", () => {
  assert.match(build, /ROUTER_WINDOWS_REQUIRE_SIGNING/);
  assert.match(build, /release mode requires ROUTER_WINDOWS_SIGN_PFX and ROUTER_WINDOWS_SIGN_PASSWORD/);
  assert.match(build, /ROUTER_WINDOWS_SIGN_PFX/);
  assert.match(signing, /signtool\.exe/);
  assert.match(signing, /\/tr "http:\/\/timestamp\.digicert\.com"/);
  assert.match(signing, /verify \/pa \/all/);
});

test("CI builds both Windows architectures and requires native setup artifacts", () => {
  assert.match(ciWorkflow, /windows-packages:/);
  assert.match(ciWorkflow, /runs-on: windows-2025/);
  assert.match(ciWorkflow, /ROUTER_WINDOWS_REQUIRE_SETUP: "1"/);
  assert.match(ciWorkflow, /npm run build:windows -- x64/);
  assert.match(ciWorkflow, /npm run build:windows -- arm64/);
  assert.match(ciWorkflow, /windows-x64-setup\.exe/);
  assert.match(ciWorkflow, /windows-arm64-setup\.exe/);
});
