const { app, BrowserWindow, clipboard, ipcMain, shell } = require("electron");
const { spawn, execFile } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { promisify } = require("node:util");
const WebSocket = require("ws");
const { createWorker } = require("tesseract.js");

const execFileAsync = promisify(execFile);
const SUPPORTED_GROK_VERSION = "0.30.0";
const CDP_PORT = 19222;
const CODEX_MODELS = new Set(["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]);
const OPENROUTER_MODELS = new Set([
  "anthropic/claude-sonnet-4.6",
  "openai/gpt-5.6-sol",
  "openai/gpt-5.6-terra",
  "openai/gpt-5.6-luna",
  "google/gemini-3.1-pro-preview",
  "google/gemini-3.1-flash-lite",
]);

let mainWindow = null;
let busy = false;
let diagnosticsLaunched = false;
let ocrWorkerPromise = null;
let lastDiagnosticReport = "";

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function emit(type, value) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("grokrouter:event", type === "log" ? { type, message: value } : { type, ...value });
}

function log(message) {
  emit("log", message);
}

function setStatus(isBusy, message) {
  emit("status", { busy: isBusy, message });
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

const INSTALL_PHASES = Object.freeze([
  ["PREFLIGHT", "Step 3 of 6 · Checking the Bot computer…", "The Bot computer is missing a required tool or has an unsupported runtime."],
  ["VALIDATEPAYLOAD", "Step 3 of 6 · Verifying the installer files…", "The installer files did not pass their integrity check."],
  ["PREPARERUNTIME", "Step 3 of 6 · Preparing a safe installation…", "The Bot computer could not prepare a temporary installation."],
  ["INSTALLDEPENDENCIES", "Step 4 of 6 · Preparing pinned dependencies…", "The Bot computer could not prepare the pinned dependencies. On a first Codex install, check its internet connection, then try again."],
  ["ACTIVATERUNTIME", "Step 5 of 6 · Activating GrokRouter…", "GrokRouter could not activate the prepared runtime."],
  ["APPLYADAPTER", "Step 5 of 6 · Applying the version-gated router…", "This Bot computer's Grok host did not pass GrokRouter's stock-host checks, so nothing was changed. If Restore Stock Grok Bot is available, run it first, then try again."],
  ["VERIFYINSTALL", "Step 6 of 6 · Verifying the installation…", "The installed router did not pass its final health check."],
  ["COMPLETE", "Step 6 of 6 · Reconnecting Grok Bot…", "GrokRouter finished but Grok Bot did not reconnect cleanly."],
]);

const INTERESTING_DIAGNOSTIC_WORDS = Object.freeze([
  "ERROR",
  "FAILED",
  "REQUIRED",
  "MISSING",
  "NPM",
  "GROKROUTER",
  "HOSTSHA",
  "HOSTBYTES",
  "CLOUDARCH",
  "ANCHORS",
  "PATCHDRYRUN",
  "HOSTTRUST",
  "SUPPORTEDVERSION",
  "ROUTERMARKER",
  "STOCKBACKUP",
]);

function redactedDiagnosticExcerpt(text) {
  const selected = String(text || "").split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && INTERESTING_DIAGNOSTIC_WORDS.some((word) => line.toUpperCase().includes(word)))
    .slice(-10)
    .map((line) => line.slice(0, 240))
    .join("\n");
  return (selected || "No safe terminal excerpt was available.")
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/gi, "[REDACTED_KEY]")
    .replace(/sk-[A-Za-z0-9_-]{12,}/gi, "[REDACTED_KEY]");
}

function makeDiagnosticReport(failure, terminalText = "", lastInstallerPhase = "unknown") {
  return [
    "GrokRouter safe diagnostic report",
    `Installer: ${app.getVersion()}`,
    `Supported Grok Bot: ${SUPPORTED_GROK_VERSION}`,
    `Windows: ${process.getSystemVersion()}`,
    `Architecture: ${process.arch}`,
    `Last installer phase: ${lastInstallerPhase}`,
    `Failure: ${failure}`,
    "Terminal excerpt:",
    redactedDiagnosticExcerpt(terminalText),
    "",
    "This report intentionally excludes credentials, conversations, and Bot files.",
  ].join("\n");
}

function requestJSON(url, timeoutMilliseconds = 3_000) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: timeoutMilliseconds }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        if (response.statusCode !== 200) return reject(new Error(`Local diagnostic endpoint returned HTTP ${response.statusCode}.`));
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch {
          reject(new Error("Local diagnostic endpoint returned invalid JSON."));
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error("Local diagnostic endpoint timed out.")));
    request.on("error", reject);
  });
}

