/**
 * Social Monitoring — test runner using MockLLMProvider + mock data.
 */

import { createTestOrchestrator } from '@flomatai/core';
import { socialMonitoringPipeline } from './pipeline.js';

async function runTest() {
  console.log('=== Social Monitoring — Test ===\n');

  const orchestrator = createTestOrchestrator();
  const { output, run } = await orchestrator.run(socialMonitoringPipeline, {
    brand: 'Acme Corp',
    keywords: ['acme', 'acmecorp'],
    mock: true,
  });

  const result = output as {
    date: string;
    brand: string;
    totalMentions: number;
    sentimentBreakdown: Record<string, number>;
    executiveSummary: string;
    topThemes: string[];
    recommendations: string[];
    urgentItems: unknown[];
  };

  console.log('\n✓ Pipeline completed');
  console.log(`  Run ID:       ${run.id}`);
  console.log(`  Mentions:     ${result.totalMentions}`);
  console.log(`  Sentiment:    ${JSON.stringify(result.sentimentBreakdown)}`);
  console.log(`  Summary:      ${result.executiveSummary?.substring(0, 100)}...`);
  console.log(`  Urgent items: ${result.urgentItems?.length}`);

  if (!result.executiveSummary) throw new Error('executiveSummary is empty');
  if (result.totalMentions < 1) throw new Error('no mentions');

  console.log('\n✅ All assertions passed');
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
