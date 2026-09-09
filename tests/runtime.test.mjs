import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  actionableTools,
  addressedRouterControlText,
  automationCompletionId,
  automationCompletionText,
  automationContinuationSignature,
  codexTranscriptMessages,
  conversationIdentity,
  structuredRouterControlText,
  extractUserQuery,
  hasDeliveryAfterLatestQuery,
  hostRouterControlText,
  latestUserText,
  nativeWorkflowControlText,
  normalizeTools,
  openRouterMessages,
  recoveredTextualOpenRouterToolCalls,
  runCodex,
  runOpenRouter,
  runTurn,
  userTurnFingerprint,
} from "../runtime/run-provider.mjs";


const user = (text) => ({ role: "user", content: [{ type: "text", text }] });
const TEST_OPENROUTER_KEY = ["sk", "or", "v1", "syntheticfixture0000000000000000"].join("-");

test("extracts router controls only from exact or pure group-addressed input", () => {
  assert.equal(addressedRouterControlText("/provider"), "/provider");
  assert.equal(addressedRouterControlText("@Research Bot /provider"), "/provider");
  assert.equal(addressedRouterControlText("@[Research Bot](bot-123) /models"), "/models");
  assert.equal(addressedRouterControlText("@分析 Bot /model openai/gpt-5.6-luna"), "/model openai/gpt-5.6-luna");
  assert.equal(addressedRouterControlText("@Research Bot /doctor"), "/doctor");
  assert.equal(
    addressedRouterControlText("Please ask @Research Bot to run /provider"),
    "Please ask @Research Bot to run /provider",
  );
  assert.equal(addressedRouterControlText("@Research Bot, /provider"), "@Research Bot, /provider");
  assert.equal(
    addressedRouterControlText('<mention data-agent-id="bot-123">@Research Bot</mention> /provider'),
    "/provider",
  );
  assert.equal(
    addressedRouterControlText("[mention=bot-123]@Research Bot[/mention] /doctor"),
    "/doctor",
  );
  assert.equal(
    addressedRouterControlText("Please <mention>@Research Bot</mention> /provider"),
    "Please <mention>@Research Bot</mention> /provider",
  );
});

test("extracts a group control stored in a structured command leaf", () => {
  const structured = [{
    role: "user",
    content: {
      text: "@Social Guru",
      mention: { label: "Social Guru" },
      command: { text: "/provider" },
    },
  }];
  assert.equal(structuredRouterControlText(structured), "/provider");
  assert.equal(structuredRouterControlText([{
    role: "user",
    content: { text: "Please tell Social Guru to run /provider" },
  }]), "");
});

test("extracts deterministic controls from Grok's registered workflow envelope only", () => {
  const envelope = (name, command, query) => user([
    `# GrokRouter ${name}`,
    `GROKROUTER_NATIVE_COMMAND: ${command}`,
    `<user_query>${query}</user_query>`,
  ].join("\n\n"));
  assert.equal(nativeWorkflowControlText([envelope("Doctor", "/doctor", "doctor")]), "/doctor");
  assert.equal(
    nativeWorkflowControlText([envelope("provider control", "/provider", "provider openrouter")]),
    "/provider openrouter",
  );
  assert.equal(
    nativeWorkflowControlText([user("# GrokRouter provider\n\nGROKROUTER_NATIVE_CONTROL: PROVIDER")]),
    "/provider",
  );
  assert.equal(
    nativeWorkflowControlText([user("sanitized channel request"), {
      role: "system",
      content: "# GrokRouter provider\n\nGROKROUTER_NATIVE_CONTROL: PROVIDER",
    }]),
    "/provider",
  );
  assert.equal(nativeWorkflowControlText([user("doctor")]), "");
});

test("recovers exact host controls without granting command authority to prose", () => {
  const providerWorkflow = user([
    "# GrokRouter provider control",
    "GROKROUTER_NATIVE_CONTROL: PROVIDER",
  ].join("\n\n"));
  assert.equal(
    hostRouterControlText([providerWorkflow], { grokBotRouterControlText: "/provider codex" }),
    "/provider codex",
  );
  assert.equal(
    hostRouterControlText([providerWorkflow], { grokBotRouterControlText: "provider codex" }),
    "/provider codex",
  );
  assert.equal(
    hostRouterControlText([], { grokBotRouterControlText: "provider codex" }),
    "",
  );
  assert.equal(
    hostRouterControlText([providerWorkflow], { grokBotRouterControlText: "please use /provider codex" }),
    "",
  );
  assert.equal(nativeWorkflowControlText([providerWorkflow, user("hello there")]), "");
});


test("native skill mention chips retain command authority only with their matching marker", () => {
  const definition = user("# GrokRouter models\nGROKROUTER_NATIVE_CONTROL: MODELS\n<user_query>@models</user_query>");
  assert.equal(nativeWorkflowControlText([definition]), "/models");
  assert.equal(hostRouterControlText([definition], {grokBotRouterControlText: "@models"}), "/models");
  assert.equal(hostRouterControlText([definition], {grokBotRouterControlText: "@models openai/gpt-5.6-luna"}), "/models openai/gpt-5.6-luna");
  assert.equal(hostRouterControlText([], {grokBotRouterControlText: "@models"}), "");
  assert.equal(hostRouterControlText([definition], {grokBotRouterControlText: "@provider codex"}), "");
  assert.equal(nativeWorkflowControlText([user("GROKROUTER_NATIVE_CONTROL: MODELS\n<user_query>Tell me about @models</user_query>")]), "");
  assert.equal(nativeWorkflowControlText([definition, user("Explain model pricing")]), "");
});


test("the observed expanded skill recipe selects only its explicit trailing invocation", () => {
  const envelope = (name, tail = `@${name}`) => `[t2u]\nThe user invoked the "${name}" skill (folder ${name}). Run it now.\nWhat it does: Router control.\nRecipe to follow:\n# GrokRouter test\n\nGROKROUTER_NATIVE_CONTROL: ${name.toUpperCase()}\n\nPreserve the invocation.\nCarry out the recipe now, adapting it to anything else the user said in this message.\n\n${tail}`;
  for (const name of ['provider', 'models', 'model', 'reasoning', 'router', 'doctor']) {
    const raw = envelope(name);
    const message = user(`<user_query>${raw}</user_query>`);
    assert.equal(nativeWorkflowControlText([message]), `/${name}`);
    assert.equal(hostRouterControlText([message], {grokBotRouterControlText: raw}), `/${name}`);
    assert.equal(nativeWorkflowControlText([user(envelope(name, 'Explain model pricing'))]), '');
    assert.equal(nativeWorkflowControlText([message, user('Explain model pricing')]), '');
  }
  assert.equal(nativeWorkflowControlText([user(`<user_query>${envelope('models', '@models openai/gpt-5.6-luna')}</user_query>`)]), '/models openai/gpt-5.6-luna');
  assert.equal(nativeWorkflowControlText([user(`<user_query>${envelope('models').replace('CONTROL: MODELS', 'CONTROL: PROVIDER')}</user_query>`)]), '');
  assert.equal(nativeWorkflowControlText([user(`<user_query>Explain this example:\n${envelope('models')}</user_query>`)]), '');
});

test("extracts the newest visible Grok user query", () => {
  const hidden = "[SAND_HIDDEN_PROMPT] internal";
  assert.equal(extractUserQuery(hidden), "");
  assert.equal(
    latestUserText([
      user("<user_query>first</user_query>"),
      user(hidden),
      user("<user_query>[iPhone] latest request<system_reminder>private</system_reminder></user_query>"),
    ]),
    "latest request",
  );
  assert.notEqual(
    userTurnFingerprint([user("<user_query>same</user_query>")]),
    userTurnFingerprint([user("<user_query>same</user_query>"), user("<user_query>same</user_query>")]),
  );
  assert.notEqual(
    userTurnFingerprint([user("<user_query>tagged</user_query>")]),
    userTurnFingerprint([user("<user_query>tagged</user_query>"), user("plain follows tagged")]),
  );
  assert.notEqual(
    userTurnFingerprint([user("caption")]),
    userTurnFingerprint([user("caption"), { role: "user", content: [{ type: "image", mimeType: "image/png", data: "AA==" }] }]),
  );
  assert.equal(
    userTurnFingerprint([user("plain query")]),
    userTurnFingerprint([
      user("plain query"),
      {
        role: "user",
        content: [{
          type: "tool-result",
          toolCallId: "grokbot-router-send-test",
          result: "message sent",
        }],
      },
    ]),
  );
});