class CDPClient {
  constructor(url) {
    this.socket = new WebSocket(url, { maxPayload: 32 * 1024 * 1024 });
    this.nextID = 1;
    this.pending = new Map();
    this.pendingNested = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.socket.once("open", resolve);
      this.socket.once("error", reject);
    });
    this.socket.on("message", (raw) => this.route(raw));
    this.socket.on("close", () => this.rejectAll(new Error("Grok Bot closed its local diagnostic connection.")));
    this.socket.on("error", (error) => this.rejectAll(error));
  }

  route(raw) {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }
    if (message.method === "Target.receivedMessageFromTarget") {
      const sessionID = message.params?.sessionId;
      try {
        const nested = JSON.parse(message.params?.message || "{}");
        const pending = this.pendingNested.get(`${sessionID}:${nested.id}`);
        if (pending) {
          this.pendingNested.delete(`${sessionID}:${nested.id}`);
          clearTimeout(pending.timer);
          pending.resolve(nested);
        }
      } catch { /* ignore unrelated target traffic */ }
      return;
    }
    if (Number.isInteger(message.id) && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      pending.resolve(message);
    }
  }

  rejectAll(error) {
    for (const pending of [...this.pending.values(), ...this.pendingNested.values()]) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.pendingNested.clear();
  }

  responsePromise(map, key, timeoutMessage) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        map.delete(key);
        reject(new Error(timeoutMessage));
      }, 30_000);
      map.set(key, { resolve, reject, timer });
    });
  }

  result(message) {
    if (message.error) throw new Error(`DevTools error: ${message.error.message || JSON.stringify(message.error)}`);
    return message.result || {};
  }

  async call(method, params = {}, sessionID = null) {
    await this.ready;
    if (sessionID) return this.callNested(method, params, sessionID);
    const id = this.nextID++;
    const response = this.responsePromise(this.pending, id, `DevTools timed out while running ${method}.`);
    this.socket.send(JSON.stringify({ id, method, params }));
    return this.result(await response);
  }

  async callNested(method, params, sessionID) {
    const nestedID = this.nextID++;
    const outerID = this.nextID++;
    const nestedResponse = this.responsePromise(
      this.pendingNested,
      `${sessionID}:${nestedID}`,
      `Grok Bot's computer timed out while running ${method}.`,
    );
    const outerResponse = this.responsePromise(this.pending, outerID, "DevTools did not accept the nested command.");
    this.socket.send(JSON.stringify({
      id: outerID,
      method: "Target.sendMessageToTarget",
      params: { sessionId: sessionID, message: JSON.stringify({ id: nestedID, method, params }) },
    }));
    this.result(await outerResponse);
    return this.result(await nestedResponse);
  }

  close() {
    this.socket.close();
  }
}

function knownGrokPaths() {
  const candidates = [];
  const roots = [
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs"),
    process.env.LOCALAPPDATA,
    process.env.ProgramW6432,
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
  ].filter(Boolean);
  for (const root of roots) {
    candidates.push(path.join(root, "Grok Bot", "Grok Bot.exe"));
    candidates.push(path.join(root, "GrokBot", "Grok Bot.exe"));
  }
  return [...new Set(candidates)];
}

async function locateAndValidateGrok() {
  if (process.platform !== "win32") throw new Error("This GrokRouter build runs only on Windows.");
  const executable = knownGrokPaths().find((candidate) => fs.existsSync(candidate));
  if (!executable) throw new Error("Install the official Grok Bot app from the Windows Start-menu installer first.");

  const escaped = executable.replaceAll("'", "''");
  const command = [
    `$file = Get-Item -LiteralPath '${escaped}'`,
    `$signature = Get-AuthenticodeSignature -LiteralPath '${escaped}'`,
    `[pscustomobject]@{Version=$file.VersionInfo.ProductVersion;Status=[string]$signature.Status} | ConvertTo-Json -Compress`,
  ].join("; ");
  let metadata;
  try {
    const { stdout } = await execFileAsync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command], { windowsHide: true });
    metadata = JSON.parse(stdout.trim());
  } catch {
    throw new Error("GrokRouter could not verify the installed Grok Bot Windows app.");
  }
  if (metadata.Status !== "Valid") throw new Error("The installed Grok Bot executable does not have a valid Windows signature. Nothing was changed.");
  const version = String(metadata.Version || "").trim();
  if (version !== SUPPORTED_GROK_VERSION && version !== `${SUPPORTED_GROK_VERSION}.0`) {
    throw new Error(`Grok Bot ${version || "unknown"} is not supported. This beta is pinned to ${SUPPORTED_GROK_VERSION} and will not patch an unknown build.`);
  }
  return executable;
}

async function stopGrok() {
  const graceful = "Get-Process -Name 'Grok Bot' -ErrorAction SilentlyContinue | ForEach-Object { [void]$_.CloseMainWindow() }";
  await execFileAsync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", graceful], { windowsHide: true }).catch(() => {});
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const { stdout = "" } = await execFileAsync("tasklist.exe", ["/FI", "IMAGENAME eq Grok Bot.exe", "/NH"], { windowsHide: true }).catch(() => ({ stdout: "" }));
    if (!stdout.toLowerCase().includes("grok bot.exe")) return;
    await delay(125);
  }
  await execFileAsync("taskkill.exe", ["/F", "/T", "/IM", "Grok Bot.exe"], { windowsHide: true }).catch(() => {});
  await delay(500);
}

