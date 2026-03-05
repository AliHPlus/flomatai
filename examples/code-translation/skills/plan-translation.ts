/**
 * Skill: plan-translation
 *
 * Analyzes the discovered files and creates a translation plan with
 * target file names, dependency order, and any special notes per file.
 */

import { z } from 'zod';
import { LLMSkill } from '@flomatai/core';

export const TranslationPlanSchema = z.object({
  sourceLanguage: z.string(),
  targetLanguage: z.string(),
  files: z.array(z.object({
    sourceFile: z.string(),
    targetFile: z.string(),
    priority: z.number(),
    notes: z.string().optional(),
  })),
  generalNotes: z.string(),
  estimatedComplexity: z.enum(['low', 'medium', 'high']),
});

export type TranslationPlan = z.infer<typeof TranslationPlanSchema>;

export const planTranslationSkill = LLMSkill.create({
  name: 'plan-translation',
  description: 'Analyzes source files and creates a detailed translation plan',
  llm: 'default',

  inputSchema: z.object({
    sourceLanguage: z.string(),
    targetLanguage: z.string(),
    files: z.array(z.object({
      relativePath: z.string(),
      extension: z.string(),
      sizeBytes: z.number(),
    })),
  }),
  outputSchema: TranslationPlanSchema,

  systemMessage: 'You are a code migration expert. Create translation plans that account for language idioms and dependencies. Output ONLY valid JSON.',

  prompt: (input) => `Create a code translation plan from ${input.sourceLanguage} to ${input.targetLanguage}.

Files to translate:
${input.files.map((f) => `- ${f.relativePath} (${Math.round(f.sizeBytes / 1024)}KB)`).join('\n')}

Output ONLY valid JSON:
{
  "sourceLanguage": "${input.sourceLanguage}",
  "targetLanguage": "${input.targetLanguage}",
  "files": [
    {
      "sourceFile": "src/auth.py",
      "targetFile": "src/auth.ts",
      "priority": 1,
      "notes": "Convert Python type hints to TypeScript types. Replace hmac with Node.js crypto."
    }
  ],
  "generalNotes": "Key migration considerations: ...",
  "estimatedComplexity": "medium"
}

Order files by dependency (independent files first, priority=1 is first).
Change file extension appropriately for the target language.`,

  parseOutput: (raw, input) => {
    const cleaned = raw.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
    try {
      return JSON.parse(cleaned) as TranslationPlan;
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]) as TranslationPlan;
      // Fallback: create a simple plan
      return {
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
        files: input.files.map((f, i) => ({
          sourceFile: f.relativePath,
          targetFile: f.relativePath.replace(f.extension, getTargetExt(input.targetLanguage)),
          priority: i + 1,
        })),
        generalNotes: 'Direct translation without specific notes',
        estimatedComplexity: 'medium' as const,
      };
    }
  },

  llmOptions: { temperature: 0.1, maxTokens: 1024 },
});

function getTargetExt(lang: string): string {
  const map: Record<string, string> = {
    'TypeScript': '.ts',
    'JavaScript': '.js',
    'Go': '.go',
    'Rust': '.rs',
    'Java': '.java',
    'C#': '.cs',
    'Python': '.py',
  };
  return map[lang] ?? '.ts';
}
