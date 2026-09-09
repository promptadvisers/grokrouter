import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "router_patch", PROJECT_ROOT / "patch" / "router_patch.py"
)
router_patch = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(router_patch)


STOCK_SOURCE = """\
class MockPromptExecutor {
  constructor(factory, messages) {}
}
function createMockPromptExecutor(options2) {
  return new MockPromptExecutor(() => options2(), void 0);
}
class Host {
  createSession(onRequestId, sessionOptions) {
      const mockResponse = process.env.SAND_AGENT_MOCK_RESPONSE;
      return mockResponse;
  }
}
function runInference(host, options2 = {}) {
  const boxId = host.resolveBoxId();
  const rawTranscriptText = "@Research Bot /provider";
  const mainSessionOptions = {
          modelId: host.subagentModelId,
          isSubagent: host.isSubagentRunner,
  };
  return mainSessionOptions;
}
function buildResult(host, finalAssistantText, sentMessageCount) {
  return {
    ...!host.isSubagentRunner ? { finalAssistantText } : {},
  };
}
async function runGroup(runner, roomSession, request3, promptForAttempt) {
  const memberResult = await runner.run(promptForAttempt, {
    isGroupMemberTurn: true,
  });
  return memberResult;
}
async function runEpisodeSummary(session) {
  const narrative = await summarizeEpisode({
    executor: session.getExecutor(),
  });
  return narrative;
}
async function runMemoryExtraction(session) {
  const extraction = await extractMemories({
    executor: session.getExecutor(),
  });
  return extraction;
}

"""