function launchDetached(executable, args = []) {
  const child = spawn(executable, args, { detached: true, stdio: "ignore", windowsHide: false });
  child.unref();
}

async function browserWebSocketURL() {
  const value = await requestJSON(`http://127.0.0.1:${CDP_PORT}/json/version`);
  if (typeof value.webSocketDebuggerUrl !== "string") throw new Error("Grok Bot's diagnostic endpoint is unavailable.");
  return value.webSocketDebuggerUrl;
}

async function relaunchWithDiagnostics(executable) {
  log(`Verified signed Grok Bot ${SUPPORTED_GROK_VERSION}. Restarting with a local diagnostic port…`);
  await stopGrok();
  if (await browserWebSocketURL().then(() => true).catch(() => false)) {
    throw new Error(`Local port ${CDP_PORT} is already in use. Close the application using it and retry.`);
  }
  launchDetached(executable, [`--remote-debugging-address=127.0.0.1`, `--remote-debugging-port=${CDP_PORT}`]);
  diagnosticsLaunched = true;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await browserWebSocketURL().then(() => true).catch(() => false)) return;
    await delay(250);
  }
  throw new Error("Grok Bot's local diagnostic connection did not become ready.");
}

async function relaunchNormallyIfNeeded(executable) {
  const endpointOpen = await browserWebSocketURL().then(() => true).catch(() => false);
  if (!diagnosticsLaunched && !endpointOpen) return;
  log("Closing the temporary diagnostic port and reopening Grok Bot normally…");
  await stopGrok();
  try { launchDetached(executable); } catch { log("Grok Bot did not reopen automatically. Open it normally from the Start menu."); }
  diagnosticsLaunched = false;
}

async function targets(client) {
  const result = await client.call("Target.getTargets");
  return (result.targetInfos || []).map((item) => ({
    id: item.targetId,
    type: item.type || "",
    title: item.title || "",
    url: item.url || "",
  }));
}

async function attach(client, targetID) {
  const result = await client.call("Target.attachToTarget", { targetId: targetID, flatten: false });
  if (!result.sessionId) throw new Error("Could not attach to Grok Bot's computer session.");
  return result.sessionId;
}

async function mainPageSession(client) {
  const page = (await targets(client)).find((item) => item.type === "page" && item.url.includes("/renderer/index.html"));
  if (!page) throw new Error("Grok Bot's main window was not found.");
  return attach(client, page.id);
}

async function evaluate(client, sessionID, expression) {
  const response = await client.call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, sessionID);
  if (response.exceptionDetails) throw new Error("Grok Bot rejected a local installer command.");
  return response;
}

async function saveOpenRouterKey(key, client, pageSession) {
  if (!key) return;
  log("Saving OPENROUTER_API_KEY through Grok Bot's protected Secrets store…");
  const response = await evaluate(
    client,
    pageSession,
    `window.desktop.secrets.upsert({OPENROUTER_API_KEY:${JSON.stringify(key)}}).then(()=>({saved:true}))`,
  );
  if (response.result?.value?.saved !== true) throw new Error("Grok Bot did not confirm that its protected secret was saved.");
}

async function tryOpenComputer(client, pageSession) {
  const script = `(() => { const buttons = [...document.querySelectorAll('button')]; const button = buttons.find((item) => /open computer/i.test(item.textContent || item.getAttribute('aria-label') || '')); if (!button) return false; button.click(); return true; })()`;
  await evaluate(client, pageSession, script).catch(() => {});
}

async function waitForVNC(client, pageSession) {
  setStatus(true, "Step 2 of 6 · Connecting to a Bot computer…");
  log("Waiting for a Bot computer. If Grok Bot does not open it automatically, select any Bot and click Open computer…");
  for (let index = 0; index < 360; index += 1) {
    const vnc = (await targets(client)).find((item) => item.type === "webview" && item.url.includes("/vnc.html"));
    if (vnc) return { targetID: vnc.id, sessionID: await attach(client, vnc.id) };
    if (index % 20 === 0) await tryOpenComputer(client, pageSession);
    if (index === 20) {
      setStatus(true, "Action needed · In Grok Bot, select any Bot and click Open computer.");
      log("ACTION NEEDED: In Grok Bot, select any Bot and click Open computer. GrokRouter will continue automatically.");
    }
    await delay(500);
  }
  throw new Error("No Bot computer appeared. Open one in Grok Bot and try again.");
}

function keySym(virtualKey, key) {
  if (virtualKey === 13) return 0xff0d;
  if (virtualKey === 17) return 0xffe3;
  if (virtualKey === 18) return 0xffe9;
  if ([...key].length === 1) return key.codePointAt(0);
  throw new Error("The Bot computer received an unsupported key event.");
}