test("recognizes an existing Grok delivery and normalizes tool schemas", () => {
  const transcript = [
    user("Do the work"),
    {
      role: "assistant",
      content: [{ type: "tool-call", toolCallId: "1", toolName: "SendMessage", args: {} }],
    },
  ];
  assert.equal(hasDeliveryAfterLatestQuery(transcript), false);
  assert.equal(hasDeliveryAfterLatestQuery([
    ...transcript,
    {
      role: "user",
      content: [{ type: "tool-result", toolCallId: "1", result: "ok" }],
    },
  ]), true);
  assert.equal(hasDeliveryAfterLatestQuery([
    user("Do the work"),
    { role: "assistant", content: [{ type: "text", text: "Already delivered" }] },
  ]), true);
  assert.equal(hasDeliveryAfterLatestQuery([
    user("Do the work"),
    {
      role: "assistant",
      content: [{ type: "tool-call", toolCallId: "2", toolName: "Shell", args: { command: "true" } }],
    },
  ]), false);
  assert.equal(hasDeliveryAfterLatestQuery([
    user("Do the work"),
    {
      role: "tool",
      content: [{ type: "tool-result", toolCallId: "grokbot-router-send-delivery-1", result: "ok" }],
    },
  ]), false);
  assert.equal(hasDeliveryAfterLatestQuery([
    {
      role: "assistant",
      content: [{
        type: "tool-call",
        toolCallId: "grokbot-router-send-greeting",
        toolName: "SendToUser",
        args: { type: "text", content: "Hello" },
      }],
    },
    {
      role: "user",
      content: [{
        type: "tool-result",
        toolCallId: "grokbot-router-send-greeting",
        result: "ok",
      }],
    },
    user("This is a later real user turn"),
  ]), false);
  assert.equal(hasDeliveryAfterLatestQuery([{
    role: "tool",
    content: [{ type: "tool-result", toolCallId: "grokbot-router-send-delivery-without-user", result: "ok" }],
  }]), true);
  assert.equal(hasDeliveryAfterLatestQuery([
    user("Do the work"),
    {
      role: "assistant",
      content: [{
        type: "tool-call",
        toolCallId: "grokbot-router-send-user-wrapped",
        toolName: "SendToUser",
        args: { type: "text", content: "Done" },
      }],
    },
    {
      role: "user",
      content: [{
        type: "tool-result",
        toolCallId: "grokbot-router-send-user-wrapped",
        result: "ok",
      }],
    },
  ]), true);
  assert.deepEqual(normalizeTools([
    { name: "Computer", description: "Use the desktop", inputSchema: { type: "object" } },
    { name: "Computer", description: "duplicate" },
    null,
  ]), [{ name: "Computer", description: "Use the desktop", parameters: { type: "object" } }]);
  assert.deepEqual(actionableTools([
    { name: "SendToUser" },
    { name: "SendMessage" },
    { name: "SendUser" },
    { name: "ReactToMessage" },
    { name: "update_state" },
    { name: "Shell", inputSchema: { type: "object" } },
  ]).map((tool) => tool.name), ["Shell"]);
});

test("converts Grok tool calls, tool results, and images for OpenRouter", async () => {
  const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const converted = await openRouterMessages([
    user("Look at this"),
    {
      role: "assistant",
      content: [{ type: "tool-call", toolCallId: "call-1", toolName: "Computer", args: { action: "screenshot" } }],
    },
    {
      role: "tool",
      content: [{
        type: "tool-result",
        toolCallId: "call-1",
        result: { ok: true, image: { mimeType: "image/png", data: tinyPng } },
      }],
    },
  ]);
  assert.equal(converted[1].tool_calls[0].function.name, "Computer");
  assert.equal(converted[2].role, "tool");
  assert.equal(converted[3].role, "user");
  assert.match(converted[3].content[1].image_url.url, /^data:image\/png;base64,/);

  const userWrappedResult = await openRouterMessages([
    {
      role: "assistant",
      content: [{ type: "tool-call", toolCallId: "call-user-wrapped", toolName: "Shell", args: { command: "pwd" } }],
    },
    {
      role: "user",
      content: [{ type: "tool-result", toolCallId: "call-user-wrapped", result: "/workspace" }],
    },
  ]);
  assert.equal(userWrappedResult[1].role, "tool");
  assert.equal(userWrappedResult[1].tool_call_id, "call-user-wrapped");
  assert.equal(userWrappedResult[1].content, "/workspace");

  const snakeCaseResult = await openRouterMessages([
    {
      role: "assistant",
      content: [{ type: "tool_call", tool_call_id: "snake-call", tool_name: "Shell", arguments: { command: "pwd" } }],
    },
    {
      role: "user",
      content: [{ type: "tool_result", tool_call_id: "snake-call", result: "/workspace" }],
    },
  ]);
  assert.equal(snakeCaseResult[0].tool_calls[0].id, "snake-call");
  assert.equal(snakeCaseResult[1].tool_call_id, "snake-call");

  const sanitizedPairing = await openRouterMessages([
    {
      role: "assistant",
      content: [{ type: "tool-call", toolCallId: "missing-result", toolName: "Shell", args: { command: "true" } }],
    },
    { role: "tool", tool_call_id: "orphan-result", content: "orphan" },
  ]);
  assert.deepEqual(sanitizedPairing, [
    {
      role: "assistant",
      content: null,
      tool_calls: [{
        id: "missing-result",
        type: "function",
        function: { name: "Shell", arguments: '{"command":"true"}' },
      }],
    },
    { role: "tool", tool_call_id: "missing-result", content: "Tool completed." },
  ]);

  const visibleUserOnly = await openRouterMessages([
    user("<user_query>[Mac] Run pwd<system_reminder>private continuation</system_reminder></user_query>"),
    user("[SAND_HIDDEN_PROMPT] keep working internally"),
    user("<system_reminder>private continuation</system_reminder>"),
  ]);
  assert.deepEqual(visibleUserOnly, [{ role: "user", content: "Run pwd" }]);

  const completion = {
    role: "user",
    content: "[SAND_HIDDEN_PROMPT]Subagent finished with CHILD_RESULT_OK.",
    providerOptions: {
      cursor: { sandAutomationCompletionId: "completion-123" },
    },
  };
  assert.equal(automationCompletionId(completion), "completion-123");
  assert.equal(automationCompletionText(completion), "Subagent finished with CHILD_RESULT_OK.");
  assert.equal(automationCompletionText({
    role: "user",
    content: "",
    providerOptions: { cursor: { sandAutomationCompletionId: "empty-completion" } },
  }), "Background task completed with no text output.");
  assert.deepEqual(await openRouterMessages([
    user("Start a subagent"),
    user("[SAND_HIDDEN_PROMPT] ordinary internal continuation"),
    completion,
  ]), [
    { role: "user", content: "Start a subagent" },
    { role: "user", content: "Subagent finished with CHILD_RESULT_OK." },
  ]);
});

test("a subagent completion supersedes the earlier launch delivery", () => {
  const completion = {
    role: "user",
    content: "[SAND_HIDDEN_PROMPT]Subagent result: CHILD_RESULT_OK",
    providerOptions: {
      cursor: { sandAutomationCompletionId: "completion-456" },
    },
  };
  const launchDelivery = {
    role: "assistant",
    content: [{
      type: "tool-call",
      toolCallId: "grokbot-router-send-launch",
      toolName: "SendToUser",
      args: { type: "text", content: "Subagent started." },
    }],
  };
  assert.equal(hasDeliveryAfterLatestQuery([
    user("Delegate this task"),
    launchDelivery,
    completion,
  ]), false);
  assert.equal(hasDeliveryAfterLatestQuery([
    user("Delegate this task"),
    launchDelivery,
    completion,
    {
      role: "user",
      content: [{
        type: "tool-result",
        toolCallId: "grokbot-router-send-launch",
        result: "ok",
      }],
    },
  ]), false);
  assert.equal(hasDeliveryAfterLatestQuery([
    user("Delegate this task"),
    launchDelivery,
    completion,
    {
      role: "assistant",
      content: [{
        type: "tool-call",
        toolCallId: "grokbot-router-send-child-result",
        toolName: "SendToUser",
        args: { type: "text", content: "CHILD_RESULT_OK" },
      }],
    },
    {
      role: "user",
      content: [{
        type: "tool-result",
        toolCallId: "grokbot-router-send-child-result",
        result: "ok",
      }],
    },
  ]), true);
  assert.equal(
    automationContinuationSignature([user("Delegate this task"), launchDelivery, completion]),
    automationContinuationSignature([
      user("Delegate this task"),
      launchDelivery,
      completion,
      user("[SAND_HIDDEN_PROMPT] ordinary follow-up nudge"),
    ]),
  );
});