class RouterPatchTests(unittest.TestCase):
    def test_released_stock_hashes_keep_their_verified_byte_counts(self):
        manifest = router_patch.load_manifest(PROJECT_ROOT / "patch" / "manifests" / "0.30.0.json")
        pairs = {item["sha256"]: item["bytes"] for item in manifest["stockHosts"]}
        self.assertEqual(
            pairs["3364e421402302f8264f961637addb3997a817fde84a91b19635a0c28ff3941f"],
            25656693,
        )

    def test_default_stock_backup_survives_host_directory_replacement(self):
        self.assertEqual(
            router_patch.DEFAULT_BACKUP,
            Path("/home/box/sand-data/grokbot-router-backup/host-main.cjs.stock"),
        )
        self.assertIn(
            Path("/home/box/sand-host/host-main.cjs.grokbot-router.stock"),
            router_patch.LEGACY_BACKUPS,
        )

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        root = Path(self.temporary.name)
        self.host = root / "host-main.cjs"
        self.backup = root / "host-main.cjs.grokbot-router.stock"
        self.manifest_path = root / "manifest.json"
        self.host.write_text(STOCK_SOURCE)
        digest = hashlib.sha256(self.host.read_bytes()).hexdigest()
        self.manifest_path.write_text(
            json.dumps(
                {
                    "grokBotVersion": "test",
                    "stockHosts": [{"sha256": digest, "bytes": self.host.stat().st_size}],
                    "requiredAnchors": [
                        "function createMockPromptExecutor(options2)",
                        "createSession(onRequestId, sessionOptions)",
                        "const mockResponse = process.env.SAND_AGENT_MOCK_RESPONSE;",
                    ],
                }
            )
        )
        self.manifest = router_patch.load_manifest(self.manifest_path)

    def tearDown(self):
        self.temporary.cleanup()

    def test_install_doctor_idempotence_and_restore(self):
        result = router_patch.install(
            self.host, self.backup, self.manifest, dry_run=False, allow_unknown=False
        )
        self.assertEqual(result["status"], "installed")
        self.assertIn(router_patch.MARKER, self.host.read_text())
        self.assertNotIn("hasCompletedGrokBotRouterDelivery", self.host.read_text())
        self.assertIn('toolCallId: `grokbot-router-send-${', self.host.read_text())
        self.assertNotIn("latestGrokBotRouterUserText", self.host.read_text())
        self.assertNotIn("getGrokBotRouterTurnKey", self.host.read_text())
        self.assertNotIn("grokBotRouterCompletedTurns", self.host.read_text())
        self.assertNotIn("getGrokBotRouterSessionKey", self.host.read_text())
        self.assertNotIn("grokbot router delivery complete", self.host.read_text())
        self.assertNotIn("new SandRunAbortError", self.host.read_text())
        self.assertIn('for (const name of ["SendToUser", "SendMessage", "SendUser"])', self.host.read_text())
        self.assertIn('return "SendToUser";', self.host.read_text())
        self.assertIn('{ botId: typeof boxId === "string"', self.host.read_text())
        self.assertEqual(self.host.read_text().count('{ botId: typeof boxId === "string"'), 1)
        self.assertIn('grokBotRouterControlText: rawTranscriptText', self.host.read_text())
        self.assertNotIn('grokBotRouterReceiptReplay', self.host.read_text())
        self.assertEqual(self.backup.read_text(), STOCK_SOURCE)
        self.assertTrue(router_patch.doctor(self.host, self.backup, self.manifest)["ok"])

        second = router_patch.install(
            self.host, self.backup, self.manifest, dry_run=False, allow_unknown=False
        )
        self.assertEqual(second["status"], "already-installed")

        restored = router_patch.restore(
            self.host, self.backup, self.manifest, dry_run=False, allow_unknown=False
        )
        self.assertEqual(restored["status"], "restored")
        self.assertEqual(self.host.read_text(), STOCK_SOURCE)

    def test_group_dispatch_forwards_only_the_latest_human_entry(self):
        patched = router_patch.patch_text(STOCK_SOURCE)
        script = patched + r"""
const assert = require('node:assert/strict');
const human = {id:'human-2',kind:'message',role:'user',content:'@Test A /provider'};
const entries = [
  {id:'human-1',kind:'message',role:'user',content:'An older request'},
  human,
  {id:'bot-3',kind:'send-message',role:'assistant',content:'User: /provider codex'}
];
const runner = {run: async (_, options) => runInference({resolveBoxId: () => 'box-a'}, options)};
(async () => {
  const result = await runGroup.call({tm:{sessions:{activeSession:null}}}, runner,
    {id:'room-one',db:{getTranscriptEntries:()=>entries}}, {member:{id:'bot-a',name:'Test A'}}, 'formatted room prompt');
  assert.equal(result.botId,'box-a');
  assert.deepEqual(result.grokBotRouterGroupContext, {roomId:'room-one',memberId:'bot-a',memberName:'Test A',message:human});
  assert.equal(runInference({resolveBoxId:()=> 'box-a'}, {grokBotRouterGroupContext:{message:human}}).grokBotRouterGroupContext, undefined);
})().catch(error=>{console.error(error);process.exitCode=1;});
"""
        result = subprocess.run(['node','-e',script],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)

    def test_native_memory_executor_is_scoped_and_returns_text(self):
        patched = router_patch.patch_text(STOCK_SOURCE)
        script = patched + r'''
const assert = require('node:assert/strict');
loadGrokBotRouterConfig = () => ({});
async function extractMemories(args) { return args.executor; }
async function summarizeEpisode(args) { return args.executor; }
(async () => {
  const options = {botId:'memory-bot',grokBotRouterControlText:'/provider'};
  const session = new Host().createSession(() => {}, options);
  const helper = await runMemoryExtraction(session);
  assert.equal(helper.sessionOptions.grokBotRouterTextTask, 'memory-extraction');
  assert.equal(helper.sessionOptions.botId, 'memory-bot');
  const episode = await runEpisodeSummary(session);
  assert.equal(episode.sessionOptions.grokBotRouterTextTask, 'episode-summary');
  assert.equal(getGrokBotRouterSendToolName([{name:'SendToUser'}],episode.sessionOptions), null);
  assert.equal(session.getExecutor().sessionOptions.grokBotRouterTextTask, undefined);
  assert.equal(options.grokBotRouterTextTask, undefined);
  assert.equal(new Host().createSession(() => {}, {isSummarizationSession:true}), process.env.SAND_AGENT_MOCK_RESPONSE);
  assert.equal(getGrokBotRouterSendToolName([{name:'SendToUser'}],helper.sessionOptions), null);
  assert.equal(getGrokBotRouterSendToolName([], {isSummarizationSession:true}), null);
  const stock = {getExecutor: () => 'stock-executor'};
  assert.equal(await runMemoryExtraction(stock), 'stock-executor');
  assert.equal(await runEpisodeSummary(stock), 'stock-executor');
})().catch(error=>{console.error(error);process.exitCode=1;});
'''
        result = subprocess.run(['node','-e',script], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        with self.assertRaisesRegex(router_patch.PatchError, 'Memory extraction executor anchor'):
            router_patch.patch_text(STOCK_SOURCE.replace('const extraction = await extractMemories', 'const changed = await extractMemories'))
        with self.assertRaisesRegex(router_patch.PatchError, 'Episode summary executor anchor'):
            router_patch.patch_text(STOCK_SOURCE.replace('const narrative = await summarizeEpisode', 'const changed = await summarizeEpisode'))

    def test_executor_finishes_children_without_inventing_a_delivery_tool(self):
        # Exercise the injected executor protocol against a minimal host double.
        # Child sessions offer execution tools, but no user-delivery tool.
        script = r'''const assert = require("node:assert/strict");
class MockPromptExecutor {
  constructor(factory, messages = []) {
    this.factory = factory;
    this.builder = { getMessages: () => messages };
  }
  stream() {
    const value = this.factory();
    return { response: Promise.resolve(value), fullStream: (async function* () {})() };
  }
}
''' + router_patch.EXECUTOR_CODE + r'''
(async () => {
  let nextResult = { text: "56", toolCalls: [], usage: {} };
  runGrokBotRouter = async () => nextResult;
  const execute = async (tools, isSubagent = true) => {
    const executor = new GrokBotRouterPromptExecutor({}, {isSubagent}, []);
    return await executor.stream({}, "probe", tools, {}).response;
  };
  const child = await execute([{name:"Shell"}, {name:"Read"}]);
  assert.equal(child.response, "56");
  assert.deepEqual(child.toolCalls, []);
  const emptySchema = await execute([]);
  assert.equal(emptySchema.response, "56");
  assert.deepEqual(emptySchema.toolCalls, []);
  const parent = await execute([{name:"SendMessage"}, {name:"SendToUser"}], false);
  assert.equal(parent.response, "");
  assert.equal(parent.toolCalls.length, 1);
  assert.equal(parent.toolCalls[0].toolName, "SendToUser");
  assert.match(parent.toolCalls[0].toolCallId, /^grokbot-router-send-/);
  assert.equal(parent.toolCalls[0].args.content, "56");
  const parentInternal = await execute([{name:"Shell"}], false);
  assert.equal(parentInternal.response, "");
  assert.equal(parentInternal.toolCalls[0].toolName, "SendToUser");
  const childWithDelivery = await execute([{name:"SendToUser"}]);
  assert.equal(childWithDelivery.response, "56");
  assert.deepEqual(childWithDelivery.toolCalls, []);
  const helper = new GrokBotRouterPromptExecutor({}, {grokBotRouterTextTask:"memory-extraction"}, []);
  const memory = await helper.stream({}, "memory", [], {}).response;
  assert.equal(memory.response, "56");
  assert.deepEqual(memory.toolCalls, []);
  nextResult = {text:"Working",toolCalls:[{toolName:"Shell",toolCallId:"actual-call",args:{command:"true"}}]};
  const toolTurn = await execute([{name:"Shell"}]);
  assert.equal(toolTurn.response, "");
  assert.deepEqual(toolTurn.toolCalls, nextResult.toolCalls);
  nextResult = {text:"",toolCalls:[],alreadyDelivered:true};
  const cleanup = await execute([{name:"SendToUser"}]);
  assert.equal(cleanup.response, "");
  assert.deepEqual(cleanup.toolCalls, []);
})().catch(error => { console.error(error); process.exitCode = 1; });
'''
        result = subprocess.run(["node", "-"], input=script, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_unknown_host_is_rejected_without_development_override(self):
        self.host.write_text(STOCK_SOURCE + "// changed\n")
        report = router_patch.inspect_host(self.host, self.manifest)
        self.assertEqual(report["patchDryRun"], "pass")
        self.assertTrue(all(len(line) < 80 for line in router_patch.compatibility_report(self.host, self.manifest).splitlines()))
        with self.assertRaisesRegex(router_patch.PatchError, "HOSTSHA1="):
            router_patch.install(
                self.host, self.backup, self.manifest, dry_run=True, allow_unknown=False
            )

    def test_exact_hash_with_wrong_size_is_rejected(self):
        digest = hashlib.sha256(self.host.read_bytes()).hexdigest()
        self.manifest["stockHosts"] = [{"sha256": digest, "bytes": self.host.stat().st_size + 1}]
        with self.assertRaises(router_patch.PatchError):
            router_patch.install(
                self.host, self.backup, self.manifest, dry_run=True, allow_unknown=False
            )

    def test_signed_registry_can_extend_exact_hash_and_size_pairs(self):
        self.host.write_text(STOCK_SOURCE + "// compatible variant\n")
        digest = hashlib.sha256(self.host.read_bytes()).hexdigest()
        registry_path = Path(self.temporary.name) / "registry.json"
        registry_path.write_text(json.dumps({
            "schemaVersion": 1,
            "grokBotVersion": "test",
            "stockHosts": [{"sha256": digest, "bytes": self.host.stat().st_size}],
        }))
        registry = router_patch.load_host_registry(registry_path, self.manifest)
        result = router_patch.install(
            self.host,
            self.backup,
            self.manifest,
            dry_run=True,
            allow_unknown=False,
            registry=registry,
        )
        self.assertEqual(result["status"], "dry-run")

    def test_shipped_manifest_requires_exact_hashes(self):
        manifest = router_patch.load_manifest(PROJECT_ROOT / "patch" / "manifests" / "0.30.0.json")
        self.assertFalse(manifest["anchorVerifiedHosts"]["enabled"])

    def test_structural_policy_cannot_authorize_a_modified_host(self):
        self.manifest["anchorVerifiedHosts"] = {"enabled": True, "minBytes": 0, "maxBytes": 0}
        self.host.write_text(STOCK_SOURCE + "globalThis.nonStockModification = true;\n")
        report = router_patch.inspect_host(self.host, self.manifest)
        self.assertEqual(report["patchDryRun"], "pass")
        self.assertIsNone(report["hostTrust"])
        self.assertFalse(report["ok"])
        self.assertIsNone(router_patch.host_trust(self.host, self.manifest))
        with self.assertRaises(router_patch.PatchError):
            router_patch.install(self.host, self.backup, self.manifest, False, False)

    def test_backup_does_not_authorize_replacing_rejected_hosts(self):
        variants = [
            STOCK_SOURCE + "// unknown rotated stock\n",
            STOCK_SOURCE + "// OpenGrok adapter installed here\n",
            "throw new Error('incompatible replacement');\n",
            STOCK_SOURCE + f"// {router_patch.MARKER} forged marker\n",
            STOCK_SOURCE + "// GROKBOT_MODEL_ROUTER_V44 forged legacy marker\n",
        ]
        self.backup.write_text(STOCK_SOURCE)
        for variant in variants:
            with self.subTest(variant=variant[-80:]):
                self.host.write_text(variant)
                for dry_run in (True, False):
                    with self.assertRaisesRegex(router_patch.PatchError, "live host was not replaced"):
                        router_patch.install(self.host, self.backup, self.manifest, dry_run, False)
                    self.assertEqual(self.host.read_text(), variant)
                    self.assertEqual(self.backup.read_text(), STOCK_SOURCE)

    def test_doctor_and_repair_reject_a_tampered_router(self):
        router_patch.install(self.host, self.backup, self.manifest, False, False)
        tampered = self.host.read_text() + "globalThis.unreviewed = true;\n"
        self.host.write_text(tampered)
        health = router_patch.doctor(self.host, self.backup, self.manifest)
        self.assertFalse(health["ok"])
        self.assertFalse(health["hostAdapterVerified"])
        self.assertTrue(health["stockBackupVerified"])
        with self.assertRaises(router_patch.PatchError):
            router_patch.install(self.host, self.backup, self.manifest, False, False)
        self.assertEqual(self.host.read_text(), tampered)
        # An explicit restoration is distinct from automatic repair.
        router_patch.restore(self.host, self.backup, self.manifest, False, False)
        self.assertEqual(self.host.read_text(), STOCK_SOURCE)

    def test_published_adapter_upgrade_requires_exact_reconstruction(self):
        spec = importlib.util.spec_from_file_location("previous", PROJECT_ROOT / "patch/previous_adapter.py")
        previous = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(previous)
        self.backup.write_text(STOCK_SOURCE)
        self.host.write_text(previous.patch_text(STOCK_SOURCE))
        result = router_patch.install(self.host, self.backup, self.manifest, False, False)
        self.assertIn(result["status"], ("installed", "already-installed"))
        self.assertEqual(self.host.read_text(), router_patch.patch_text(STOCK_SOURCE))
        self.assertTrue(router_patch.doctor(self.host, self.backup, self.manifest)["ok"])

    def test_exact_reviewed_replacement_updates_backup(self):
        self.backup.write_text(STOCK_SOURCE)
        variant = STOCK_SOURCE + "// independently reviewed new stock\n"
        self.host.write_text(variant)
        self.manifest["stockHosts"].append({"sha256": router_patch.sha256(self.host), "bytes": self.host.stat().st_size})
        router_patch.install(self.host, self.backup, self.manifest, False, False)
        self.assertEqual(self.backup.read_text(), variant)
        router_patch.restore(self.host, self.backup, self.manifest, False, False)
        self.assertEqual(self.host.read_text(), variant)

    def test_syntax_diagnostics_do_not_authorize_unknown_backup_restore(self):
        self.backup.write_text(STOCK_SOURCE + "// unknown backup\n")
        with self.assertRaises(router_patch.PatchError):
            router_patch.restore(self.host, self.backup, self.manifest, False, False)
        self.assertEqual(self.host.read_text(), STOCK_SOURCE)

    def test_missing_or_duplicate_anchor_is_rejected(self):
        self.host.write_text(STOCK_SOURCE.replace("function createMockPromptExecutor", "function wrong"))
        self.assertEqual(router_patch.inspect_host(self.host, self.manifest)["patchDryRun"], "fail")
        digest = hashlib.sha256(self.host.read_bytes()).hexdigest()
        self.manifest["stockHosts"] = [{"sha256": digest, "bytes": self.host.stat().st_size}]
        with self.assertRaises(router_patch.PatchError):
            router_patch.install(
                self.host, self.backup, self.manifest, dry_run=True, allow_unknown=False
            )


if __name__ == "__main__":
    unittest.main()