async function keyEvent(client, sessionID, type, key, code, virtualKey) {
  const expression = `(async () => { const UI = (await import('./app/ui.js')).default; if (!UI?.rfb) return false; UI.rfb.sendKey(${keySym(virtualKey, key)}, ${JSON.stringify(code)}, ${type === "keyDown"}); return true; })()`;
  const response = await evaluate(client, sessionID, expression);
  if (response.result?.value !== true) throw new Error("The Bot computer did not accept a noVNC key event.");
}

async function clickRemoteCanvas(client, sessionID, x, y) {
  const expression = `(async () => { const UI = (await import('./app/ui.js')).default; const canvas = document.querySelector('#noVNC_container canvas') || document.querySelector('canvas'); if (!UI?.rfb || !canvas) return false; const rect = canvas.getBoundingClientRect(); const localX = ${x} - rect.left; const localY = ${y} - rect.top; UI.rfb._handleMouseButton(localX, localY, 1); UI.rfb._handleMouseButton(localX, localY, 0); return true; })()`;
  const response = await evaluate(client, sessionID, expression);
  if (response.result?.value !== true) throw new Error("The Bot computer did not accept a noVNC pointer event.");
}

async function clickRemoteDesktop(client, sessionID, remoteX, remoteY) {
  const expression = `(() => { const canvas = document.getElementById('noVNC_canvas') || document.querySelector('canvas'); const surface = canvas || document.getElementById('noVNC_container') || document.documentElement; const rect = surface.getBoundingClientRect(); const framebufferWidth = Number(canvas?.width) || 1280; const framebufferHeight = Number(canvas?.height) || 800; return JSON.stringify({x: rect.left + (${remoteX} / framebufferWidth) * rect.width, y: rect.top + (${remoteY} / framebufferHeight) * rect.height}); })()`;
  const response = await evaluate(client, sessionID, expression);
  let point;
  try { point = JSON.parse(response.result?.value); } catch { throw new Error("The Bot computer canvas could not be mapped for keyboard input."); }
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) throw new Error("The Bot computer canvas could not be mapped for keyboard input.");
  await clickRemoteCanvas(client, sessionID, Math.round(point.x), Math.round(point.y));
}

async function openTerminal(client, sessionID) {
  await clickRemoteDesktop(client, sessionID, 400, 400);
  await evaluate(client, sessionID, "document.getElementById('noVNC_keyboardinput')?.focus(); true").catch(() => {});
  await keyEvent(client, sessionID, "keyDown", "Control", "ControlLeft", 17);
  await keyEvent(client, sessionID, "keyDown", "Alt", "AltLeft", 18);
  await keyEvent(client, sessionID, "keyDown", "t", "KeyT", 84);
  await keyEvent(client, sessionID, "keyUp", "t", "KeyT", 84);
  await keyEvent(client, sessionID, "keyUp", "Alt", "AltLeft", 18);
  await keyEvent(client, sessionID, "keyUp", "Control", "ControlLeft", 17);
  await delay(1_200);
  await focusTerminal(client, sessionID);
}

function languagePath() {
  return path.dirname(require.resolve("@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz"));
}

async function ocrWorker() {
  if (!ocrWorkerPromise) {
    const cachePath = path.join(app.getPath("userData"), "ocr-cache");
    fs.mkdirSync(cachePath, { recursive: true });
    ocrWorkerPromise = createWorker("eng", 1, { langPath: languagePath(), cachePath });
  }
  return ocrWorkerPromise;
}

async function screenshotText(client, sessionID) {
  const result = await client.call("Page.captureScreenshot", {
    format: "jpeg",
    quality: 55,
    fromSurface: true,
    optimizeForSpeed: true,
  }, sessionID);
  if (typeof result.data !== "string") return "";
  const worker = await ocrWorker();
  const recognized = await worker.recognize(Buffer.from(result.data, "base64"));
  return recognized.data?.text || "";
}

// Letters and digits that OCR rarely confuses with each other. Excluded on
// purpose: 0/O/D/Q, 1/I/L, 2/Z, 5/S, 6/G, 7/T, 8/B. Hex attempt IDs such as
// 7E0DBDB8 have come back from real Bot terminals as 7EODBDB8 / TEODBDB8.
const OCR_SAFE_ALPHABET = "ACEFHJKMNPRUVWXY349";
const OCR_FOLDS = Object.freeze({ 0: "O", 1: "I", 5: "S", 8: "B", 2: "Z", 6: "G" });

function makeInstallAttemptID(length = 8) {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (byte) => OCR_SAFE_ALPHABET[byte % OCR_SAFE_ALPHABET.length]).join("");
}

// Fold the digit/letter pairs OCR confuses most so marker words such as
// INSTALLFAILED still match when a screenshot reads 1NSTALLFA1LED. Attempt IDs
// and sentinels never contain the digits folded here.
function normalizeOCR(value) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/[015826]/g, (digit) => OCR_FOLDS[digit]);
}

