/**
 * flomatai implementation — run the verlivo implementation workflow.
 *
 * Auto-detects verlivo-flomatai project and runs the implementation pipeline.
 */

import { Command } from 'commander';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

function findVerlivoRoot(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (existsSync(resolve(dir, '1_verlivo-implementation')) && existsSync(resolve(dir, '.env'))) {
      return dir;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function findVerlivoRootFromCwd(): string | null {
  return findVerlivoRoot(process.cwd());
}

export function registerImplementationCommand(program: Command): void {
  program
    .command('implementation')
    .description('Run the verlivo implementation workflow')
    .option('-f, --file <path>', 'Input planning file (default: demo docs)')
    .option('-r, --resume <run-id>', 'Resume from a failed run checkpoint')
    .option('-w, --watch', 'Auto-start flomatai watch after running')
    .option('-p, --project <path>', 'Path to verlivo-flomatai project (auto-detected)')
    .action(async (options: Record<string, string | boolean>) => {
      let projectPath: string | undefined = options['project'] as string | undefined;

      if (!projectPath) {
        projectPath = findVerlivoRootFromCwd() ?? undefined;
      }

      if (!projectPath) {
        console.error('[flomatai] Error: Not in a verlivo-flomatai project.');
        console.error('');
        console.error('Usage:');
        console.error('  flomatai implementation                    # from verlivo-flomatai/');
        console.error('  flomatai implementation --project /path    # specify project path');
        console.error('');
        console.error('Or run manually:');
        console.error('  cd verlivo-flomatai/1_verlivo-implementation && pnpm start');
        process.exit(1);
      }

      const workflowDir = resolve(projectPath, '1_verlivo-implementation');
      if (!existsSync(workflowDir)) {
        console.error(`[flomatai] Error: 1_verlivo-implementation not found in ${projectPath}`);
        process.exit(1);
      }

      const runArgs: string[] = [];
      if (options['file']) {
        runArgs.push('--file', options['file'] as string);
      }
      if (options['resume']) {
        runArgs.push('--resume', options['resume'] as string);
      }

      console.log(`[flomatai] Running implementation workflow in ${workflowDir}`);
      console.log(`[flomatai] Project root: ${projectPath}`);

      const env = { ...process.env };

      const child = spawn('node', ['--env-file=../.env', 'dist/src/run.js', ...runArgs], {
        cwd: workflowDir,
        env,
        stdio: 'inherit',
      });

      child.on('close', (code) => {
        if (code === 0) {
          console.log('\n[flomatai] Implementation workflow completed successfully.');
          if (options['watch']) {
            console.log('[flomatai] Starting watch mode...');
            spawn('npx', ['flomatai', 'watch'], {
              cwd: workflowDir,
              stdio: 'inherit',
              shell: true,
            });
          }
          process.exit(0);
        } else {
          console.error(`\n[flomatai] Implementation workflow failed with exit code ${code}`);
          process.exit(code ?? 1);
        }
      });

      child.on('error', (err) => {
        console.error(`[flomatai] Failed to start workflow: ${err.message}`);
        process.exit(1);
      });
    });
}
