/**
 * Research Agent — test runner using MockLLMProvider.
 *
 * The ReAct loop is configured to finish immediately using the mock.
 */

import { Orchestrator, MemoryStore, createTestLLM, MockResponse } from '@flomatai/core';
import { createResearchAgent } from './agent.js';
import { logger } from '@flomatai/core';

async function runTest() {
  console.log('=== Research Agent — Test ===\n');

  // Override: first thought → search, second thought → synthesize, third → finish
  const overrides: MockResponse[] = [
    {
      match: /what do you do next/i,
      response: JSON.stringify({
        thought: 'I should search for information about this topic first.',
        action: {
          type: 'use_skill',
          skill: 'search-web',
          input: { query: 'AI impact on software development', maxResults: 3 },
        },
      }),
      times: 1,
    },
    {
      match: /what do you do next/i,
      response: JSON.stringify({
        thought: 'I have enough facts. I will now synthesize the final report.',
        action: {
          type: 'use_skill',
          skill: 'synthesize-report',
          input: {
            topic: 'AI impact on software development',
            allFacts: [
              { facts: ['AI coding tools reduce debugging time by 30-40%', 'GitHub Copilot accepted by 55% of developers'], sourceUrl: 'https://example.com', relevanceScore: 0.9 },
            ],
            searchesPerformed: ['AI impact on software development'],
          },
        },
      }),
      times: 1,
    },
    {
      // After synthesize runs, the next thought should finish the agent
      match: /what do you do next/i,
      response: JSON.stringify({
        thought: 'The report has been synthesized. I am done.',
        action: {
          type: 'finish',
          output: {
            title: 'AI Impact on Software Development',
            summary: 'AI tools are significantly transforming software development workflows.',
            findings: [
              { section: 'Productivity', content: 'AI coding tools reduce debugging time by 30-40%.' },
            ],
            sourcesUsed: ['https://example.com'],
            confidence: 'medium',
            gaps: ['More longitudinal studies needed'],
          },
        },
      }),
    },
  ];

  const llm = createTestLLM(overrides);
  const agentLogger = logger.child('test');

  const agent = createResearchAgent(5);
  const ctx = agent.createContext({
    llmRegistry: { default: llm },
    state: new MemoryStore(),
    logger: agentLogger,
    runId: `test-${Date.now()}`,
    emit: () => {},
  });

  const result = await agent.run({
    topic: 'AI impact on software development',
    maxSources: 2,
  }, ctx);

  console.log('\n✓ Agent completed');
  console.log(`  Tokens:    ${result.tokensUsed}`);
  console.log(`  Trace:     ${result.trace.length} steps`);
  console.log(`  Output:    ${JSON.stringify(result.output).substring(0, 150)}...`);

  if (!result.output) throw new Error('no output from agent');

  console.log('\n✅ All assertions passed');
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