async function waitForTerminalPrompt(client, sessionID, attempts = 8) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const normalized = normalizeOCR(await screenshotText(client, sessionID).catch(() => ""));
    if (normalized.includes("TERMINAL") && (normalized.includes("WORKSPACE") || normalized.includes("BOXCURSOR"))) return true;
    await delay(500);
  }
  return false;
}

async function focusTerminal(client, sessionID) {
  await clickRemoteDesktop(client, sessionID, 400, 250);
  await evaluate(client, sessionID, "document.getElementById('noVNC_keyboardinput')?.focus(); true").catch(() => {});
}

async function ensureTerminal(client, sessionID) {
  if (await waitForTerminalPrompt(client, sessionID, 2)) return focusTerminal(client, sessionID);
  await openTerminal(client, sessionID);
  if (await waitForTerminalPrompt(client, sessionID, 24)) return focusTerminal(client, sessionID);
  log("The terminal shortcut missed. Opening Terminal from the Bot desktop dock…");
  await clickRemoteDesktop(client, sessionID, 700, 768);
  await delay(1_200);
  await focusTerminal(client, sessionID);
  if (!(await waitForTerminalPrompt(client, sessionID, 24))) {
    throw new Error("The Bot terminal did not open from its shortcut or dock. Open the Bot computer and retry.");
  }
}

async function resetRemotePrompt(client, sessionID) {
  await keyEvent(client, sessionID, "keyDown", "Control", "ControlLeft", 17);
  await keyEvent(client, sessionID, "keyDown", "c", "KeyC", 67);
  await keyEvent(client, sessionID, "keyUp", "c", "KeyC", 67);
  await keyEvent(client, sessionID, "keyUp", "Control", "ControlLeft", 17);
  await delay(200);
  await typeRemoteCommand("clear", client, sessionID);
  await delay(200);
}

async function typeRemoteCommand(command, client, sessionID) {
  for (let index = 0; index < command.length; index += 4_000) {
    const chunk = command.slice(index, index + 4_000);
    const expression = `(async () => { const UI = (await import('./app/ui.js')).default; if (!UI?.rfb) return false; let emitted = 0; for (const character of ${JSON.stringify(chunk)}) { UI.rfb.sendKey(character.codePointAt(0)); emitted += 1; if (emitted % 8 === 0) await new Promise(resolve => setTimeout(resolve, 4)); } await new Promise(resolve => setTimeout(resolve, 20)); return true; })()`;
    const response = await evaluate(client, sessionID, expression);
    if (response.result?.value !== true) throw new Error("The Bot computer did not accept noVNC text input.");
  }
  await keyEvent(client, sessionID, "keyDown", "Enter", "Enter", 13);
  await keyEvent(client, sessionID, "keyUp", "Enter", "Enter", 13);
}

async function typeRemoteCommandsResilient(commands, client, pageSession) {
  if (!commands.length) throw new Error("The installer generated no remote commands.");
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const vnc = await waitForVNC(client, pageSession);
      await ensureTerminal(client, vnc.sessionID);
      await resetRemotePrompt(client, vnc.sessionID);
      for (const command of commands) {
        await typeRemoteCommand(command, client, vnc.sessionID);
        await delay(150);
      }
      return vnc;
    } catch (error) {
      lastError = error;
      if (attempt < 3) log(`The Bot computer changed during transfer. Retrying safely (${attempt + 1}/3)…`);
    }
  }
  throw lastError || new Error("The Bot terminal did not acknowledge the install command.");
}

