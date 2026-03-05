/**
 * Skill: discover-files
 *
 * Walks a source directory and discovers all files matching a pattern.
 * Returns a list of file records ready for translation.
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join, extname, relative } from 'path';
import { z } from 'zod';
import { TransformSkill } from '@flomatai/core';

export const FileRecordSchema = z.object({
  path: z.string(),          // absolute path
  relativePath: z.string(),  // relative to source root
  extension: z.string(),
  sizeBytes: z.number(),
  content: z.string(),
});

export type FileRecord = z.infer<typeof FileRecordSchema>;

export const discoverFilesSkill = TransformSkill.create({
  name: 'discover-files',
  description: 'Discovers and reads source files for translation',
  inputSchema: z.object({
    sourceDir: z.string(),
    extensions: z.array(z.string()),  // e.g. ['.py', '.js']
    excludePatterns: z.array(z.string()).optional(),  // e.g. ['__pycache__', '.git']
    maxFileSizeKb: z.number().optional(),
  }),
  outputSchema: z.object({
    files: z.array(FileRecordSchema),
    totalFiles: z.number(),
    totalSizeBytes: z.number(),
    sourceDir: z.string(),
  }),

  transform: async (input) => {
    const {
      sourceDir,
      extensions,
      excludePatterns = ['__pycache__', '.git', 'node_modules', 'dist', '.pyc'],
      maxFileSizeKb = 100,
    } = input;

    const files: FileRecord[] = [];

    async function walk(dir: string): Promise<void> {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        // Skip excluded patterns
        if (excludePatterns.some((p) => entry.name.includes(p))) continue;

        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase();
          if (!extensions.includes(ext)) continue;

          const fileStat = await stat(fullPath);
          const sizeKb = fileStat.size / 1024;
          if (sizeKb > maxFileSizeKb) continue;

          const content = await readFile(fullPath, 'utf-8');
          files.push({
            path: fullPath,
            relativePath: relative(sourceDir, fullPath),
            extension: ext,
            sizeBytes: fileStat.size,
            content,
          });
        }
      }
    }

    await walk(sourceDir);

    return {
      files,
      totalFiles: files.length,
      totalSizeBytes: files.reduce((n, f) => n + f.sizeBytes, 0),
      sourceDir,
    };
  },
});
