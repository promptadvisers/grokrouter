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
