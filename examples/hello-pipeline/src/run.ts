/**
 * Hello Pipeline — CLI runner.
 *
 * Run: node dist/src/run.js --name FlomatAI
 */

import { Orchestrator, MemoryStore, logger, getArg, createConsoleHooks } from '@flomatai/core';
import { resolveLLMFromEnv } from '@flomatai/helpers';
import { pipeline, configSchema } from './pipeline.js';

async function main() {
  const name = getArg('--name') ?? 'World';
  const greeting = getArg('--greeting') ?? 'Hello';
  const repeat = parseInt(getArg('--repeat') ?? '1', 10);
  const uppercase = getArg('--uppercase') === 'true' || getArg('--uppercase') === '1';

  console.log(`\n▶ Running hello-pipeline`);
  console.log(`  name: ${name}`);
  console.log(`  greeting: ${greeting}`);
  console.log(`  repeat: ${repeat}`);
  console.log(`  uppercase: ${uppercase}\n`);

  const orchestrator = new Orchestrator({
    llm: { default: resolveLLMFromEnv() },
    state: new MemoryStore(),
    hooks: createConsoleHooks('hello-pipeline'),
  });

  try {
    const { output, run } = await orchestrator.run<{ message: string }>(pipeline, { name });

    console.log(`\n✓ Pipeline completed in ${run.durationMs}ms\n`);
    console.log('Output:', output.message);
    console.log('');
  } catch (err) {
    console.error(`\n✗ Pipeline failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();
