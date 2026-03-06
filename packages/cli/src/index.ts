#!/usr/bin/env node
/**
 * @flomatai/cli — flomatai command-line interface.
 *
 * Commands:
 *   flomatai run <pipeline>      Execute a pipeline from a module file
 *   flomatai run-workflow <name> Run a local workflow from workflows/ directory
 *   flomatai list                List recent pipeline runs
 *   flomatai inspect <runId>     Inspect a specific run
 *   flomatai watch                Watch a running pipeline
 *   flomatai resume <runId>      Resume a failed run from checkpoints
 */

import { Command } from 'commander';
import { Orchestrator, MemoryStore } from '@flomatai/core';
import { registerRunCommand } from './commands/run.js';
import { registerInspectCommand } from './commands/inspect.js';
import { registerListCommand } from './commands/list.js';
import { registerPipelineCommands } from './commands/pipeline.js';
import { registerWatchCommand } from './commands/watch.js';
import { registerRunWorkflowCommand } from './commands/run-workflow.js';

const VERSION = '0.1.0';

const program = new Command();

program
  .name('flomatai')
  .description('flomatai — code-first AI automation framework')
  .version(VERSION);

// Lazy orchestrator: loaded from flomatai.config.{js,ts,mjs} in cwd if present
let _orchestrator: Orchestrator | null = null;

async function getOrchestrator(): Promise<Orchestrator> {
  if (_orchestrator) return _orchestrator;

  const configPaths = [
    'flomatai.config.js',
    'flomatai.config.mjs',
  ];

  for (const configPath of configPaths) {
    try {
      const { default: config } = await import(`${process.cwd()}/${configPath}`);
      if (config instanceof Orchestrator) {
        _orchestrator = config;
        return _orchestrator;
      }
    } catch { /* not found, try next */ }
  }

  // Fallback: minimal orchestrator with no providers (useful for inspect/list)
  _orchestrator = new Orchestrator({
    llm: {},
    state: new MemoryStore(),
  });
  return _orchestrator;
}

// Register commands
const lazyGet = () => {
  if (!_orchestrator) {
    throw new Error('Orchestrator not loaded. Run a pipeline first or add flomatai.config.js');
  }
  return _orchestrator;
};

registerRunCommand(program, lazyGet);
registerInspectCommand(program, lazyGet);
registerListCommand(program, lazyGet);
registerWatchCommand(program, lazyGet);
registerPipelineCommands(program);
registerRunWorkflowCommand(program);

// Shorthand: flomatai resume <runId> <pipeline>
program
  .command('resume <runId> <pipeline>')
  .description('Resume a failed pipeline run from its last checkpoint.')
  .action(async (runId: string, pipelinePath: string) => {
    // Delegate to run command with --resume flag
    process.argv = [
      ...process.argv.slice(0, 2),
      'run',
      pipelinePath,
      '--resume',
      runId,
    ];
    await program.parseAsync(process.argv);
  });

// Parse
await program.parseAsync(process.argv);
