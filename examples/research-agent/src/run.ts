/**
 * Research Agent — runner script.
 *
 * Usage:
 *   node dist/src/run.js --topic "The impact of LLMs on software development"
 *   node dist/src/run.js --topic "Quantum computing current state 2024" --max-iter 12
 *   node dist/src/run.js --topic "..." --output ./report.md
 */

import { writeFile } from 'fs/promises';
import { Orchestrator, MemoryStore, logger, getArg } from '@flomatai/core';
import { resolveLLMFromEnv } from '@flomatai/helpers';
import { createResearchAgent } from './agent.js';
import type { ResearchReport } from '../skills/synthesize-report.js';

async function main() {
  const topic = getArg('--topic') ?? process.env['TOPIC'];
  if (!topic) {
    console.error('Error: --topic <topic> is required');
    console.error('Example: node dist/src/run.js --topic "The impact of AI on software development"');
    process.exit(1);
  }

  const maxIterStr = getArg('--max-iter') ?? process.env['MAX_ITERATIONS'] ?? '8';
  const maxIterations = parseInt(maxIterStr, 10);
  const outputPath = getArg('--output') ?? process.env['OUTPUT'];

  const llm = resolveLLMFromEnv({ temperature: 0.2, maxTokens: 3000 });
  const llmRegistry = { default: llm };
  const state = new MemoryStore();
  const agentLogger = logger.child('research-agent');

  console.log(`\n▶ Research Agent — "${topic}"`);
  console.log(`  Max iterations: ${maxIterations}`);
  console.log(`  Strategy: ReAct (Thought → Action → Observation)\n`);

  const agent = createResearchAgent(maxIterations);
  const runId = `research-${Date.now()}`;

  const ctx = agent.createContext({
    llmRegistry,
    state,
    logger: agentLogger,
    runId,
    emit: () => {},
  });

  const startMs = Date.now();

  try {
    const result = await agent.run({ topic, maxSources: parseInt(process.env['MAX_SOURCES'] ?? '5', 10) }, ctx);

    const elapsed = Date.now() - startMs;
    console.log(`\n✓ Research complete in ${elapsed}ms (${result.tokensUsed} tokens, ${result.trace.length} steps)`);

    // Display trace summary
    console.log('\n── Reasoning Trace ────────────────────────────────────');
    for (const entry of result.trace) {
      if (entry.type === 'thought') {
        console.log(`\n[Step ${(entry.iteration ?? 0) + 1}] THINK: ${String(entry.content).substring(0, 120)}...`);
      } else if (entry.type === 'action') {
        console.log(`        ACT:   ${entry.skill}(${JSON.stringify(entry.input).substring(0, 80)})`);
      } else if (entry.type === 'reflection') {
        console.log(`        REFLECT: ${String(entry.content).substring(0, 100)}...`);
      } else if (entry.type === 'finish') {
        console.log(`\n[FINISH] Done.`);
      }
    }
    console.log('────────────────────────────────────────────────────────');

    const report = result.output as ResearchReport;

    const markdown = [
      `# ${report.title}`,
      '',
      `> Researched by flomatai research-agent | ${new Date().toLocaleDateString()} | Confidence: ${report.confidence.toUpperCase()}`,
      '',
      '## Summary',
      '',
      report.summary,
      '',
      ...report.findings.flatMap((f) => [
        `## ${f.section}`,
        '',
        f.content,
        '',
      ]),
      ...(report.gaps.length > 0 ? [
        '## Research Gaps',
        '',
        ...report.gaps.map((g) => `- ${g}`),
        '',
      ] : []),
      '## Sources',
      '',
      ...report.sourcesUsed.map((s) => `- ${s}`),
    ].join('\n');

    if (outputPath) {
      await writeFile(outputPath, markdown, 'utf-8');
      console.log(`\n✓ Report saved: ${outputPath}`);
    } else {
      console.log('\n── Research Report ────────────────────────────────────');
      console.log(markdown);
      console.log('────────────────────────────────────────────────────────');
    }
  } catch (err) {
    const elapsed = Date.now() - startMs;
    console.error(`\n✗ Agent failed after ${elapsed}ms:`, err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main().catch(console.error);
