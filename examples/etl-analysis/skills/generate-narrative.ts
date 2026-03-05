/**
 * Skill: generate-narrative
 *
 * Takes the Python pandas analysis output and generates an executive
 * narrative report using an LLM.
 */

import { z } from 'zod';
import { LLMSkill } from '@flomatai/core';

export const NarrativeSchema = z.object({
  executiveSummary: z.string(),
  salesHighlights: z.string(),
  userHighlights: z.string(),
  systemHighlights: z.string(),
  recommendations: z.array(z.string()),
  riskFlags: z.array(z.string()),
});

export type Narrative = z.infer<typeof NarrativeSchema>;

export const generateNarrativeSkill = LLMSkill.create({
  name: 'generate-narrative',
  description: 'Generates an executive narrative report from ETL analysis statistics',
  llm: 'default',

  inputSchema: z.object({
    analysis: z.record(z.unknown()),
    period: z.string().optional(),
  }),
  outputSchema: NarrativeSchema,

  systemMessage: `You are a business analyst writing executive reports. Be data-driven, concise, and actionable.
Use specific numbers from the data. Output ONLY valid JSON.`,

  prompt: (input) => {
    const a = input.analysis as Record<string, Record<string, unknown>>;
    const sales = a['sales'] ?? {};
    const users = a['users'] ?? {};
    const system = a['system'] ?? {};
    const summary = a['summary'] ?? {};

    return `Write an executive business report for ${input.period ?? summary['period'] ?? 'Q1 2024'}.

SALES DATA:
- Total Revenue: $${sales['total_revenue']}
- Total Units: ${sales['total_units']}
- Top Product: ${(sales['top_product'] as Record<string, unknown>)?.['name']} ($${(sales['top_product'] as Record<string, unknown>)?.['revenue']})
- Top Region: ${(sales['top_region'] as Record<string, unknown>)?.['name']} ($${(sales['top_region'] as Record<string, unknown>)?.['revenue']})
- MoM Revenue Growth: ${sales['mom_growth_percent']}%
- Revenue by Product: ${JSON.stringify(sales['revenue_by_product'])}

USER DATA:
- Total Users: ${users['total']}
- Active Users: ${users['active']} (${Math.round(Number(users['active']) / Number(users['total']) * 100)}%)
- Churn Rate: ${users['churn_rate_percent']}%
- Avg Lifetime Spend: $${users['avg_lifetime_spend']}
- Plan Distribution: ${JSON.stringify(users['plan_distribution'])}
- High Value Users (>$5k): ${(users['high_value_users'] as unknown[])?.length ?? 0}

SYSTEM METRICS:
- API Calls: ${system['api_total_calls']}
- Error Rate: ${system['api_error_rate']}
- Uptime: ${system['uptime_percent']}%
- P99 Latency: ${system['p99_latency_ms']}ms
- MRR Growth (Q1): ${system['mrr_jan_to_mar_growth_percent']}%
- Incidents: ${system['incidents']}

Output ONLY valid JSON:
{
  "executiveSummary": "2-3 sentence high-level summary for the C-suite",
  "salesHighlights": "2-3 sentences on sales performance with specific numbers",
  "userHighlights": "2-3 sentences on user metrics with specific numbers",
  "systemHighlights": "1-2 sentences on system reliability",
  "recommendations": ["specific action 1", "specific action 2", "specific action 3"],
  "riskFlags": ["risk or concern 1 (or empty array if none)"]
}`;
  },

  parseOutput: (raw) => {
    const cleaned = raw.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
    try {
      return JSON.parse(cleaned) as Narrative;
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]) as Narrative;
      return {
        executiveSummary: cleaned.substring(0, 500),
        salesHighlights: '',
        userHighlights: '',
        systemHighlights: '',
        recommendations: [],
        riskFlags: [],
      };
    }
  },

  llmOptions: { temperature: 0.2, maxTokens: 2048 },
  retries: 2,
});