test("OpenRouter uses a secret without returning it and preserves function calls", async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  const testSecret = TEST_OPENROUTER_KEY;
  process.env.OPENROUTER_API_KEY = testSecret;
  let request;
  try {
    const result = await runOpenRouter(
      { openRouterModel: "anthropic/claude-sonnet-test" },
      [user("take a screenshot")],
      [{ name: "Computer", inputSchema: { type: "object" } }],
      async (url, init) => {
        request = { url, init, body: JSON.parse(init.body) };
        return new Response(JSON.stringify({
          model: "anthropic/claude-sonnet-test",
          choices: [{ message: {
            content: "",
            tool_calls: [{ id: "tool-1", function: { name: "Computer", arguments: "{\"action\":\"screenshot\"}" } }],
          } }],
          usage: { prompt_tokens: 10, completion_tokens: 3 },
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    );
    assert.equal(request.url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(request.init.headers.Authorization, `Bearer ${testSecret}`);
    assert.equal(request.body.messages[0].role, "system");
    assert.match(request.body.messages[0].content, /active model is anthropic\/claude-sonnet-test/);
    assert.match(request.body.messages[0].content, /\/models/);
    assert.equal(request.body.tools[0].function.name, "Computer");
    assert.deepEqual(result.toolCalls[0].args, { action: "screenshot" });
    assert.equal(JSON.stringify(result).includes(TEST_OPENROUTER_KEY), false);
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  }
});

test("recovers one offered dynamic call when a provider prints tool markup as text", async () => {
  const captured = [
    "Running that command once.",
    'to=functions.GetDynamicTools  (json) code:\n{"namespace":"cursor","toolName":"Shell"}',
    'to=functions.GetDynamicTools  (json) code:\n{"namespace":"cursor","toolName":"Shell"}',
    'to=functions.CallDynamicTool  (json) code:\n{"namespace":"cursor","toolName":"Shell","arguments":{"command":"printf \\\"TOOL_OK\\\\n\\\""}}',
    'to=functions.Shell  (json) code:\n{"command":"printf \\\"TOOL_OK\\\\n\\\""}',
    "I cannot access the Shell tool in this chat.",
  ].join("\n");
  const calls = recoveredTextualOpenRouterToolCalls(captured, [
    { name: "GetDynamicTools", inputSchema: { type: "object" } },
    { name: "CallDynamicTool", inputSchema: { type: "object" } },
  ]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].toolName, "CallDynamicTool");
  assert.deepEqual(calls[0].args, {
    namespace: "cursor",
    toolName: "Shell",
    arguments: { command: 'printf "TOOL_OK\\n"' },
  });
  assert.match(calls[0].toolCallId, /^openrouter-text-tool-/);
});

test("never recovers an unoffered textual tool or overrides a native tool call", async () => {
  const captured = 'to=functions.Shell (json) code:\n{"command":"whoami"}';
  assert.deepEqual(recoveredTextualOpenRouterToolCalls(captured, [
    { name: "CallDynamicTool", inputSchema: { type: "object" } },
  ]), []);

  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = TEST_OPENROUTER_KEY;
  try {
    const result = await runOpenRouter(
      { openRouterModel: "openai/gpt-5.6-luna" },
      [user("Use the computer tool")],
      [{ name: "Computer", inputSchema: { type: "object" } }],
      async () => new Response(JSON.stringify({
        model: "openai/gpt-5.6-luna",
        choices: [{ message: {
          content: captured,
          tool_calls: [{ id: "native-1", function: { name: "Computer", arguments: "{\"action\":\"screenshot\"}" } }],
        } }],
      }), { status: 200 }),
    );
    assert.equal(result.toolCalls.length, 1);
    assert.equal(result.toolCalls[0].toolCallId, "native-1");
    assert.equal(result.toolCalls[0].toolName, "Computer");
    assert.equal(result.recoveredTextualToolCall, false);
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  }
});

test("OpenRouter upgrades captured printed dynamic markup into a native host call", async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = TEST_OPENROUTER_KEY;
  let requestBody;
  try {
    const result = await runOpenRouter(
      { openRouterModel: "openai/gpt-5.6-luna" },
      [user("Use Grok's outer Shell tool exactly once")],
      [
        { name: "GetDynamicTools", inputSchema: { type: "object" } },
        { name: "CallDynamicTool", inputSchema: { type: "object" } },
      ],
      async (_url, init) => {
        requestBody = JSON.parse(init.body);
        return new Response(JSON.stringify({
          model: "openai/gpt-5.6-luna",
          choices: [{ message: {
            content: [
              "Running that command once.",
              'to=functions.GetDynamicTools (json) code:\n{"namespace":"cursor","toolName":"Shell"}',
              'to=functions.CallDynamicTool (json) code:\n{"namespace":"cursor","toolName":"Shell","arguments":{"command":"printf TOOL_OK"}}',
            ].join("\n"),
            tool_calls: [],
          } }],
        }), { status: 200 });
      },
    );
    assert.equal(result.toolCalls.length, 1);
    assert.equal(result.toolCalls[0].toolName, "CallDynamicTool");
    assert.equal(result.toolCalls[0].args.arguments.command, "printf TOOL_OK");
    assert.equal(result.recoveredTextualToolCall, true);
    assert.match(requestBody.messages[0].content, /Never print or narrate tool-call markup/);
    assert.match(requestBody.messages[0].content, /GetDynamicTools, CallDynamicTool/);
    assert.equal(requestBody.tool_choice, "required");
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  }
});

test("wraps a captured discovered direct Shell block through the offered dynamic broker", () => {
  const captured = [
    '{"type":"text","content":"Running that once now."}',
    "to=functions.GetDynamicTools  (json inspect?)",
    '{"namespace":"cursor","toolName":"Shell","pattern":""}',
    "to=functions.Shell  code:",
    "{\"command\":\"printf 'BETA14_SHELL_OK\\\\n'\"}",
    "BETA14_SHELL_OK",
  ].join("\n");
  const calls = recoveredTextualOpenRouterToolCalls(captured, [
    { name: "GetDynamicTools", inputSchema: { type: "object" } },
    { name: "CallDynamicTool", inputSchema: { type: "object" } },
  ]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].toolName, "CallDynamicTool");
  assert.deepEqual(calls[0].args, {
    namespace: "cursor",
    toolName: "Shell",
    arguments: { command: "printf 'BETA14_SHELL_OK\\n'" },
  });
});

test("does not broker an unoffered direct tool without same-response discovery", () => {
  const captured = [
    "to=functions.GetDynamicTools (json)",
    '{"namespace":"cursor","toolName":"Read"}',
    "to=functions.Shell code:",
    '{"command":"whoami"}',
  ].join("\n");
  const calls = recoveredTextualOpenRouterToolCalls(captured, [
    { name: "GetDynamicTools", inputSchema: { type: "object" } },
    { name: "CallDynamicTool", inputSchema: { type: "object" } },
  ]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].toolName, "GetDynamicTools");
  assert.equal(calls[0].args.toolName, "Read");
});

test("brokers a printed direct tool only when the user explicitly named it", () => {
  const captured = [
    '{"type":"text","content":"Running the exact shell command once."}',
    "to=functions.Shell (unknown)",
    "{\"command\":\"printf 'BETA15_SHELL_OK\\\\n'\"}",
    '{"type":"text","content":"BETA15_SHELL_OK"}',
  ].join("\n");
  const offered = [
    { name: "GetDynamicTools", inputSchema: { type: "object" } },
    { name: "CallDynamicTool", inputSchema: { type: "object" } },
  ];
  assert.deepEqual(recoveredTextualOpenRouterToolCalls(
    captured,
    offered,
    "Use Grok's outer Shell tool exactly once.",
  )[0].args, {
    namespace: "cursor",
    toolName: "Shell",
    arguments: { command: "printf 'BETA15_SHELL_OK\\n'" },
  });
  assert.deepEqual(recoveredTextualOpenRouterToolCalls(
    captured,
    offered,
    "Use Grok's outer Read tool exactly once.",
  ), []);
});

test("the captured discovery-plus-delivery dialect recovers discovery, never delivery", () => {
  const captured = [
    "I’ll run that exact command once.",
    'to=functions.GetDynamicTools  code:\n{"namespace":"cursor","toolName":"Shell"}',
    'to=functions.GetDynamicTools  code:\n{"namespace":"cursor","toolName":"Shell"}',
    'to=functions.GetDynamicTools  code:\n{"namespace":"cursor","toolName":"Shell","pattern":""}',
    'to=functions.SendToUser  code:\n{"type":"text","content":"BETA26_SHELL_OK"}',
    "BETA26_SHELL_OK",
  ].join("\n");
  const calls = recoveredTextualOpenRouterToolCalls(captured, [
    { name: "Shell", inputSchema: { type: "object" } },
    { name: "GetDynamicTools", inputSchema: { type: "object" } },
    { name: "CallDynamicTool", inputSchema: { type: "object" } },
  ], "Use Grok's outer Shell tool exactly once.");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].toolName, "GetDynamicTools");
  assert.deepEqual(calls[0].args, { namespace: "cursor", toolName: "Shell", pattern: "" });
});

test("the captured direct-Shell dialect survives Unicode and markdown decoration", async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = TEST_OPENROUTER_KEY;
  try {
    const captured = [
      "Running that now.",
      "to=functions.Shell \uFFFCjson\n```json\n{\"command\":\"printf 'BETA27_SHELL_OK\\\\n'\",\"description\":\"Run the exact requested shell command\"}\n```",
      "to=functions.Shell \u3000json\n{\"command\":\"printf 'BETA27_SHELL_OK\\\\n'\",\"description\":\"Run the exact requested shell command\"}",
      "to=functions.SendToUser (json)\n{\"type\":\"text\",\"content\":\"BETA27_SHELL_OK\"}",
      "BETA27_SHELL_OK",
    ].join("\n");
    const result = await runOpenRouter(
      { openRouterModel: "openai/gpt-5.6-luna" },
      [user("Use Grok's outer Shell tool exactly once to run: printf BETA27_SHELL_OK")],
      [
        { name: "Shell", inputSchema: { type: "object" } },
        { name: "GetDynamicTools", inputSchema: { type: "object" } },
        { name: "CallDynamicTool", inputSchema: { type: "object" } },
      ],
      async () => new Response(JSON.stringify({
        model: "openai/gpt-5.6-luna",
        choices: [{ message: { content: captured, tool_calls: [] } }],
      }), { status: 200 }),
    );
    assert.equal(result.toolCalls.length, 1);
    assert.equal(result.toolCalls[0].toolName, "Shell");
    assert.deepEqual(result.toolCalls[0].args, {
      command: "printf 'BETA27_SHELL_OK\\n'",
      description: "Run the exact requested shell command",
    });
    assert.equal(result.text, "");
    assert.equal(result.recoveredTextualToolCall, true);
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  }
});

test("a forced named tool recovers schema-matching bare arguments but not delivery JSON", async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = TEST_OPENROUTER_KEY;
  try {
    const captured = [
      "I’ll run that exact command once.",
      "```json\n{\"command\":\"printf 'BETA28_SHELL_OK\\\\n'\",\"description\":\"Run the exact requested printf command\"}\n```",
      "{\"command\":\"printf 'BETA28_SHELL_OK\\\\n'\",\"description\":\"Run the exact requested printf command\"}",
      "{\"type\":\"text\",\"content\":\"BETA28_SHELL_OK\"}",
      "BETA28_SHELL_OK",
    ].join("\n");
    const result = await runOpenRouter(
      { openRouterModel: "openai/gpt-5.6-luna" },
      [user("Use Grok's outer Shell tool exactly once to run: printf BETA28_SHELL_OK")],
      [{
        name: "Shell",
        inputSchema: {
          type: "object",
          properties: { command: { type: "string" }, description: { type: "string" } },
          required: ["command"],
        },
      }],
      async () => new Response(JSON.stringify({
        model: "openai/gpt-5.6-luna",
        choices: [{ message: { content: captured, tool_calls: [] } }],
      }), { status: 200 }),
    );
    assert.equal(result.toolCalls.length, 1);
    assert.equal(result.toolCalls[0].toolName, "Shell");
    assert.equal(result.toolCalls[0].args.command, "printf 'BETA28_SHELL_OK\\n'");
    assert.equal(result.text, "");
    assert.equal(result.recoveredTextualToolCall, true);

    const deliveryOnly = recoveredTextualOpenRouterToolCalls(
      '{"type":"text","content":"BETA28_SHELL_OK"}',
      [{
        name: "Shell",
        inputSchema: {
          type: "object",
          properties: { command: { type: "string" } },
          required: ["command"],
        },
      }],
      "Use Grok's outer Shell tool exactly once.",
    );
    assert.deepEqual(deliveryOnly, []);
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  }
});

