/**
 * flomatai workflow — run a local workflow by name.
 *
 * Looks for a workflows/ directory in the current project and runs
 * the specified workflow by name.
 */

import { Command } from 'commander';
import { spawn } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { resolve, join } from 'path';

function findWorkflowsDir(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    const workflowsDir = resolve(dir, 'workflows');
    if (existsSync(workflowsDir) && readdirSync(workflowsDir).some(f => existsSync(resolve(workflowsDir, f, 'package.json')))) {
      return workflowsDir;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function registerRunWorkflowCommand(program: Command): void {
  program
    .command('workflow <name>')
    .description('Run a local workflow by name from the workflows/ directory')
    .option('-f, --file <path>', 'Input file to pass to the workflow')
    .option('-r, --resume <run-id>', 'Resume from a failed run checkpoint')
    .option('-p, --phase <phases>', 'Run only services in these phases (e.g. 0 or 0,1,2)')
    .option('-w, --watch', 'Auto-start flomatai watch after running')
    .option('-d, --dir <path>', 'Path to workflows directory (auto-detected)')
    .action(async (name: string, options: Record<string, string | boolean>) => {
      let workflowsDir: string | undefined = options['dir'] as string | undefined;

      if (!workflowsDir) {
        workflowsDir = findWorkflowsDir(process.cwd()) ?? undefined;
      }

      if (!workflowsDir) {
        console.error('[flomatai] Error: No workflows/ directory found.');
        console.error('');
        console.error('Create a workflows/ directory with your pipeline scripts:');
        console.error('  workflows/');
        console.error('  ├── planning/');
        console.error('  │   ├── src/run.ts');
        console.error('  │   └── package.json');
        console.error('  └── implementation/');
        console.error('      ├── src/run.ts');
        console.error('      └── package.json');
        console.error('');
        console.error('Then run: flomatai workflow <name>');
        process.exit(1);
      }

      const workflowDir = resolve(workflowsDir, name);
      if (!existsSync(workflowDir)) {
        console.error(`[flomatai] Error: Workflow '${name}' not found in ${workflowsDir}`);
        console.error(`Available workflows: ${readdirSync(workflowsDir).filter(f => existsSync(resolve(workflowsDir, f, 'package.json'))).join(', ')}`);
        process.exit(1);
      }

      const runScript = resolve(workflowDir, 'dist/src/run.js');
      if (!existsSync(runScript)) {
        console.error(`[flomatai] Error: ${runScript} not found. Run 'pnpm build' in ${workflowDir}`);
        process.exit(1);
      }

      const runArgs: string[] = [];
      if (options['file']) {
        runArgs.push('--file', options['file'] as string);
      }
      if (options['phase']) {
        runArgs.push('--phase', options['phase'] as string);
      }
      if (options['resume']) {
        runArgs.push('--resume', options['resume'] as string);
      }

      console.log(`[flomatai] Running workflow: ${name}`);
      console.log(`[flomatai] Workflow dir: ${workflowDir}`);

      const env = { ...process.env };
      const envFile = resolve(workflowDir, '..', '..', '.env');
      const envFileArg = existsSync(envFile) ? [`--env-file=${envFile}`] : [];
      if (envFileArg.length) {
        console.log(`[flomatai] Loading environment from: ${envFile}`);
      }

      const child = spawn('node', [...envFileArg, 'dist/src/run.js', ...runArgs], {
        cwd: workflowDir,
        env,
        stdio: 'inherit',
      });

      child.on('close', (code) => {
        if (code === 0) {
          console.log(`\n[flomatai] Workflow '${name}' completed successfully.`);
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
          console.error(`\n[flomatai] Workflow '${name}' failed with exit code ${code}`);
          process.exit(code ?? 1);
        }
      });

      child.on('error', (err) => {
        console.error(`[flomatai] Failed to start workflow: ${err.message}`);
        process.exit(1);
      });
    });
}