async function waitForSentinel(sentinel, client, initialVNC, timeoutSeconds, installAttempt = null) {
  const expected = normalizeOCR(sentinel);
  let activeTargetID = initialVNC.targetID;
  let activeSession = initialVNC.sessionID;
  let reportedReconnect = false;
  let observedPhase = -1;
  let consecutiveGenericErrors = 0;
  let lastTerminalText = "";
  // The timeout is measured from the last visible progress, not from the
  // start. A slow first-time Codex dependency download still completes as
  // long as the Bot computer keeps reporting new phases.
  let deadline = Date.now() + timeoutSeconds * 1_000;
  while (Date.now() < deadline) {
    await delay(3_000);
    const current = (await targets(client).catch(() => [])).find((item) => item.type === "webview" && item.url.includes("/vnc.html"));
    if (current && current.id !== activeTargetID) {
      activeTargetID = current.id;
      activeSession = await attach(client, current.id);
      if (!reportedReconnect) { log("The Bot computer reconnected. Continuing completion verification…"); reportedReconnect = true; }
    }
    const terminalText = await screenshotText(client, activeSession).catch(() => "");
    lastTerminalText = terminalText || lastTerminalText;
    const normalized = normalizeOCR(terminalText);
    if (normalized.includes(expected)) return;
    if (installAttempt) {
      const attemptPrefix = `GROKROUTER${installAttempt}`;
      INSTALL_PHASES.forEach((phase, index) => {
        if (index > observedPhase && normalized.includes(`${attemptPrefix}PHASE${phase[0]}`)) {
          observedPhase = index;
          deadline = Date.now() + timeoutSeconds * 1_000;
          setStatus(true, phase[1]);
          log(phase[1]);
        }
      });
      // Match the failure marker on its OCR-stable prefix; the full word
      // FAILED has been read as FATLED from real Bot terminals.
      if (normalized.includes(`${attemptPrefix}INSTALLFA`)) {
        const phase = [...INSTALL_PHASES].reverse().find((candidate) => (
          normalized.includes(`${attemptPrefix}INSTALLFAILED${candidate[0]}`) || normalized.includes(`INSTALLFAILED${candidate[0]}`)
        )) || INSTALL_PHASES[observedPhase] || null;
        const message = phase?.[2] || "The Bot computer stopped before installation completed.";
        const phaseName = phase?.[0] || INSTALL_PHASES[observedPhase]?.[0] || "unknown";
        lastDiagnosticReport = makeDiagnosticReport(message, terminalText, phaseName);
        throw new Error(`${message} Copy safe diagnostics for the exact non-secret details.`);
      }
    }
    if (normalized.includes("ERROR") && !normalized.includes("NOERROR")) {
      consecutiveGenericErrors += 1;
      if (consecutiveGenericErrors >= 2) {
        const message = "The Bot terminal stopped before it reported completion.";
        const phaseName = INSTALL_PHASES[observedPhase]?.[0] || "unknown";
        lastDiagnosticReport = makeDiagnosticReport(message, terminalText, phaseName);
        throw new Error(`${message} Copy safe diagnostics, then try again.`);
      }
    } else {
      consecutiveGenericErrors = 0;
    }
  }
  const message = "The Bot terminal did not report completion before the timeout.";
  const phaseName = INSTALL_PHASES[observedPhase]?.[0] || "unknown";
  lastDiagnosticReport = makeDiagnosticReport(message, lastTerminalText, phaseName);
  throw new Error(`${message} Copy safe diagnostics, then try again.`);
}

function payloadPath() {
  const candidate = path.join(app.getAppPath(), "assets", "grokbot-router-payload.tgz");
  if (!fs.existsSync(candidate)) throw new Error("Installer payload is missing.");
  return candidate;
}

const NATIVE_WORKFLOW_NAMES = Object.freeze(["provider", "models", "model", "reasoning", "router", "doctor"]);

function nativeWorkflowDefinitions() {
  const directory = path.join(app.getAppPath(), "assets", "grokrouter-native-skills");
  return NATIVE_WORKFLOW_NAMES.map((name) => {
    const markdown = fs.readFileSync(path.join(directory, name, "SKILL.md"), "utf8");
    const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!frontmatter) throw new Error(`Native command /${name} has invalid frontmatter.`);
    const description = frontmatter[1].match(/^description:\s*(.+)$/m)?.[1]?.trim();
    const body = frontmatter[2].trim();
    if (!description || !body.includes(`GROKROUTER_NATIVE_CONTROL: ${name.toUpperCase()}`)) {
      throw new Error(`Native command /${name} is missing its ownership marker.`);
    }
    return { name, description, body, markdown };
  });
}

function nativeWorkflowExpression(operation) {
  const scriptPath = path.join(app.getAppPath(), "assets", "native-workflow-registration.js");
  let script = fs.readFileSync(scriptPath, "utf8");
  for (const [marker, value] of [
    ["__GROKROUTER_NATIVE_SKILLS__", nativeWorkflowDefinitions()],
    ["__GROKROUTER_NATIVE_OPERATION__", operation],
  ]) {
    if (script.split(marker).length !== 2) throw new Error(`Native command bridge marker ${marker} is invalid.`);
    script = script.replace(marker, JSON.stringify(value));
  }
  return script;
}

async function updateNativeWorkflows(client, pageSession, operation = "sync") {
  const response = await evaluate(client, pageSession, nativeWorkflowExpression(operation));
  const encoded = response.result?.value;
  if (typeof encoded !== "string") throw new Error("Grok Bot did not return a native command registration receipt.");
  const stats = JSON.parse(encoded);
  if (stats.unavailable) log(`${stats.unavailable} Bot or channel workflow stores were unavailable; run Repair after opening them.`);
  if (stats.conflicts) log(`${stats.conflicts} user-owned slash commands were preserved because their names conflict.`);
  if (operation === "remove") {
    log(`Removed ${stats.removed} GrokRouter command entries from Grok Bot's shared workflow library.`);
  } else {
    log(`Verified ${stats.installed + stats.updated + (stats.unchanged || 0)} unique GrokRouter commands for ${stats.bots} Bots and channels.`);
    if (stats.removed) log(`Removed ${stats.removed} duplicate command entries left by an earlier beta.`);
  }
  return stats;
}

