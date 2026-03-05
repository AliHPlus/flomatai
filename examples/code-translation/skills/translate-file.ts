/**
 * Skill: translate-file
 *
 * Translates a single source file to the target language.
 * Preserves intent, logic, and documentation while adapting idioms.
 */

import { z } from 'zod';
import { LLMSkill } from '@flomatai/core';

export const TranslatedFileSchema = z.object({
  sourceFile: z.string(),
  targetFile: z.string(),
  translatedCode: z.string(),
  linesOfCode: z.number(),
  notes: z.string().optional(),
  warnings: z.array(z.string()).optional(),
});

export type TranslatedFile = z.infer<typeof TranslatedFileSchema>;

export const translateFileSkill = LLMSkill.create({
  name: 'translate-file',
  description: 'Translates a single source file to the target programming language',
  llm: 'default',

  inputSchema: z.object({
    sourceFile: z.string(),
    targetFile: z.string(),
    sourceLanguage: z.string(),
    targetLanguage: z.string(),
    sourceCode: z.string(),
    notes: z.string().optional(),
    generalNotes: z.string().optional(),
  }),
  outputSchema: TranslatedFileSchema,

  systemMessage: `You are an expert code translator. Translate code while:
- Preserving all logic and functionality exactly
- Using idiomatic patterns for the target language
- Converting language-specific constructs appropriately
- Preserving all comments and documentation (translated to English if needed)
- Adding type annotations where the target language supports them
Output ONLY a JSON object with the translated code.`,

  prompt: (input) => `Translate this ${input.sourceLanguage} file to ${input.targetLanguage}:

Source file: ${input.sourceFile}
Target file: ${input.targetFile}
${input.notes ? `File-specific notes: ${input.notes}` : ''}
${input.generalNotes ? `General notes: ${input.generalNotes}` : ''}

Source code:
\`\`\`${input.sourceLanguage.toLowerCase()}
${input.sourceCode}
\`\`\`

Output ONLY valid JSON:
{
  "sourceFile": "${input.sourceFile}",
  "targetFile": "${input.targetFile}",
  "translatedCode": "the complete translated code as a string",
  "linesOfCode": 42,
  "notes": "any important translation decisions made",
  "warnings": ["any potential issues or manual review needed"]
}

CRITICAL: translatedCode must be the COMPLETE translated file content, not a partial translation.`,

  parseOutput: (raw, input) => {
    const cleaned = raw.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
    try {
      return JSON.parse(cleaned) as TranslatedFile;
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]) as TranslatedFile;
      // If we can't parse JSON, the raw output might be the code itself
      return {
        sourceFile: input.sourceFile,
        targetFile: input.targetFile,
        translatedCode: cleaned,
        linesOfCode: cleaned.split('\n').length,
        warnings: ['Could not parse structured output — using raw response'],
      };
    }
  },

  llmOptions: { temperature: 0.1, maxTokens: 4096 },
  retries: 2,
});