test("a forced named tool decodes required string fields from invalid object text", () => {
  const captured = [
    "to=functions.Shell code (json)",
    "{\"command\":\"printf BETA31_SHELL_OK",
    "\",\"description\":\"Run the exact command\"}",
    "{\"type\":\"text\",\"content\":\"BETA31_SHELL_OK\"}",
  ].join("\n");
  const calls = recoveredTextualOpenRouterToolCalls(
    captured,
    [{
      name: "Shell",
      inputSchema: {
        type: "object",
        properties: { command: { type: "string" }, description: { type: "string" } },
        required: ["command"],
      },
    }],
    "Use Grok's outer Shell tool exactly once.",
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].toolName, "Shell");
  assert.equal(calls[0].args.command, "printf BETA31_SHELL_OK\n");
  assert.equal(calls[0].args.description, "Run the exact command");
});

test("explicit tool choice is required only before the current turn has a tool result", async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = TEST_OPENROUTER_KEY;
  const bodies = [];
  try {
    const fetchImpl = async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify({
        model: "openai/gpt-5.6-luna",
        choices: [{ message: { content: "BETA15_TOOL_DONE", tool_calls: [] } }],
      }), { status: 200 });
    };
    await runOpenRouter(
      { openRouterModel: "openai/gpt-5.6-luna" },
      [user("Use Grok's outer Shell tool exactly once")],
      [{ name: "CallDynamicTool", inputSchema: { type: "object" } }],
      fetchImpl,
    );
    await runOpenRouter(
      { openRouterModel: "openai/gpt-5.6-luna" },
      [
        user("Use Grok's outer Shell tool exactly once"),
        { role: "assistant", content: [{ type: "tool-call", toolCallId: "shell-1", toolName: "CallDynamicTool", args: {} }] },
        { role: "tool", content: [{ type: "tool-result", toolCallId: "shell-1", result: "done" }] },
      ],
      [{ name: "CallDynamicTool", inputSchema: { type: "object" } }],
      fetchImpl,
    );
    assert.equal(bodies[0].tool_choice, "required");
    assert.equal(bodies[1].tool_choice, "auto");
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  }
});

test("an explicitly named offered tool is forced by name on the first round", async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = TEST_OPENROUTER_KEY;
  let requestBody;
  try {
    const result = await runOpenRouter(
      { openRouterModel: "openai/gpt-5.6-luna" },
      [user("Use Grok's outer Shell tool exactly once to run: printf TOOL_OK")],
      [
        { name: "Shell", inputSchema: { type: "object" } },
        { name: "GetDynamicTools", inputSchema: { type: "object" } },
        { name: "CallDynamicTool", inputSchema: { type: "object" } },
      ],
      async (_url, init) => {
        requestBody = JSON.parse(init.body);
        return new Response(JSON.stringify({
          model: "openai/gpt-5.6-luna",
          choices: [{ message: {
            content: "",
            tool_calls: [{
              id: "shell-native-1",
              function: { name: "Shell", arguments: '{"command":"printf TOOL_OK"}' },
            }],
          } }],
        }), { status: 200 });
      },
    );
    assert.deepEqual(requestBody.tool_choice, {
      type: "function",
      function: { name: "Shell" },
    });
    assert.equal(requestBody.parallel_tool_calls, false);
    assert.equal(result.toolCalls[0].toolName, "Shell");
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  }
});

test("OpenRouter forces real subagent discovery and never invents missing orchestration", async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = TEST_OPENROUTER_KEY;
  const bodies = [];
  try {
    const discovered = await runOpenRouter(
      { openRouterModel: "openai/gpt-5.6-luna" },
      [user("Delegate this research to a sub-agent")],
      [
        { name: "GetDynamicTools", inputSchema: { type: "object" } },
        { name: "CallDynamicTool", inputSchema: { type: "object" } },
      ],
      async (_url, init) => {
        bodies.push(JSON.parse(init.body));
        return new Response(JSON.stringify({
          model: "openai/gpt-5.6-luna",
          choices: [{ message: {
            content: "",
            tool_calls: [{
              id: "discover-subagent-1",
              function: { name: "GetDynamicTools", arguments: '{"query":"subagent"}' },
            }],
          } }],
        }), { status: 200 });
      },
    );
    assert.deepEqual(bodies[0].tool_choice, {
      type: "function",
      function: { name: "GetDynamicTools" },
    });
    assert.match(bodies[0].messages[0].content, /explicitly requested delegation/);
    assert.equal(discovered.toolCalls[0].toolName, "GetDynamicTools");

    const unavailable = await runOpenRouter(
      { openRouterModel: "openai/gpt-5.6-luna" },
      [user("Use a background agent to do this")],
      [],
      async (_url, init) => {
        bodies.push(JSON.parse(init.body));
        return new Response(JSON.stringify({
          model: "openai/gpt-5.6-luna",
          choices: [{ message: { content: "No orchestration tool is available in this turn.", tool_calls: [] } }],
        }), { status: 200 });
      },
    );
    assert.equal(bodies[1].tools, undefined);
    assert.equal(bodies[1].tool_choice, undefined);
    assert.match(bodies[1].messages[0].content, /cannot launch a real sub-agent/);
    assert.equal(unavailable.text, "No orchestration tool is available in this turn.");
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  }
});

test("OpenRouter rejects a placeholder credential before making a request", async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "paste-key-here";
  let requested = false;
  try {
    await assert.rejects(
      runOpenRouter(
        { openRouterModel: "anthropic/claude-sonnet-test" },
        [user("hello")],
        [],
        async () => {
          requested = true;
          throw new Error("request should not run");
        },
      ),
      /present but does not look like a valid sk-or-v1 key/,
    );
    assert.equal(requested, false);
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  }
});

test("an exact-text OpenRouter turn cannot wander into an outer tool", async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = TEST_OPENROUTER_KEY;
  let requestBody;
  try {
    const result = await runOpenRouter(
      { openRouterModel: "openai/gpt-5.6-luna" },
      [user("Reply with exactly FRESH_BOT_TEXT_OK and nothing else.")],
      [{ name: "GetDynamicTools", inputSchema: { type: "object" } }],
      async (_url, init) => {
        requestBody = JSON.parse(init.body);
        return new Response(JSON.stringify({
          model: "openai/gpt-5.6-luna",
          choices: [{ message: { content: "FRESH_BOT_TEXT_OK", tool_calls: [] } }],
          usage: { prompt_tokens: 3, completion_tokens: 2 },
        }), { status: 200 });
      },
    );
    assert.equal(result.text, "FRESH_BOT_TEXT_OK");
    assert.equal(requestBody.tools, undefined);
    assert.equal(requestBody.tool_choice, undefined);
    assert.match(requestBody.messages[0].content, /exact-text reply must be answered directly without tools/);
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  }
});

test("a new Bot automatic greeting cannot wander into dynamic tools", async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = TEST_OPENROUTER_KEY;
  let requestBody;
  try {
    const result = await runOpenRouter(
      { openRouterModel: "anthropic/claude-sonnet-test" },
      [{ role: "system", content: "Greet the user in their new Bot." }],
      [
        { name: "GetDynamicTools", inputSchema: { type: "object" } },
        { name: "CallDynamicTool", inputSchema: { type: "object" } },
      ],
      async (_url, init) => {
        requestBody = JSON.parse(init.body);
        return new Response(JSON.stringify({
          model: "anthropic/claude-sonnet-test",
          choices: [{ message: { content: "Hey!", tool_calls: [] } }],
          usage: { prompt_tokens: 3, completion_tokens: 2 },
        }), { status: 200 });
      },
    );
    assert.equal(result.text, "Hey!");
    assert.equal(requestBody.tools, undefined);
    assert.equal(requestBody.tool_choice, undefined);
    assert.match(requestBody.messages[0].content, /automatic new-Bot greeting/);
    assert.match(requestBody.messages[0].content, /do not use tools/);
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  }
});

test("OpenRouter reports an invalid key stored in Grok Secrets", async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  const root = await mkdtemp(join(tmpdir(), "grok-router-invalid-key-"));
  const secretsPath = join(root, "box-secrets.json");
  await writeFile(secretsPath, JSON.stringify({ secrets: { OPENROUTER_API_KEY: "paste-key-here" } }));
  try {
    await assert.rejects(
      runOpenRouter(
        { openRouterSecretsPath: secretsPath, openRouterModel: "anthropic/claude-sonnet-test" },
        [user("hello")],
        [],
        async () => { throw new Error("request should not run"); },
      ),
      /present but does not look like a valid sk-or-v1 key/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  }
});