function validatedInstallOptions(raw) {
  const providers = Array.isArray(raw.providers) ? [...new Set(raw.providers)] : [];
  if (!providers.length || providers.some((item) => item !== "codex" && item !== "openrouter")) throw new Error("Choose Codex SDK, OpenRouter, or both.");
  if (!providers.includes(raw.defaultProvider)) throw new Error("The default provider must be enabled.");
  if (!CODEX_MODELS.has(raw.codexModel)) throw new Error("Choose a packaged Codex model.");
  if (!OPENROUTER_MODELS.has(raw.openRouterModel)) throw new Error("Choose a packaged OpenRouter model.");
  const openRouterKey = typeof raw.openRouterKey === "string" ? raw.openRouterKey.trim() : "";
  if (openRouterKey && (!openRouterKey.startsWith("sk-or-v1-") || openRouterKey.length < 33 || /\s/.test(openRouterKey))) {
    throw new Error("The OpenRouter key does not have the expected shape.");
  }
  return { defaultProvider: raw.defaultProvider, providers, codexModel: raw.codexModel, openRouterModel: raw.openRouterModel, openRouterKey };
}

async function installRouter(executable, rawOptions) {
  const options = validatedInstallOptions(rawOptions);
  setStatus(true, `Step 1 of 6 · Grok Bot ${SUPPORTED_GROK_VERSION} is supported.`);
  await relaunchWithDiagnostics(executable);
  const client = new CDPClient(await browserWebSocketURL());
  try {
    const pageSession = await mainPageSession(client);
    if (options.providers.includes("openrouter")) {
      if (options.openRouterKey) await saveOpenRouterKey(options.openRouterKey, client, pageSession);
      else log("No OpenRouter key entered. Keeping any existing OPENROUTER_API_KEY in Grok Bot Secrets.");
    }
    log("Verifying that keyboard input is isolated to the Bot terminal…");
    setStatus(true, "Step 3 of 6 · Verifying the Bot terminal…");
    const transportPayload = Buffer.from("\nGROKBOT_ROUTER_TRANSPORT_OK\n").toString("base64");
    const transportVNC = await typeRemoteCommandsResilient([`printf %s ${transportPayload} | base64 -d`], client, pageSession);
    log("Connected to the Bot computer without Windows Accessibility permissions.");
    await waitForSentinel("GROKBOT_ROUTER_TRANSPORT_OK", client, transportVNC, 30);
    log("Terminal transport verified.");

    const archive = fs.readFileSync(payloadPath());
    const encoded = archive.toString("base64");
    const digest = crypto.createHash("sha256").update(archive).digest("hex");
    const installAttempt = makeInstallAttemptID();
    const installPayload = Buffer.from("\nGROKBOT_ROUTER_INSTALL_OK\n\nGROKBOT_ROUTER_INSTALL_OK\n").toString("base64");
    // The typed command stays visible in the Bot terminal until output scrolls
    // it away, and the OCR loop reads that text too. Keep every sentinel
    // base64-encoded so the failure marker only appears when printed.
    const failurePayload = Buffer.from(`\nGROKROUTER_${installAttempt}_INSTALL_FAILED_UNKNOWN_CODE_`, "utf8").toString("base64");
    const chunks = [];
    for (let index = 0; index < encoded.length; index += 1_000) chunks.push(encoded.slice(index, index + 1_000));
    const commands = ["mkdir -p /tmp/grokbot-router-installer", ": > /tmp/grokbot-router-installer/payload.b64"];
    commands.push(...chunks.map((chunk) => `printf %s ${chunk} >> /tmp/grokbot-router-installer/payload.b64`));
    commands.push(
      "base64 -d /tmp/grokbot-router-installer/payload.b64 > /tmp/grokbot-router-installer/payload.tgz",
      `echo ${digest} /tmp/grokbot-router-installer/payload.tgz | sha256sum -c -`,
      "rm -rf /tmp/grokbot-router-installer/payload",
      "mkdir -p /tmp/grokbot-router-installer/payload",
      "tar -xzf /tmp/grokbot-router-installer/payload.tgz -C /tmp/grokbot-router-installer/payload --strip-components=1",
      `if ROUTER_INSTALL_ATTEMPT=${installAttempt} bash /tmp/grokbot-router-installer/payload/remote/install.sh --provider ${options.defaultProvider} --providers ${options.providers.join(",")} --codex-model ${options.codexModel} --openrouter-model ${options.openRouterModel}; then clear; printf %s ${installPayload} | base64 -d; else code=$?; printf %s ${failurePayload} | base64 -d; echo $code; fi`,
    );
    log("Transferring a SHA-256-verified payload into the Bot computer…");
    const installVNC = await typeRemoteCommandsResilient(commands, client, pageSession);
    log("Installing pinned dependencies and applying the reversible host adapter…");
    await waitForSentinel("GROKBOT_ROUTER_INSTALL_OK", client, installVNC, 360, installAttempt);
    log("The Bot computer reported a successful install.");
    log("Registering native slash commands through Grok Bot's workflow service…");
    await updateNativeWorkflows(client, pageSession);
    await evaluate(client, pageSession, "window.desktop.forceGatewayReconnect().then(()=>true)").catch(() => {});
    if (options.defaultProvider === "openrouter") return "Installed with OpenRouter selected. Send /router doctor in Grok Bot.";
    if (options.providers.includes("codex")) return "Installed. Click Codex sign-in, then send /router doctor in Grok Bot.";
    return "Installed. Send /router doctor in Grok Bot to verify the selected model.";
  } finally {
    client.close();
  }
}

