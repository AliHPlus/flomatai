/**
 * Pipeline Registry — discover, load, and manage pipelines from various sources.
 *
 * This module provides:
 * - PipelineSource: define where a pipeline comes from (npm, local path, git)
 * - PipelineRegistry: local registry that maps names to sources
 * - loadPipeline(): resolve a source to a BuiltPipeline
 */

import { resolve } from 'path';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import type { BuiltPipeline } from './pipeline.js';
import type { ZodSchema } from 'zod';

// ── Pipeline Metadata ────────────────────────────────────────────────────────

/**
 * Metadata for a pipeline package.
 * Exported from the pipeline's main file.
 */
export interface PipelinePackageMeta {
  /** Unique name (e.g., 'content-generation') */
  name: string;
  /** Human-readable description */
  description: string;
  /** Semantic version */
  version?: string;
  /** Tags for discovery */
  tags?: string[];
  /** Author information */
  author?: string;
  /** Input schema (for display/documentation) */
  inputSchema?: ZodSchema;
  /** Output schema (for display/documentation) */
  outputSchema?: ZodSchema;
}

/**
 * Full pipeline export from a pipeline package.
 */
export interface PipelinePackageExports {
  /** The built pipeline */
  pipeline: BuiltPipeline;
  /** Optional metadata */
  metadata?: PipelinePackageMeta;
  /** Optional config schema for runtime validation */
  configSchema?: ZodSchema;
  /** Optional orchestrator override */
  orchestrator?: unknown;
}

// ── Pipeline Source ─────────────────────────────────────────────────────────

/** Where a pipeline is loaded from */
export type PipelineSource =
  | { type: 'npm'; package: string; export?: string }
  | { type: 'path'; path: string }
  | { type: 'git'; url: string; ref?: string };

/** Registered pipeline in the local registry */
export interface RegisteredPipeline {
  /** Local name (e.g., 'my-pipeline') */
  name: string;
  /** Source where the pipeline is loaded from */
  source: PipelineSource;
  /** Optional version constraint (for npm) */
  version?: string;
  /** When this was registered */
  registeredAt: Date;
  /** Cached loaded exports */
  exports?: PipelinePackageExports;
}

// ── Pipeline Registry ────────────────────────────────────────────────────────

/**
 * Local pipeline registry.
 * Maps friendly names to pipeline sources.
 */
export class PipelineRegistry {
  private readonly pipelines: Map<string, RegisteredPipeline> = new Map();
  private readonly pipelineDirs: string[] = [];

  constructor(pipelineDirs: string[] = []) {
    this.pipelineDirs = pipelineDirs;
  }

  /**
   * Register a pipeline from an npm package.
   */
  register(name: string, packageName: string, options?: { version?: string }): void {
    this.pipelines.set(name, {
      name,
      source: { type: 'npm', package: packageName },
      version: options?.version,
      registeredAt: new Date(),
    });
  }

  /**
   * Register a pipeline from a local path.
   */
  registerPath(name: string, path: string): void {
    this.pipelines.set(name, {
      name,
      source: { type: 'path', path: resolve(path) },
      registeredAt: new Date(),
    });
  }

  /**
   * Register a pipeline from a git repository.
   */
  registerGit(name: string, url: string, ref?: string): void {
    this.pipelines.set(name, {
      name,
      source: { type: 'git', url, ref },
      registeredAt: new Date(),
    });
  }

  /**
   * Get a registered pipeline by name.
   */
  get(name: string): RegisteredPipeline | undefined {
    return this.pipelines.get(name);
  }

  /**
   * List all registered pipelines.
   */
  list(): RegisteredPipeline[] {
    return Array.from(this.pipelines.values());
  }

  /**
   * Remove a pipeline from the registry.
   */
  unregister(name: string): boolean {
    return this.pipelines.delete(name);
  }

  /**
   * Clear all registrations.
   */
  clear(): void {
    this.pipelines.clear();
  }
}

// ── Pipeline Loader ─────────────────────────────────────────────────────────

/**
 * Load a pipeline from a source.
 */
export async function loadPipeline(source: PipelineSource): Promise<PipelinePackageExports> {
  switch (source.type) {
    case 'path':
      return loadFromPath(source.path);
    case 'npm':
      return loadFromNpm(source.package, source.export);
    case 'git':
      // TODO: Implement git loading (clone + package.json lookup)
      throw new Error('Git pipeline loading not yet implemented');
  }
}

/**
 * Load a pipeline from a local path.
 */
async function loadFromPath(absolutePath: string): Promise<PipelinePackageExports> {
  // Check if it's a directory (pipeline package) or a file
  const dirExists = existsSync(absolutePath);
  const fileExists = existsSync(absolutePath + '.ts') || existsSync(absolutePath + '.js');

  if (dirExists) {
    // It's a directory — look for pipeline.ts or package.json
    const pkgPath = resolve(absolutePath, 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
      const mainFile = resolve(absolutePath, pkg.main || pkg.exports?.['.'] || 'index.js');
      return import(mainFile) as Promise<PipelinePackageExports>;
    }
    const pipelinePath = resolve(absolutePath, 'pipeline.ts');
    if (existsSync(pipelinePath)) {
      return import(pipelinePath) as Promise<PipelinePackageExports>;
    }
    throw new Error(`No pipeline.ts or package.json found in ${absolutePath}`);
  }

  if (fileExists) {
    // Direct file import
    const ext = existsSync(absolutePath + '.ts') ? '.ts' : '.js';
    return import(absolutePath + ext) as Promise<PipelinePackageExports>;
  }

  throw new Error(`Pipeline not found at ${absolutePath}`);
}

/**
 * Load a pipeline from an npm package.
 * Note: This requires the package to be installed in node_modules.
 */
async function loadFromNpm(packageName: string, exportPath?: string): Promise<PipelinePackageExports> {
  try {
    const resolved = exportPath
      ? await import(`${packageName}/${exportPath}`)
      : await import(packageName);

    if (!resolved.pipeline) {
      throw new Error(`Package ${packageName} does not export a 'pipeline'`);
    }

    return resolved as PipelinePackageExports;
  } catch (err) {
    if (err instanceof Error && err.message.includes('package')) {
      throw new Error(`Pipeline package not found: ${packageName}. Did you install it?`);
    }
    throw err;
  }
}

// ── Registry Resolution ────────────────────────────────────────────────────────

/**
 * Create a registry from a config object.
 */
export function createRegistryFromConfig(
  config: Record<string, string | { package: string; version?: string }>,
): PipelineRegistry {
  const registry = new PipelineRegistry();

  for (const [name, source] of Object.entries(config)) {
    if (typeof source === 'string') {
      // Short form: 'my-pipeline': './path' or 'my-pipeline': '@org/pkg'
      if (source.startsWith('./') || source.startsWith('/')) {
        registry.registerPath(name, source);
      } else if (source.startsWith('git+') || source.startsWith('https://')) {
        const url = source.startsWith('git+') ? source : `git+${source}`;
        registry.registerGit(name, url);
      } else {
        // Assume npm package
        registry.register(name, source);
      }
    } else {
      // Long form: 'my-pipeline': { package: '@org/pkg', version: '1.0.0' }
      registry.register(name, source.package, { version: source.version });
    }
  }

  return registry;
}