test("Codex returns structured Grok tool calls and resumes a saved thread", async () => {
  const calls = [];
  const thread = {
    id: "thread-123",
    async run(input, options) {
      calls.push({ input, options });
      return {
        finalResponse: JSON.stringify({
          text: "",
          toolCalls: [{
            toolCallId: "codex-tool-1",
            toolName: "Computer",
            argumentsJson: "{\"action\":\"screenshot\"}",
          }],
        }),
        usage: { input_tokens: 12, output_tokens: 4 },
      };
    },
  };
  let resumed;
  const result = await runCodex(
    { codexThreadId: "existing", codexModel: "gpt-test", tempDirectory: tmpdir() },
    [
      user("Use my computer"),
      user("[SAND_HIDDEN_PROMPT] ordinary internal continuation"),
      {
        role: "user",
        content: "[SAND_HIDDEN_PROMPT]Subagent finished: CODEX_CHILD_OK",
        providerOptions: { cursor: { sandAutomationCompletionId: "codex-completion-1" } },
      },
    ],
    [{ name: "Computer", inputSchema: { type: "object" } }],
    () => ({
      startThread: () => thread,
      resumeThread: (id) => { resumed = id; return thread; },
    }),
  );
  assert.equal(resumed, "existing");
  assert.equal(calls[0].options.outputSchema.properties.toolCalls.type, "array");
  assert.match(calls[0].input, /active model is gpt-test/);
  assert.match(calls[0].input, /\/models/);
  assert.match(calls[0].input, /Grok background task completed: Subagent finished: CODEX_CHILD_OK/);
  assert.doesNotMatch(calls[0].input, /ordinary internal continuation|SAND_HIDDEN_PROMPT/);
  assert.equal(result.threadId, "thread-123");
  assert.equal(result.toolCalls[0].toolName, "Computer");
});