const REMOTE_ACTIONS = Object.freeze({
  auth: { command: "/home/box/.local/bin/grokbot-router auth codex", sentinel: "Welcome to Codex", message: "Codex sign-in is visible in the Bot terminal. Complete the displayed device flow." },
  doctor: { command: "/home/box/.local/bin/grokbot-router doctor", sentinel: "GROKBOT_ROUTER_DOCTOR_DONE", message: "Router Doctor completed in the Bot terminal." },
  repair: { command: "/home/box/.local/bin/grokbot-router repair", sentinel: "GROKBOT_ROUTER_REPAIR_OK", message: "Router repaired. Automatic repair is enabled. Send /provider in Grok Bot." },
  uninstall: { command: "/home/box/.local/bin/grokbot-router uninstall", sentinel: "GROKBOT_ROUTER_UNINSTALL_OK", message: "Restore command sent. Grok Bot will reconnect to its stock host." },
});

async function sendRemoteAction(executable, action) {
  if (!(await browserWebSocketURL().then(() => true).catch(() => false))) await relaunchWithDiagnostics(executable);
  const client = new CDPClient(await browserWebSocketURL());
  try {
    const pageSession = await mainPageSession(client);
    const descriptor = REMOTE_ACTIONS[action];
    if (action === "uninstall") {
      log("Waiting for Grok Bot's shared command library before stock restore…");
      await updateNativeWorkflows(client, pageSession, "remove");
    }
    const vnc = await typeRemoteCommandsResilient([descriptor.command], client, pageSession);
    await waitForSentinel(descriptor.sentinel, client, vnc, 45);
    if (action === "repair") await updateNativeWorkflows(client, pageSession);
    return descriptor.message;
  } finally {
    client.close();
  }
}

async function runAction(action, payload) {
  const executable = await locateAndValidateGrok();
  try {
    return action === "install" ? await installRouter(executable, payload) : await sendRemoteAction(executable, action);
  } finally {
    await relaunchNormallyIfNeeded(executable);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 880,
    height: 900,
    minWidth: 680,
    minHeight: 760,
    show: false,
    backgroundColor: "#0e0f10",
    title: "GrokRouter",
    icon: path.join(__dirname, "assets", "grokrouter-mascot.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
    app.focus({ steal: true });
  });
  mainWindow.on("close", (event) => {
    if (!busy) return;
    event.preventDefault();
    setStatus(true, "Finish or stop the current installer operation before closing GrokRouter.");
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://")) { event.preventDefault(); shell.openExternal(url).catch(() => {}); }
  });
}

ipcMain.handle("grokrouter:run", async (event, request) => {
  if (!event.senderFrame.url.startsWith("file://")) return { ok: false, error: "Installer request was rejected." };
  const action = request?.action;
  if (action !== "install" && !Object.hasOwn(REMOTE_ACTIONS, action)) return { ok: false, error: "Unknown installer action." };
  if (busy) return { ok: false, error: "Another installer operation is already running." };
  busy = true;
  lastDiagnosticReport = "";
  try {
    const message = await runAction(action, request?.payload || {});
    log(`✓ ${message}`);
    setStatus(false, message);
    return { ok: true };
  } catch (error) {
    const detail = errorMessage(error);
    if (!lastDiagnosticReport) lastDiagnosticReport = makeDiagnosticReport(detail);
    log(`✗ ${detail}`);
    setStatus(false, `Stopped: ${detail}`);
    return { ok: false, error: detail };
  } finally {
    busy = false;
  }
});

ipcMain.handle("grokrouter:copy-diagnostics", (event) => {
  if (!event.senderFrame.url.startsWith("file://") || !lastDiagnosticReport) return false;
  clipboard.writeText(lastDiagnosticReport);
  return true;
});

ipcMain.handle("grokrouter:open-support", async (event) => {
  if (!event.senderFrame.url.startsWith("file://")) return false;
  await shell.openExternal("https://github.com/promptadvisers/grokrouter/issues/new?template=installation-failure.yml");
  return true;
});

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  if (ocrWorkerPromise) ocrWorkerPromise.then((worker) => worker.terminate()).catch(() => {});
});
