/**
 * cli-utils — lightweight CLI argument and input helpers.
 *
 * Extracted from the repeated boilerplate found in every example's run.ts.
 * Covers the three patterns used across all examples:
 *   • Named flag parsing:  --flag value
 *   • Boolean flag check:  --flag
 *   • Text input reading:  --file path | stdin | env var | fallback string
 */

/**
 * Parse a named CLI flag and return its value.
 *
 * @example getArg('--topic')  // node run.js --topic "foo" → "foo"
 */
export function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

/**
 * Check whether a boolean CLI flag is present.
 *
 * @example hasFlag('--mock')  // node run.js --mock → true
 */
export function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

/**
 * Read a text document from the first available source:
 *   1. `--file <path>` CLI flag
 *   2. `fileEnvVar` environment variable containing a file path (e.g. 'DOCS_FILE')
 *   3. `envVar` environment variable containing the content (e.g. 'DOCS')
 *   4. stdin (when not a TTY)
 *   5. `fallback` string (demo/default content)
 *
 * Logs a one-line message indicating which source was used.
 *
 * @param options.envVar     Environment variable name holding content (e.g. 'DOCS').
 * @param options.fileEnvVar Environment variable name holding a file path (e.g. 'DOCS_FILE').
 * @param options.fallback   Demo text to use when no other source is available.
 * @param options.label      Human-readable name for the input (e.g. 'documentation').
 */
export async function readTextInput(options: {
  envVar?: string;
  fileEnvVar?: string;
  fallback?: string;
  label?: string;
}): Promise<string> {
  const { envVar, fileEnvVar, fallback = '', label = 'input' } = options;
  const { readFile } = await import('fs/promises');

  const filePath = getArg('--file');
  if (filePath) {
    const resolved = filePath.replace(/^~/, process.env['HOME'] ?? '');
    const text = await readFile(resolved, 'utf-8');
    console.log(`Reading ${label} from: ${resolved}`);
    return text;
  }

  if (fileEnvVar && process.env[fileEnvVar]) {
    const resolved = process.env[fileEnvVar]!.replace(/^~/, process.env['HOME'] ?? '');
    console.log(`Reading ${label} from: ${resolved}`);
    const text = await readFile(resolved, 'utf-8');
    return text;
  }

  if (envVar && process.env[envVar]) {
    console.log(`Reading ${label} from ${envVar} env var`);
    return process.env[envVar]!;
  }

  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    const stdinText = Buffer.concat(chunks).toString('utf-8').trim();
    if (stdinText) {
      console.log(`Reading ${label} from stdin`);
      return stdinText;
    }
    // stdin was connected but empty — fall through to demo
  }

  console.log(`Using demo ${label} (pass --file <path> for real ${label})`);
  return fallback;
}