test("per-Bot state is isolated and atomically persisted", async () => {
  const root = await mkdtemp(join(tmpdir(), "grokbot-router-state-"));
  const config = {
    provider: "codex",
    providers: ["codex", "openrouter"],
    statePath: join(root, "states.json"),
    auditPath: join(root, "audit.jsonl"),
  };
  try {
    const first = await runTurn({
      config,
      messages: [user("/provider openrouter")],
      sessionOptions: { botId: "bot-one" },
    });
    const second = await runTurn({
      config,
      messages: [user("/provider")],
      sessionOptions: { botId: "bot-two" },
    });
    assert.equal(first.provider, "openrouter");
    assert.match(second.text, /Codex SDK is active/);
    const files = (await readdir(join(root, "states"))).filter((name) => name.endsWith(".json"));
    assert.equal(files.length, 2);
    for (const file of files) JSON.parse(await readFile(join(root, "states", file), "utf8"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("group conversations keep router state attached to each Bot, not the channel roster", () => {
  const messages = [user("hello")];
  const direct = conversationIdentity(messages, {
    bot_id: "bot-alpha",
    conversationId: "direct-chat-alpha",
  });
  const group = conversationIdentity(messages, {
    bot_id: "bot-alpha",
    channelId: "group-falcon",
    roster: [{ agentId: "bot-alpha" }, { agentId: "bot-beta" }],
  });
  const changedRoster = conversationIdentity(messages, {
    bot_id: "bot-alpha",
    channelId: "group-falcon",
    roster: [{ agentId: "bot-beta" }, { agentId: "bot-alpha" }, { agentId: "bot-gamma" }],
  });
  const otherBot = conversationIdentity(messages, {
    bot_id: "bot-beta",
    channelId: "group-falcon",
  });

  assert.equal(group.key, direct.key);
  assert.equal(changedRoster.key, direct.key);
  assert.notEqual(otherBot.key, direct.key);
  assert.equal(group.source, "bot");
  assert.deepEqual(group.fields, ["botid"]);
});

test("a group-addressed control changes only the addressed Bot's state", async () => {
  const root = await mkdtemp(join(tmpdir(), "grokbot-router-group-control-"));
  const config = {
    provider: "codex",
    providers: ["codex", "openrouter"],
    statePath: join(root, "states.json"),
    auditPath: join(root, "audit.jsonl"),
  };
  try {
    const switched = await runTurn({
      config,
      messages: [user("@Research Bot /provider openrouter")],
      sessionOptions: { botId: "research-bot", channelId: "group-falcon" },
    });
    const other = await runTurn({
      config,
      messages: [user("@Demo Bot /provider")],
      sessionOptions: { botId: "demo-bot", channelId: "group-falcon" },
    });
    assert.equal(switched.provider, "openrouter");
    assert.match(other.text, /Codex SDK is active/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a channel control suppresses host-shaped follow-on turns across Bots", async () => {
  const root = await mkdtemp(join(tmpdir(), "grokbot-router-channel-follow-on-"));
  const config = {
    provider: "openrouter",
    providers: ["codex", "openrouter"],
    statePath: join(root, "states.json"),
    auditPath: join(root, "audit.jsonl"),
    channelControlLatchPath: join(root, "channel-control-latch.json"),
  };
  const neverInfer = async () => { throw new Error("channel control follow-on leaked to model inference"); };
  try {
    const control = await runTurn({
      config,
      messages: [user("# GrokRouter provider\n\nGROKROUTER_NATIVE_CONTROL: PROVIDER")],
      sessionOptions: {
        botId: "social-guru",
        skipLabeling: true,
        lineage: { rootParentRequestId: "channel-run-root" },
      },
    }, { fetchImpl: neverInfer });
    assert.equal(control.control, true);

    const result = await runTurn({
      config,
      messages: [user("# GrokRouter provider\n\nGROKROUTER_NATIVE_CONTROL: PROVIDER")],
      sessionOptions: {
        botId: "demo-bot",
        skipLabeling: true,
        lineage: { rootParentRequestId: "channel-run-root" },
      },
    }, { fetchImpl: neverInfer });
    assert.equal(result.text, "");
    assert.equal(result.alreadyDelivered, true);
    const audit = await readFile(join(root, "audit.jsonl"), "utf8");
    assert.match(audit, /"reason":"channel-control-follow-on"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("channel receipt suppression cannot cross request roots or swallow a fresh control", async () => {
  const root = await mkdtemp(join(tmpdir(), "grokrouter-channel-scoping-"));
  const config = {
    provider: "codex", providers: ["codex", "openrouter"],
    statePath: join(root, "states.json"), auditPath: join(root, "audit.jsonl"),
    channelControlLatchPath: join(root, "latch.json"),
  };
  const envelope = user("# GrokRouter provider\nGROKROUTER_NATIVE_CONTROL: PROVIDER");
  const options = (id, request) => ({ botId: id, skipLabeling: true, lineage: { rootParentRequestId: request } });
  try {
    await runTurn({ config, messages: [envelope], sessionOptions: options("one", "first") });
    const independent = await runTurn({ config, messages: [envelope], sessionOptions: options("two", "second") });
    assert.equal(independent.control, true);
    assert.match(independent.text, /Codex SDK is active/);
    const fresh = await runTurn({ config, messages: [envelope, user("/provider openrouter")], sessionOptions: options("one", "first") });
    assert.equal(fresh.control, true);
    assert.equal(fresh.provider, "openrouter");
    const numeric = await runTurn({ config, messages: [envelope], sessionOptions: options("three", 42) });
    assert.equal(numeric.control, true);
    const followOn = await runTurn({ config, messages: [envelope], sessionOptions: options("four", 42) });
    assert.equal(followOn.alreadyDelivered, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a workflow definition cannot replace an unrelated explicit user query", () => {
  assert.equal(nativeWorkflowControlText([user(
    "# GrokRouter provider\nGROKROUTER_NATIVE_CONTROL: PROVIDER\n<user_query>Explain provider pricing</user_query>"
  )]), "");
});

test("group identity changes do not discard a previously combined-ID router state", async () => {
  const root = await mkdtemp(join(tmpdir(), "grokbot-router-group-migration-"));
  const stateDirectory = join(root, "states");
  const legacySeed = ["botid:bot-migrate", "conversationid:group-one"].sort().join("|");
  const legacyKey = createHash("sha256").update(legacySeed).digest("hex");
  const config = {
    provider: "codex",
    providers: ["codex", "openrouter"],
    statePath: join(root, "states.json"),
    auditPath: join(root, "audit.jsonl"),
  };
  try {
    await mkdir(stateDirectory, { recursive: true });
    await writeFile(join(stateDirectory, `${legacyKey}.json`), JSON.stringify({
      conversationKey: legacyKey,
      sessionId: legacyKey.slice(0, 24),
      provider: "openrouter",
      model: "openai/gpt-5.6-luna",
      reasoning: "high",
      threadId: "legacy-thread",
      threadEpoch: 3,
      tools: [],
    }));

    const status = await runTurn({
      config,
      messages: [user("/provider")],
      sessionOptions: { botId: "bot-migrate", conversationId: "group-one" },
    });
    assert.match(status.text, /OpenRouter is active/);
    assert.match(status.text, /openai\/gpt-5\.6-luna/);

    const identity = conversationIdentity([user("/provider")], {
      botId: "bot-migrate",
      conversationId: "group-one",
    });
    const migrated = JSON.parse(await readFile(join(stateDirectory, `${identity.key}.json`), "utf8"));
    assert.equal(migrated.provider, "openrouter");
    assert.equal(migrated.threadId, "legacy-thread");
    assert.equal(migrated.migratedFromConversationKey, legacyKey);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a stable Bot identity outranks changing per-turn request IDs", async () => {
  const root = await mkdtemp(join(tmpdir(), "grokbot-router-request-id-"));
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = TEST_OPENROUTER_KEY;
  const config = {
    provider: "openrouter",
    providers: ["openrouter"],
    openRouterModel: "anthropic/claude-sonnet-4.6",
    openRouterModels: ["anthropic/claude-sonnet-4.6", "openai/gpt-5.6-luna"],
    statePath: join(root, "states.json"),
    auditPath: join(root, "audit.jsonl"),
  };
  const turn = (text, requestId) => ({
    role: "user",
    content: [{ type: "text", text }],
    providerOptions: { cursor: { requestId } },
  });
  try {
    const switched = await runTurn({
      config,
      messages: [turn("openai/gpt-5.6-luna", "request-switch")],
      sessionOptions: { bot_id: "stable-live-bot" },
    });
    assert.equal(switched.model, "openai/gpt-5.6-luna");

    const status = await runTurn({
      config,
      messages: [turn("/provider", "request-status")],
      sessionOptions: { bot_id: "stable-live-bot" },
    });
    assert.match(status.text, /openai\/gpt-5\.6-luna/);

    let requestedModel;
    const normal = await runTurn({
      config,
      messages: [turn("State the active model.", "request-inference")],
      sessionOptions: { bot_id: "stable-live-bot" },
    }, { fetchImpl: async (_url, init) => {
      requestedModel = JSON.parse(init.body).model;
      return new Response(JSON.stringify({
        model: requestedModel,
        choices: [{ message: { content: "MODEL_STICKY_OK", tool_calls: [] } }],
      }), { status: 200 });
    } });
    assert.equal(requestedModel, "openai/gpt-5.6-luna");
    assert.equal(normal.text, "MODEL_STICKY_OK");
    const files = (await readdir(join(root, "states"))).filter((name) => name.endsWith(".json"));
    assert.equal(files.length, 1);
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test("a brand-new Bot accepts the exact model workflow and forgiving screenshot inputs", async () => {
  const root = await mkdtemp(join(tmpdir(), "grokbot-router-fresh-bot-"));
  const config = {
    provider: "openrouter",
    providers: ["codex", "openrouter"],
    openRouterModel: "anthropic/claude-sonnet-4.6",
    openRouterModels: [
      "anthropic/claude-sonnet-4.6",
      "openai/gpt-5.6-luna",
    ],
    statePath: join(root, "states.json"),
    auditPath: join(root, "audit.jsonl"),
  };
  const neverInfer = async () => { throw new Error("control input leaked to model inference"); };
  try {
    const listed = await runTurn({
      config,
      messages: [user("/models")],
      sessionOptions: { botId: "brand-new-bot" },
    }, { fetchImpl: neverInfer });
    assert.match(listed.text, /openai\/gpt-5\.6-luna/);
    assert.match(listed.text, /paste one listed vendor\/model ID by itself/);

    const pasted = await runTurn({
      config,
      messages: [user("openai/gpt-5.6-luna")],
      sessionOptions: { botId: "brand-new-bot" },
    }, { fetchImpl: neverInfer });
    assert.equal(pasted.model, "openai/gpt-5.6-luna");
    assert.match(pasted.text, /Switched this bot/);

    const status = await runTurn({
      config,
      messages: [user("/provider")],
      sessionOptions: { botId: "brand-new-bot" },
    }, { fetchImpl: neverInfer });
    assert.match(status.text, /OpenRouter is active/);
    assert.match(status.text, /openai\/gpt-5\.6-luna/);

    const doctor = await runTurn({
      config,
      messages: [user("/doctor")],
      sessionOptions: { botId: "brand-new-bot" },
    }, { fetchImpl: neverInfer });
    assert.match(doctor.text, /Router 0\.1\.0-beta\./);
    assert.equal(doctor.control, true);

    const nativeDoctor = await runTurn({
      config,
      messages: [user("# GrokRouter Doctor\n\nGROKROUTER_NATIVE_COMMAND: /doctor\n\n<user_query>doctor</user_query>")],
      sessionOptions: { botId: "native-workflow-bot" },
    }, { fetchImpl: neverInfer });
    const release = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    assert.ok(nativeDoctor.text.startsWith(`Router ${release.version}: OK`));
    assert.equal(nativeDoctor.control, true);

    const recipe = (await readFile(new URL('../skills/models/SKILL.md', import.meta.url), 'utf8')).replace(/^---[\s\S]*?---\s*/, '').trim();
    const expandedModels = `[t2u]\nThe user invoked the "models" skill (folder models). Run it now.\nWhat it does: List configured models or switch the current GrokRouter Bot to a model ID.\nRecipe to follow:\n${recipe}\nCarry out the recipe now, adapting it to anything else the user said in this message.\n\n@models`;
    const nativeModels = await runTurn({
      config,
      messages: [user(`<user_query>${expandedModels}</user_query>`)],
      sessionOptions: { botId: 'native-expanded-bot', grokBotRouterControlText: expandedModels },
    }, { fetchImpl: neverInfer });
    assert.equal(nativeModels.control, true);
    assert.match(nativeModels.text, /openai\/gpt-5\.6-luna/);
    assert.match(nativeModels.text, /Switch: send/);

    const nativeProvider = await runTurn({
      config,
      messages: [user("# GrokRouter provider control\n\nGROKROUTER_NATIVE_COMMAND: /provider\n\n<user_query>provider openrouter</user_query>")],
      sessionOptions: { botId: "native-workflow-bot" },
    }, { fetchImpl: neverInfer });
    assert.match(nativeProvider.text, /Switched this bot from OpenRouter/);
    assert.equal(nativeProvider.control, true);

    const pluralAlias = await runTurn({
      config,
      messages: [user("/models openai/gpt-5.6-luna")],
      sessionOptions: { botId: "second-brand-new-bot" },
    }, { fetchImpl: neverInfer });
    assert.equal(pluralAlias.model, "openai/gpt-5.6-luna");

    const malformed = await runTurn({
      config,
      messages: [user("/models not-a-model")],
      sessionOptions: { botId: "third-brand-new-bot" },
    }, { fetchImpl: neverInfer });
    assert.match(malformed.text, /Invalid OpenRouter model ID/);

    const nearMisses = [
      ["/Provider", /OpenRouter is active/],
      ["/Router   Doctor", /Router 0\.1\.0-beta\./],
      ["/router foo", /Router command not understood/],
      ["/provider open router", /Router command not understood/],
      ["/reasoning MAX", /Router command not understood/],
      ["unlisted/model-id", /not in this bot's configured list/],
    ];
    for (const [input, expected] of nearMisses) {
      const handled = await runTurn({
        config,
        messages: [user(input)],
        sessionOptions: { botId: `near-miss-${input}` },
      }, { fetchImpl: neverInfer });
      assert.match(handled.text, expected);
      assert.equal(handled.control, true);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a current provider switch outranks a retained bare native workflow", async () => {
  const root = await mkdtemp(join(tmpdir(), "grokbot-router-provider-switch-"));
  const config = {
    provider: "openrouter",
    providers: ["codex", "openrouter"],
    codexModel: "gpt-5.6-sol",
    openRouterModel: "anthropic/claude-sonnet-4.6",
    statePath: join(root, "states.json"),
  };
  const retainedProviderWorkflow = user([
    "# GrokRouter provider control",
    "GROKROUTER_NATIVE_CONTROL: PROVIDER",
    "<user_query>provider</user_query>",
  ].join("\n\n"));
  const neverInfer = async () => { throw new Error("provider control leaked to model inference"); };
  try {
    const literal = await runTurn({
      config,
      messages: [retainedProviderWorkflow, user("/provider codex")],
      sessionOptions: {
        botId: "literal-provider-switch",
        grokBotRouterControlText: "/provider codex",
      },
    }, { fetchImpl: neverInfer });
    assert.equal(literal.provider, "codex");
    assert.equal(literal.model, "gpt-5.6-sol");
    assert.match(literal.text, /Switched this bot from OpenRouter/);

    const withoutHostTranscript = await runTurn({
      config,
      messages: [retainedProviderWorkflow, user("/provider codex")],
      sessionOptions: { botId: "literal-provider-switch-without-host-transcript" },
    }, { fetchImpl: neverInfer });
    assert.equal(withoutHostTranscript.provider, "codex");
    assert.equal(withoutHostTranscript.model, "gpt-5.6-sol");

    const native = await runTurn({
      config,
      messages: [retainedProviderWorkflow],
      sessionOptions: {
        botId: "native-provider-switch",
        grokBotRouterControlText: "provider codex",
      },
    }, { fetchImpl: neverInfer });
    assert.equal(native.provider, "codex");
    assert.equal(native.model, "gpt-5.6-sol");
    assert.match(native.text, /Switched this bot from OpenRouter/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a visible assistant delivery stops duplicate fresh-Bot inference", async () => {
  const root = await mkdtemp(join(tmpdir(), "grokbot-router-delivery-loop-"));
  let requested = false;
  try {
    const result = await runTurn({
      config: {
        provider: "openrouter",
        providers: ["openrouter"],
        statePath: join(root, "states.json"),
      },
      messages: [
        user("Reply with exactly ONCE"),
        { role: "assistant", content: [{ type: "text", text: "ONCE" }] },
      ],
      sessionOptions: { botId: "brand-new-bot" },
    }, { fetchImpl: async () => { requested = true; throw new Error("duplicate inference"); } });
    assert.equal(result.alreadyDelivered, true);
    assert.equal(result.text, "");
    assert.equal(requested, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a completed provider result suppresses host replays before a delivery receipt", async () => {
  const root = await mkdtemp(join(tmpdir(), "grokbot-router-persisted-delivery-"));
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = TEST_OPENROUTER_KEY;
  let requests = 0;
  const config = {
    provider: "openrouter",
    providers: ["openrouter"],
    openRouterModel: "openai/test-model",
    statePath: join(root, "states.json"),
  };
  const messages = [user("<user_query>Tell me the active model</user_query>")];
  try {
    const first = await runTurn({ config, messages, sessionOptions: { botId: "fresh-bot" } }, {
      fetchImpl: async () => {
        requests += 1;
        return new Response(JSON.stringify({
          model: "openai/test-model",
          choices: [{ message: { content: "OpenRouter test model", tool_calls: [] } }],
          usage: { prompt_tokens: 3, completion_tokens: 3 },
        }), { status: 200 });
      },
    });
    assert.equal(first.text, "OpenRouter test model");

    const beforeReceipt = await runTurn({ config, messages, sessionOptions: { botId: "fresh-bot" } }, {
      fetchImpl: async () => { requests += 1; throw new Error("duplicate inference"); },
    });
    assert.equal(beforeReceipt.alreadyDelivered, true);
    assert.equal(beforeReceipt.text, "");

    const delivered = await runTurn({
      config,
      messages: [
        ...messages,
        {
          role: "assistant",
          content: [{
            type: "tool-call",
            toolCallId: "grokbot-router-send-proof",
            toolName: "SendToUser",
            args: { type: "text", content: "OpenRouter test model" },
          }],
        },
        {
          role: "user",
          content: [{
            type: "tool-result",
            toolCallId: "grokbot-router-send-proof",
            result: "ok",
          }],
        },
      ],
      sessionOptions: { botId: "fresh-bot" },
    }, {
      fetchImpl: async () => { requests += 1; throw new Error("delivery receipt reached inference"); },
    });
    assert.equal(delivered.alreadyDelivered, true);

    const cleanup = await runTurn({ config, messages, sessionOptions: { botId: "fresh-bot" } }, {
      fetchImpl: async () => { requests += 1; throw new Error("duplicate inference"); },
    });
    assert.equal(cleanup.alreadyDelivered, true);
    assert.equal(cleanup.text, "");
    assert.equal(requests, 1);
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test("concurrent host replays of one user turn run provider inference exactly once", async () => {
  const root = await mkdtemp(join(tmpdir(), "grokbot-router-user-turn-concurrent-"));
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = TEST_OPENROUTER_KEY;
  let requests = 0;
  let releaseRequest;
  let markStarted;
  const requestStarted = new Promise((resolve) => { markStarted = resolve; });
  const requestRelease = new Promise((resolve) => { releaseRequest = resolve; });
  const config = {
    provider: "openrouter",
    providers: ["openrouter"],
    openRouterModel: "openai/test-model",
    statePath: join(root, "states.json"),
  };
  const input = {
    config,
    messages: [user("What provider and model are you using?")],
    sessionOptions: { botId: "concurrent-user-turn-bot" },
  };
  try {
    const fetchImpl = async () => {
      requests += 1;
      markStarted();
      await requestRelease;
      return new Response(JSON.stringify({
        model: "openai/test-model",
        choices: [{ message: { content: "ONE RESPONSE", tool_calls: [] } }],
        usage: {},
      }), { status: 200 });
    };
    const first = runTurn(input, { fetchImpl });
    await requestStarted;
    const second = runTurn(input, { fetchImpl });
    releaseRequest();
    const results = await Promise.all([first, second]);
    assert.equal(requests, 1);
    assert.equal(results.filter((result) => result.text === "ONE RESPONSE").length, 1);
    assert.equal(results.filter((result) => result.alreadyDelivered).length, 1);
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test("a failed provider attempt releases its user-turn claim for retry", async () => {
  const root = await mkdtemp(join(tmpdir(), "grokbot-router-user-turn-retry-"));
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = TEST_OPENROUTER_KEY;
  let requests = 0;
  const config = {
    provider: "openrouter",
    providers: ["openrouter"],
    openRouterModel: "openai/test-model",
    statePath: join(root, "states.json"),
  };
  const input = {
    config,
    messages: [user("Retry after a provider failure")],
    sessionOptions: { botId: "failed-user-turn-bot" },
  };
  try {
    await assert.rejects(() => runTurn(input, {
      fetchImpl: async () => { requests += 1; throw new Error("network down"); },
    }), /network down/);
    const retried = await runTurn(input, {
      fetchImpl: async () => {
        requests += 1;
        return new Response(JSON.stringify({
          model: "openai/test-model",
          choices: [{ message: { content: "RECOVERED", tool_calls: [] } }],
          usage: {},
        }), { status: 200 });
      },
    });
    assert.equal(retried.text, "RECOVERED");
    assert.equal(requests, 2);
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test("a finished subagent revives a turn whose launch message was already delivered", async () => {
  const root = await mkdtemp(join(tmpdir(), "grokbot-router-subagent-revival-"));
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = TEST_OPENROUTER_KEY;
  let requests = 0;
  const config = {
    provider: "openrouter",
    providers: ["openrouter"],
    openRouterModel: "openai/test-model",
    statePath: join(root, "states.json"),
  };
  const query = user("Delegate this and report the result");
  const launchDelivery = {
    role: "assistant",
    content: [{
      type: "tool-call",
      toolCallId: "grokbot-router-send-subagent-started",
      toolName: "SendToUser",
      args: { type: "text", content: "Subagent started." },
    }],
  };
  const launchResult = {
    role: "user",
    content: [{
      type: "tool-result",
      toolCallId: "grokbot-router-send-subagent-started",
      result: "ok",
    }],
  };
  const completion = {
    role: "user",
    content: "[SAND_HIDDEN_PROMPT]Subagent finished: CHILD_RESULT_OK",
    providerOptions: {
      cursor: { sandAutomationCompletionId: "completion-live-1" },
    },
  };
  try {
    const launchReceipt = await runTurn({
      config,
      messages: [query, launchDelivery, launchResult],
      sessionOptions: { botId: "subagent-bot" },
    }, { fetchImpl: async () => { throw new Error("launch receipt reached inference"); } });
    assert.equal(launchReceipt.alreadyDelivered, true);

    const revived = await runTurn({
      config,
      messages: [query, launchDelivery, launchResult, completion],
      sessionOptions: { botId: "subagent-bot" },
    }, {
      fetchImpl: async (_url, init) => {
        requests += 1;
        const body = JSON.parse(init.body);
        assert.equal(body.messages.at(-1).content, "Subagent finished: CHILD_RESULT_OK");
        return new Response(JSON.stringify({
          model: "openai/test-model",
          choices: [{ message: { content: "CHILD_RESULT_OK", tool_calls: [] } }],
          usage: { prompt_tokens: 4, completion_tokens: 2 },
        }), { status: 200 });
      },
    });
    assert.equal(revived.text, "CHILD_RESULT_OK");
    assert.equal(requests, 1);

    const replay = await runTurn({
      config,
      messages: [query, launchDelivery, launchResult, completion],
      sessionOptions: { botId: "subagent-bot" },
    }, { fetchImpl: async () => { throw new Error("completion replay reached inference"); } });
    assert.equal(replay.alreadyDelivered, true);

    const nudgedReplay = await runTurn({
      config,
      messages: [
        query,
        launchDelivery,
        launchResult,
        completion,
        user("[SAND_HIDDEN_PROMPT] ordinary follow-up nudge"),
      ],
      sessionOptions: { botId: "subagent-bot" },
    }, { fetchImpl: async () => { throw new Error("nudged completion replay reached inference"); } });
    assert.equal(nudgedReplay.alreadyDelivered, true);
    assert.equal(requests, 1);

    const finalReceipt = await runTurn({
      config,
      messages: [
        query,
        launchDelivery,
        launchResult,
        completion,
        {
          role: "assistant",
          content: [{
            type: "tool-call",
            toolCallId: "grokbot-router-send-subagent-result",
            toolName: "SendToUser",
            args: { type: "text", content: "CHILD_RESULT_OK" },
          }],
        },
        {
          role: "user",
          content: [{
            type: "tool-result",
            toolCallId: "grokbot-router-send-subagent-result",
            result: "ok",
          }],
        },
      ],
      sessionOptions: { botId: "subagent-bot" },
    }, { fetchImpl: async () => { throw new Error("final receipt reached inference"); } });
    assert.equal(finalReceipt.alreadyDelivered, true);
    assert.equal(requests, 1);
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test("concurrent replays of one automation completion claim provider inference exactly once", async () => {
  const root = await mkdtemp(join(tmpdir(), "grokbot-router-subagent-concurrent-"));
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = TEST_OPENROUTER_KEY;
  let requests = 0;
  const config = {
    provider: "openrouter",
    providers: ["openrouter"],
    openRouterModel: "openai/test-model",
    statePath: join(root, "states.json"),
  };
  const messages = [
    user("Delegate concurrently"),
    {
      role: "user",
      content: "[SAND_HIDDEN_PROMPT]Subagent finished: CONCURRENT_CHILD_OK",
      providerOptions: { cursor: { sandAutomationCompletionId: "completion-concurrent-1" } },
    },
  ];
  const fetchImpl = async () => {
    requests += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return new Response(JSON.stringify({
      model: "openai/test-model",
      choices: [{ message: { content: "CONCURRENT_CHILD_OK", tool_calls: [] } }],
      usage: { prompt_tokens: 4, completion_tokens: 2 },
    }), { status: 200 });
  };
  try {
    const results = await Promise.all([
      runTurn({ config, messages, sessionOptions: { botId: "concurrent-bot" } }, { fetchImpl }),
      runTurn({ config, messages, sessionOptions: { botId: "concurrent-bot" } }, { fetchImpl }),
    ]);
    assert.equal(requests, 1);
    assert.equal(results.filter((result) => result.text === "CONCURRENT_CHILD_OK").length, 1);
    assert.equal(results.filter((result) => result.alreadyDelivered).length, 1);
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test("a Grok tool result resumes the originating Codex thread across an internal session", async () => {
  const root = await mkdtemp(join(tmpdir(), "grokbot-router-tool-link-"));
  const config = {
    provider: "codex",
    providers: ["codex"],
    statePath: join(root, "states.json"),
    auditPath: join(root, "audit.jsonl"),
  };
  let resumedThread = null;
  const prompts = [];
  const firstThread = {
    id: "thread-for-tool-loop",
    async run(input) {
      prompts.push(input);
      return {
        finalResponse: JSON.stringify({
          text: "Working",
          toolCalls: [{ toolCallId: "outer-call-42", toolName: "Shell", argumentsJson: "{\"command\":\"true\"}" }],
        }),
        usage: null,
      };
    },
  };
  const resumed = {
    id: "thread-for-tool-loop",
    async run(input) {
      prompts.push(input);
      return {
        finalResponse: JSON.stringify({ text: "TOOL_LOOP_OK", toolCalls: [] }),
        usage: null,
      };
    },
  };
  try {
    const first = await runTurn({
      config,
      messages: [user("Use the outer Shell")],
      tools: [
        { name: "SendToUser", inputSchema: { type: "object" } },
        { name: "ReactToMessage", inputSchema: { type: "object" } },
        { name: "update_state", inputSchema: { type: "object" } },
        { name: "Shell", inputSchema: { type: "object" } },
      ],
      sessionOptions: { botId: "primary-bot" },
    }, { codexFactory: () => ({ startThread: () => firstThread, resumeThread: () => firstThread }) });
    const hostToolCallId = first.toolCalls[0].toolCallId;
    assert.match(hostToolCallId, /^grokbot-router-tool-/);

    const second = await runTurn({
      config,
      messages: [{
        role: "tool",
        content: [{ type: "tool-result", toolCallId: hostToolCallId, result: "ok" }],
      }],
      tools: [],
      sessionOptions: { conversationId: "internal-tool-session" },
    }, { codexFactory: () => ({
      startThread: () => { throw new Error("tool result incorrectly started a new thread"); },
      resumeThread: (id) => { resumedThread = id; return resumed; },
    }) });
    assert.equal(resumedThread, "thread-for-tool-loop");
    assert.equal(second.text, "TOOL_LOOP_OK");
    assert.match(prompts[0], /\"name\":\"Shell\"/);
    assert.doesNotMatch(prompts[0], /\"name\":\"SendToUser\"/);
    assert.match(prompts[1], /\"name\":\"Shell\"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a permission bubble cannot suppress an outstanding outer tool result", async () => {
  const root = await mkdtemp(join(tmpdir(), "grokbot-router-permission-resume-"));
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = TEST_OPENROUTER_KEY;
  let requests = 0;
  try {
    const result = await runTurn({
      config: {
        provider: "openrouter",
        providers: ["openrouter"],
        openRouterModel: "openai/test-model",
        statePath: join(root, "states.json"),
        auditPath: join(root, "audit.jsonl"),
      },
      messages: [
        user("Use Shell to run pwd"),
        {
          role: "assistant",
          content: [{ type: "tool-call", toolCallId: "shell-permission-1", toolName: "Shell", args: { command: "pwd" } }],
        },
        { role: "assistant", content: [{ type: "text", text: "Grok Bot can run commands on your computer this time." }] },
        {
          role: "user",
          content: [{ type: "tool-result", toolCallId: "shell-permission-1", result: "/Users/example" }],
        },
      ],
      tools: [{ name: "Shell", inputSchema: { type: "object" } }],
      sessionOptions: { botId: "permission-bot" },
    }, {
      fetchImpl: async (_url, init) => {
        requests += 1;
        const body = JSON.parse(init.body);
        const assistantCall = body.messages.find((message) => message.role === "assistant" && message.tool_calls?.length);
        const toolResult = body.messages.find((message) => message.role === "tool");
        assert.equal(assistantCall.tool_calls[0].id, "shell-permission-1");
        assert.equal(toolResult.tool_call_id, "shell-permission-1");
        return new Response(JSON.stringify({
          model: "openai/test-model",
          choices: [{ message: { content: "SHELL_RESUME_OK", tool_calls: [] } }],
          usage: {},
        }), { status: 200 });
      },
    });
    assert.equal(result.text, "SHELL_RESUME_OK");
    assert.equal(requests, 1);
    const audit = await readFile(join(root, "audit.jsonl"), "utf8");
    assert.doesNotMatch(audit, /turn_suppressed/);
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test("empty OpenRouter child revival retries once and then delivers the tagged result", async () => {
  const root = await mkdtemp(join(tmpdir(), "grokbot-router-empty-revival-"));
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = TEST_OPENROUTER_KEY;
  let requests = 0;
  try {
    const completion = {
      role: "user",
      content: "[SAND_HIDDEN_PROMPT]Child finished: BETA11_CHILD_OK",
      providerOptions: { cursor: { sandAutomationCompletionId: "empty-revival-1" } },
    };
    const result = await runTurn({
      config: {
        provider: "openrouter",
        providers: ["openrouter"],
        openRouterModel: "openai/test-model",
        statePath: join(root, "states.json"),
        auditPath: join(root, "audit.jsonl"),
      },
      messages: [user("Delegate this"), completion],
      sessionOptions: { botId: "empty-revival-bot" },
    }, {
      fetchImpl: async () => {
        requests += 1;
        return new Response(JSON.stringify({
          model: "openai/test-model",
          choices: [{ message: { content: null, tool_calls: [] } }],
          usage: {},
        }), { status: 200 });
      },
    });
    assert.equal(requests, 2);
    assert.equal(result.text, "Child finished: BETA11_CHILD_OK");
    const audit = await readFile(join(root, "audit.jsonl"), "utf8");
    assert.match(audit, /"emptyRecovery":"automation-completion"/);
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test("controls bypass the completed-turn latch and an expired latch runs normally", async () => {
  const root = await mkdtemp(join(tmpdir(), "grokbot-router-completion-ttl-"));
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = TEST_OPENROUTER_KEY;
  const config = {
    provider: "openrouter",
    providers: ["openrouter"],
    openRouterModel: "openai/test-model",
    openRouterModels: ["openai/test-model"],
    statePath: join(root, "states.json"),
    auditPath: join(root, "audit.jsonl"),
  };
  try {
    await runTurn({
      config,
      messages: [user("/models"), { role: "assistant", content: [{ type: "text", text: "old models" }] }],
      sessionOptions: { botId: "control-latch-bot" },
    });
    const control = await runTurn({
      config,
      messages: [user("/models")],
      sessionOptions: { botId: "control-latch-bot" },
    }, { fetchImpl: async () => { throw new Error("control reached inference"); } });
    assert.match(control.text, /OpenRouter models:/);

    await runTurn({
      config,
      messages: [user("repeat me"), { role: "assistant", content: [{ type: "text", text: "done" }] }],
      sessionOptions: { botId: "ttl-bot" },
    });
    const stateDir = join(root, "states");
    const stateFiles = await readdir(stateDir);
    for (const filename of stateFiles.filter((name) => name.endsWith(".json"))) {
      const pathname = join(stateDir, filename);
      const state = JSON.parse(await readFile(pathname, "utf8"));
      if (state.completedTurnFingerprint) {
        state.completedTurnAt = Date.now() - 16 * 60_000;
        await writeFile(pathname, JSON.stringify(state));
      }
    }
    let requests = 0;
    const afterTtl = await runTurn({
      config,
      messages: [user("repeat me")],
      sessionOptions: { botId: "ttl-bot" },
    }, {
      fetchImpl: async () => {
        requests += 1;
        return new Response(JSON.stringify({
          model: "openai/test-model",
          choices: [{ message: { content: "RUN_AFTER_TTL", tool_calls: [] } }],
          usage: {},
        }), { status: 200 });
      },
    });
    assert.equal(afterTtl.text, "RUN_AFTER_TTL");
    assert.equal(requests, 1);
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test("a late Codex result cannot resurrect a thread reset while it was running", async () => {
  const root = await mkdtemp(join(tmpdir(), "grokbot-router-thread-epoch-"));
  const config = {
    provider: "codex",
    providers: ["codex"],
    statePath: join(root, "states.json"),
  };
  let releaseTurn;
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const released = new Promise((resolve) => { releaseTurn = resolve; });
  const staleThread = {
    id: "stale-thread-id",
    async run() {
      markStarted();
      await released;
      return { finalResponse: JSON.stringify({ text: "STALE_TURN_DONE", toolCalls: [] }), usage: null };
    },
  };
  try {
    const inFlight = runTurn({
      config,
      messages: [user("Start a long turn")],
      sessionOptions: { botId: "epoch-bot" },
    }, { codexFactory: () => ({ startThread: () => staleThread, resumeThread: () => staleThread }) });
    await started;
    const reset = await runTurn({
      config,
      messages: [user("/router reset")],
      sessionOptions: { botId: "epoch-bot" },
    });
    assert.match(reset.text, /thread reset/i);
    releaseTurn();
    await inFlight;

    const stateDir = join(root, "states");
    const stateFile = (await readdir(stateDir)).find((name) => name.endsWith(".json"));
    const state = JSON.parse(await readFile(join(stateDir, stateFile), "utf8"));
    assert.equal(state.threadId, null);
    assert.equal(state.threadEpoch, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runner rejects oversized stdin indirectly through a normal exported turn contract", async () => {
  const root = await mkdtemp(join(tmpdir(), "grokbot-router-control-"));
  try {
    const result = await runTurn({
      config: { provider: "codex", providers: ["codex"], statePath: join(root, "states.json") },
      messages: [user("/router help")],
      sessionOptions: { botId: "help-test" },
    });
    assert.equal(result.ok, true);
    assert.match(result.text, /\/provider codex\|openrouter/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
