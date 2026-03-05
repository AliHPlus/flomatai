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
 *   2. `envVar` environment variable (if provided)
 *   3. stdin (when not a TTY)
 *   4. `fallback` string (demo/default content)
 *
 * Logs a one-line message indicating which source was used.
 *
 * @param options.envVar   Environment variable name to check (e.g. 'DOCS').
 * @param options.fallback Demo text to use when no other source is available.
 * @param options.label    Human-readable name for the input (e.g. 'documentation').
 *                         Used in log messages. Defaults to 'input'.
 */
export async function readTextInput(options: {
  envVar?: string;
  fallback?: string;
  label?: string;
}): Promise<string> {
  const { envVar, fallback = '', label = 'input' } = options;

  const filePath = getArg('--file');
  if (filePath) {
    const { readFile } = await import('fs/promises');
    const text = await readFile(filePath, 'utf-8');
    console.log(`Reading ${label} from: ${filePath}`);
    return text;
  }

  if (envVar && process.env[envVar]) {
    console.log(`Reading ${label} from ${envVar} env var`);
    return process.env[envVar]!;
  }

  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    console.log(`Reading ${label} from stdin`);
    return Buffer.concat(chunks).toString('utf-8');
  }

  console.log(`Using demo ${label} (pass --file <path> for real ${label})`);
  return fallback;
}
