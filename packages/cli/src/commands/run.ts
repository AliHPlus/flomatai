/**
 * flomatai run <pipeline-file> — execute a pipeline from a file.
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';
import type { Command } from 'commander';
import type { Orchestrator, BuiltPipeline } from '@flomatai/core';

export function registerRunCommand(program: Command, getOrchestrator: () => Orchestrator): void {
  program
    .command('run <pipeline>')
    .description('Execute a pipeline. <pipeline> is a path to a .js/.ts module exporting a { pipeline, orchestrator } or just pipeline.')
    .option('-i, --input <json>', 'Pipeline input as JSON string')
    .option('-f, --input-file <file>', 'Pipeline input from a file (JSON or text)')
    .option('--run-id <id>', 'Custom run ID')
    .option('--resume <runId>', 'Resume a previous run from its checkpoints')
    .option('--llm <key>', 'Override LLM provider key (default: "default")')
    .action(async (pipelinePath: string, options: Record<string, string>) => {
      const absPath = resolve(process.cwd(), pipelinePath);

      if (!existsSync(absPath)) {
        console.error(`[flomatai] Pipeline file not found: ${absPath}`);
        process.exit(1);
      }

      let pipelineModule: { pipeline?: BuiltPipeline; orchestrator?: Orchestrator; default?: BuiltPipeline };
      try {
        pipelineModule = await import(absPath);
      } catch (err) {
        console.error(`[flomatai] Failed to load pipeline: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }

      const pipeline: BuiltPipeline | undefined =
        pipelineModule.pipeline ?? pipelineModule.default;

      if (!pipeline || !pipeline.steps) {
        console.error('[flomatai] Module must export { pipeline } or a default BuiltPipeline');
        process.exit(1);
      }

      let input: unknown = {};

      if (options['inputFile']) {
        const raw = await readFile(resolve(process.cwd(), options['inputFile']), 'utf-8');
        try { input = JSON.parse(raw); }
        catch { input = raw; } // treat as plain text
      } else if (options['input']) {
        try { input = JSON.parse(options['input']); }
        catch { input = options['input']; }
      }

      const orchestrator = pipelineModule.orchestrator ?? getOrchestrator();

      console.log(`\n▶ Running pipeline "${pipeline.name}"\n`);

      try {
        const { output, run } = await orchestrator.run(pipeline, input, {
          runId: options['runId'],
          llm: options['llm'],
          resumeFromRunId: options['resume'],
        });

        console.log(`\n✓ Pipeline "${pipeline.name}" completed in ${run.durationMs}ms`);
        console.log(`  Run ID: ${run.id}`);
        console.log(`  Tokens: ${run.tokensUsed}`);
        console.log('\nOutput:');
        console.log(JSON.stringify(output, null, 2));
      } catch (err) {
        console.error(`\n✗ Pipeline failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
