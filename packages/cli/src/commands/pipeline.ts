/**
 * flomatai pipeline — manage pipelines (list, inspect, install).
 */

import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { PipelineRegistry, loadPipeline } from '@flomatai/core';

const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '.';
const FLOMATAI_DIR = join(HOME_DIR, '.flomatai');
const REGISTRY_FILE = join(FLOMATAI_DIR, 'registry.json');

// ── Registry Persistence ───────────────────────────────────────────────────

function loadRegistry(): PipelineRegistry {
  const registry = new PipelineRegistry();

  // Load from user registry file
  if (existsSync(REGISTRY_FILE)) {
    try {
      const data = JSON.parse(readFileSync(REGISTRY_FILE, 'utf-8'));
      for (const [name, entry] of Object.entries(data)) {
        const e = entry as { source: { type: string; package?: string; path?: string; url?: string; ref?: string } };
        if (e.source.type === 'npm') {
          registry.register(name, e.source.package!);
        } else if (e.source.type === 'path') {
          registry.registerPath(name, e.source.path!);
        } else if (e.source.type === 'git') {
          registry.registerGit(name, e.source.url!, e.source.ref);
        }
      }
    } catch { /* ignore corrupted registry */ }
  }

  // Load from project config (flomatai.config.js)
  loadProjectConfig(registry);

  return registry;
}

function loadProjectConfig(registry: PipelineRegistry): void {
  const projectConfigPaths = [
    'flomatai.config.js',
    'flomatai.config.mjs',
    'flomatai.config.ts',
  ];

  for (const configPath of projectConfigPaths) {
    try {
      const absPath = resolve(process.cwd(), configPath);
      if (existsSync(absPath)) {
        // Dynamic import - needs to be sync or handled differently
        // For now, we'll skip project config loading in sync context
        // and rely on the config file being loaded at runtime
        break;
      }
    } catch { /* ignore */ }
  }
}

function saveRegistry(registry: PipelineRegistry): void {
  const data: Record<string, { source: { type: string; package?: string; path?: string; url?: string; ref?: string } }> = {};

  for (const p of registry.list()) {
    if (p.source.type === 'npm') {
      data[p.name] = { source: { type: 'npm', package: p.source.package } };
    } else if (p.source.type === 'path') {
      data[p.name] = { source: { type: 'path', path: p.source.path } };
    } else if (p.source.type === 'git') {
      data[p.name] = { source: { type: 'git', url: p.source.url, ref: p.source.ref } };
    }
  }

  if (!existsSync(FLOMATAI_DIR)) {
    mkdirSync(FLOMATAI_DIR, { recursive: true });
  }
  writeFileSync(REGISTRY_FILE, JSON.stringify(data, null, 2));
}

// ── Commands ────────────────────────────────────────────────────────────────

export function registerPipelineCommands(program: Command): void {
  const pipeline = program
    .command('pipeline')
    .description('Manage pipelines (list, inspect, install)');

  // flomatai pipeline list
  pipeline
    .command('list')
    .description('List all registered pipelines')
    .action(async () => {
      const registry = loadRegistry();
      const pipelines = registry.list();

      if (pipelines.length === 0) {
        console.log('No pipelines registered.');
        console.log('\nAdd pipelines to flomatai.config.js:');
        console.log(`  export default {
  pipelines: {
    my: './path/to/pipeline',
    other: '@org/other-pipeline',
  }
}`);
        return;
      }

      console.log(`\nRegistered pipelines (${pipelines.length}):\n`);
      console.log('  Name         Source                  ');
      console.log('  ───────────  ────────────────────────');

      for (const p of pipelines) {
        let source = '';
        if (p.source.type === 'npm') {
          source = `npm: ${p.source.package}`;
        } else if (p.source.type === 'path') {
          source = `path: ${p.source.path}`;
        } else if (p.source.type === 'git') {
          source = `git: ${p.source.url}${p.source.ref ? '#' + p.source.ref : ''}`;
        }
        console.log(`  ${p.name.padEnd(12)} ${source}`);
      }
      console.log('');
    });

  // flomatai pipeline inspect <name>
  pipeline
    .command('inspect <name>')
    .description('Show details about a pipeline')
    .action(async (name: string) => {
      const registry = loadRegistry();
      const registered = registry.get(name);

      if (!registered) {
        console.error(`Pipeline not found: ${name}`);
        console.log('\nRun "flomatai pipeline list" to see available pipelines.');
        process.exit(1);
      }

      try {
        const exports = await loadPipeline(registered.source);

        console.log(`\n=== Pipeline: ${name} ===\n`);

        if (exports.metadata) {
          console.log(`Description: ${exports.metadata.description}`);
          console.log(`Version:     ${exports.metadata.version || 'n/a'}`);
          if (exports.metadata.tags?.length) {
            console.log(`Tags:        ${exports.metadata.tags.join(', ')}`);
          }
          if (exports.metadata.author) {
            console.log(`Author:      ${exports.metadata.author}`);
          }
        }

        console.log(`\nSource: ${registered.source.type} ${
          registered.source.type === 'npm' ? registered.source.package :
          registered.source.type === 'path' ? registered.source.path :
          registered.source.url + (registered.source.ref ? '#' + registered.source.ref : '')
        }`);

        console.log(`\nPipeline: ${exports.pipeline.name}`);
        console.log(`Steps: ${exports.pipeline.steps.length}`);

        for (const step of exports.pipeline.steps) {
          console.log(`  - ${step.name} (${step.kind})`);
        }

        if (exports.configSchema) {
          console.log('\nConfig schema:');
          console.log(`  ${exports.configSchema}`);
        }

        console.log('');
      } catch (err) {
        console.error(`Failed to load pipeline: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  // flomatai pipeline install <source>
  pipeline
    .command('install <source>')
    .description('Install a pipeline (npm package, local path, or git repository)')
    .option('-n, --name <name>', 'Local name for the pipeline (defaults to package name)')
    .option('-g, --global', 'Install to user-wide registry (~/.flomatai/registry.json)', false)
    .action(async (source: string, options: { name?: string; global?: boolean }) => {
      const registry = loadRegistry();

      // Determine the name
      let name = options.name || '';

      if (source.startsWith('./') || source.startsWith('/')) {
        // Local path
        if (!name) {
          name = source.split('/').pop() || 'local-pipeline';
        }
        registry.registerPath(name, source);
        console.log(`✓ Registered "${name}" from path: ${source}`);
      } else if (source.startsWith('git+') || source.startsWith('https://')) {
        // Git
        if (!name) {
          const parts = source.split('/');
          name = parts[parts.length - 1]?.replace('.git', '') || 'git-pipeline';
        }
        const url = source.startsWith('git+') ? source : `git+${source}`;
        registry.registerGit(name, url);
        console.log(`✓ Registered "${name}" from git: ${url}`);
      } else {
        // npm package
        if (!name) {
          name = source.replace(/^@/, '').replace(/\//, '-');
        }
        registry.register(name, source);
        console.log(`✓ Registered "${name}" from npm: ${source}`);
        console.log('\nNote: Run "npm install" or "pnpm add" in your project to install the package.');
      }

      saveRegistry(registry);
    });

  // flomatai pipeline uninstall <name>
  pipeline
    .command('uninstall <name>')
    .description('Remove a pipeline from the registry')
    .action((name: string) => {
      const registry = loadRegistry();

      if (!registry.get(name)) {
        console.error(`Pipeline not found: ${name}`);
        process.exit(1);
      }

      registry.unregister(name);
      saveRegistry(registry);
      console.log(`✓ Removed pipeline: ${name}`);
    });
}
