/**
 * MockLLMProvider — a deterministic LLM provider for testing.
 *
 * Matches incoming prompts against registered patterns and returns
 * pre-canned JSON responses. Falls back to a default response if no
 * pattern matches.
 *
 * Usage:
 *   const mock = new MockLLMProvider([
 *     { match: /summarize/, response: '{"summary":"test"}' },
 *     { match: /classify/, response: '{"sentiment":"positive"}' },
 *   ]);
 *   const orchestrator = new Orchestrator({ llm: { default: mock } });
 */

import type { LLMProvider, LLMRegistry } from './llm-provider.js';
import type { Message, LLMOptions, LLMResponse, LLMChunk } from './types.js';

export interface MockResponse {
  /** Regex or string to match against the last user message content. */
  match: RegExp | string;
  /** The raw text response to return. */
  response: string;
  /** Optional: only match this many times (default: unlimited). */
  times?: number;
}

export class MockLLMProvider implements LLMProvider {
  readonly name = 'mock';
  readonly model = 'mock-model';

  private callCount = 0;
  private responseCounts = new Map<number, number>();

  constructor(
    private readonly responses: MockResponse[],
    private readonly defaultResponse: string = '{"result":"mock-response","ok":true}',
    private readonly delayMs: number = 0,
  ) {}

  async chat(messages: Message[], _options?: LLMOptions): Promise<LLMResponse> {
    if (this.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.delayMs));
    }

    this.callCount++;

    // Find the last user message
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const content = lastUser?.content ?? '';

    // Find matching response
    let responseText = this.defaultResponse;
    for (let i = 0; i < this.responses.length; i++) {
      const r = this.responses[i]!;
      const matches =
        typeof r.match === 'string'
          ? content.toLowerCase().includes(r.match.toLowerCase())
          : r.match.test(content);

      if (matches) {
        const usedTimes = this.responseCounts.get(i) ?? 0;
        if (r.times === undefined || usedTimes < r.times) {
          responseText = r.response;
          this.responseCounts.set(i, usedTimes + 1);
          break;
        }
      }
    }

    return {
      content: responseText,
      model: this.model,
      usage: {
        inputTokens: Math.ceil(content.length / 4),
        outputTokens: Math.ceil(responseText.length / 4),
        totalTokens: Math.ceil((content.length + responseText.length) / 4),
      },
      stopReason: 'stop',
    };
  }

  async *stream(messages: Message[], options?: LLMOptions): AsyncIterable<LLMChunk> {
    const response = await this.chat(messages, options);
    yield {
      content: response.content,
      done: true,
    };
  }

  get totalCalls(): number {
    return this.callCount;
  }

  reset(): void {
    this.callCount = 0;
    this.responseCounts.clear();
  }
}

/**
 * Create a MockLLMProvider that returns valid JSON for any skill type.
 * Pre-configured with sensible responses for all flomatai example skills.
 */
export function createTestLLM(overrides: MockResponse[] = []): MockLLMProvider {
  return new MockLLMProvider([
    ...overrides,

    // ── High-priority patterns (matched first to prevent false positives) ──────

    // ETL executive narrative — must come before outage pattern (prompt contains "Incidents:")
    {
      match: /Write an executive business report|executive.*business.*report/i,
      response: JSON.stringify({
        executiveSummary: 'Q1 2024 showed strong revenue growth with total sales of $67,497.29 across all regions. User engagement remains high with 87% active rate.',
        salesHighlights: 'Widget Pro and Gadget Plus drove 68% of total revenue. North region led all regions at $18,432.',
        userHighlights: '15 total users with 87% active rate. Enterprise tier generating highest lifetime value at $20,610 average.',
        systemHighlights: 'System maintained 99.97% uptime with only 1 incident. P99 latency at 890ms needs monitoring.',
        recommendations: ['Increase Gadget Plus inventory for West region', 'Implement churn prevention for inactive basic tier users', 'Optimize API P99 latency below 500ms'],
        riskFlags: ['P99 latency at 890ms approaching SLA limit'],
      }),
    },

    // Classify mention — must come before outage pattern (mention excerpts can contain incident-related terms)
    {
      match: /^Classify this mention of/i,
      response: JSON.stringify({
        id: 'mock-001',
        sentiment: 'positive',
        relevance: 0.9,
        category: 'praise',
        urgency: 'low',
        requiresResponse: false,
        summary: 'User praised the product features and ease of use.',
        keyIssues: [],
      }),
    },

    // Classify mention - negative/urgent (outage content in classify prompts)
    {
      match: /outage|frustrated|503|incident/i,
      response: JSON.stringify({
        id: 'mock-005',
        sentiment: 'negative',
        relevance: 1.0,
        category: 'bug-report',
        urgency: 'critical',
        requiresResponse: true,
        summary: 'User reporting API outage with 503 errors.',
        keyIssues: ['API unavailable', '503 errors', 'Status page inaccurate'],
      }),
    },

    // Research / brief
    {
      match: /content brief|research.*topic|topic.*brief/i,
      response: JSON.stringify({
        topic: 'Test Topic',
        summary: 'A comprehensive overview of the test topic for demonstration purposes.',
        keyPoints: ['Key point 1', 'Key point 2', 'Key point 3', 'Key point 4', 'Key point 5'],
        audience: 'Technical professionals',
        tone: 'professional',
        keywords: ['keyword1', 'keyword2', 'keyword3'],
        uniqueAngle: 'Practical implementation focus',
      }),
    },

    // Blog format
    {
      match: /blog post|write.*blog/i,
      response: JSON.stringify({
        title: 'The Complete Guide to Test Topic',
        slug: 'complete-guide-test-topic',
        metaDescription: 'A comprehensive look at test topic with practical examples.',
        content: '## Introduction\n\nTest blog content here.\n\n## Key Points\n\n- Point 1\n- Point 2\n\n## Conclusion\n\nIn summary, test topic is important.',
        readingTimeMinutes: 3,
      }),
    },

    // Twitter thread
    {
      match: /twitter thread|tweet/i,
      response: JSON.stringify({
        tweets: [
          { position: 1, text: '🧵 Test tweet 1 about this topic (thread)', charCount: 50 },
          { position: 2, text: 'Tweet 2 with more details about the subject matter', charCount: 52 },
          { position: 3, text: 'Tweet 3: Key insight here that readers will find valuable', charCount: 58 },
        ],
        hashtags: ['#TestTopic', '#Learning'],
      }),
    },

    // LinkedIn
    {
      match: /linkedin post/i,
      response: JSON.stringify({
        hook: 'This changes everything about how we work.',
        body: 'I recently learned something that transformed my approach.\n\nHere is what I discovered...\n\nThe key insight is practical application.',
        callToAction: 'What has been your experience? Share below.',
        hashtags: ['#Professional', '#Growth'],
        fullPost: 'This changes everything about how we work.\n\nI recently learned something that transformed my approach.\n\nWhat has been your experience? Share below.\n\n#Professional #Growth',
      }),
    },

    // TL;DR
    {
      match: /tl.?dr|newsletter snippet/i,
      response: JSON.stringify({
        headline: 'Key Insight on Test Topic',
        summary: 'Two sentence summary of the most important points from this topic.',
        bullets: ['First key takeaway here', 'Second important point', 'Third actionable item'],
        takeaway: 'The one thing to remember about this topic',
      }),
    },

    // Translation
    {
      match: /translate.*to|translat/i,
      response: '# Contenido traducido\n\nEste es el contenido traducido al español.',
    },

    // RAG answer
    {
      match: /answer.*question|question.*answer|q&a|provided context/i,
      response: JSON.stringify({
        answer: 'Based on the provided documents, the answer is that TypeScript provides strong type inference which automatically determines variable types from their initial values.',
        citations: [
          { source: 'typescript-handbook.md', excerpt: 'TypeScript infers types automatically when you declare a variable with an initial value.' },
        ],
        confidence: 'high',
      }),
    },

    // Code review
    {
      match: /review.*file|code.*review|diff/i,
      response: JSON.stringify({
        filename: 'test.ts',
        severity: 'info',
        summary: 'The code looks well-structured with proper TypeScript typing. No critical issues found.',
        comments: [
          { line: 15, body: 'Consider adding error boundary handling here', severity: 'info' },
        ],
        approved: true,
      }),
    },

    // Translation plan (code translation)
    {
      match: /translation plan|migrate.*from|translate.*python/i,
      response: JSON.stringify({
        sourceLanguage: 'Python',
        targetLanguage: 'TypeScript',
        files: [
          { sourceFile: 'src/auth.py', targetFile: 'src/auth.ts', priority: 1, notes: 'Convert PBKDF2 to Node.js crypto. Replace Python dataclasses with interfaces.' },
          { sourceFile: 'src/cache.py', targetFile: 'src/cache.ts', priority: 2, notes: 'Convert threading.Lock to async mutex. OrderedDict becomes Map.' },
          { sourceFile: 'src/api_client.py', targetFile: 'src/api_client.ts', priority: 3, notes: 'Replace urllib with fetch API. Convert to async/await.' },
        ],
        generalNotes: 'Use ES2022 features. Add explicit return types. Use Map instead of dict.',
        estimatedComplexity: 'medium',
      }),
    },

    // Translate file (code translation)
    {
      match: /translate.*source|source.*code|typescript.*equivalent|python.*to/i,
      response: JSON.stringify({
        sourceFile: 'src/auth.py',
        targetFile: 'src/auth.ts',
        translatedCode: '// Translated TypeScript file\nimport crypto from "crypto";\n\nexport class AuthService {\n  constructor(private secret: string) {}\n\n  hashPassword(password: string, salt: string): string {\n    return crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("base64");\n  }\n}\n',
        linesOfCode: 12,
        notes: 'Converted Python PBKDF2 to Node.js crypto.pbkdf2Sync',
        warnings: [],
      }),
    },

    // Daily digest — must come BEFORE draft-response to avoid prefix matching on "DRAFTED RESPONSES"
    {
      match: /daily.*digest|monitoring.*digest|brand.*digest|social.*report|Generate a daily social/i,
      response: JSON.stringify({
        date: new Date().toISOString().split('T')[0],
        brand: 'Acme Corp',
        totalMentions: 8,
        sentimentBreakdown: { positive: 4, negative: 2, neutral: 1, mixed: 1 },
        urgentItems: [
          { mentionId: 'mock-005', title: 'API outage report', urgency: 'critical', summary: 'User reporting 503 errors for 30 minutes', draftResponse: 'We are aware of the issue and working to resolve it.' },
        ],
        executiveSummary: 'Acme Corp had a generally positive week with 4 positive mentions and 2 negative. The API outage generated critical mentions requiring immediate response.',
        topThemes: ['Product quality', 'API reliability', 'Pricing concerns'],
        recommendations: ['Address API outage publicly', 'Create SLA transparency page', 'Follow up with pricing FAQ'],
      }),
    },

    // Draft response (individual mention)
    {
      match: /draft.*response|response.*mention|respond.*to/i,
      response: JSON.stringify({
        mentionId: 'mock-001',
        draft: 'Thank you for your feedback! We appreciate you taking the time to share your experience.',
        tone: 'professional',
        channel: 'hacker-news',
        charCount: 89,
        requiresHumanReview: false,
      }),
    },

    // Research extract facts
    {
      match: /extract.*facts|facts.*extract|relevant.*facts/i,
      response: JSON.stringify({
        facts: [
          'Large language models have shown significant improvements in code generation tasks',
          'GitHub Copilot reported 55% of code suggestions accepted by developers in 2024',
          'AI coding tools reduce debugging time by an average of 30-40%',
        ],
        sourceUrl: 'https://example.com/article',
        relevanceScore: 0.85,
      }),
    },

    // Research synthesize
    {
      match: /synthesize.*report|research.*report|comprehensive.*report/i,
      response: JSON.stringify({
        title: 'Research Report: Test Topic',
        summary: 'This report examines the current state and future trajectory of the researched topic based on multiple sources gathered from across the web.',
        findings: [
          { section: 'Current State', content: 'The field is rapidly evolving with significant developments in recent years.' },
          { section: 'Key Trends', content: 'Three major trends are emerging that will shape the direction of this field.' },
          { section: 'Future Outlook', content: 'Experts predict continued growth and maturation over the next 2-3 years.' },
        ],
        sourcesUsed: ['https://example.com/1', 'https://example.com/2'],
        confidence: 'medium',
        gaps: ['More longitudinal data needed', 'Industry-specific studies lacking'],
      }),
    },

    // ReAct thought - general finish
    {
      match: /what do you do next|step.*reasoning/i,
      response: JSON.stringify({
        thought: 'I have gathered sufficient information through my searches. I now have 15 relevant facts from 3 sources. I will synthesize these into a comprehensive report.',
        action: {
          type: 'use_skill',
          skill: 'synthesize-report',
          input: {
            topic: 'test topic',
            allFacts: [
              { facts: ['Fact 1', 'Fact 2', 'Fact 3'], sourceUrl: 'https://example.com', relevanceScore: 0.85 },
            ],
            searchesPerformed: ['test topic overview', 'test topic trends'],
          },
        },
      }),
    },

    // Verlivo research docs
    {
      match: /microservice|verlivo|architecture.*service|extract.*service/i,
      response: JSON.stringify({
        project_summary: 'A multi-tenant SaaS platform with 3 core microservices.',
        architecture_context: 'Services communicate via REST APIs with JWT authentication.',
        services: [
          { name: 'auth-service', port: 3001, phase: 1, team: 'Backend', database: 'PostgreSQL', description: 'Authentication service', external_integrations: ['SendGrid'], depends_on: [], high_volume: false, has_workers: false, has_clickhouse: false },
        ],
      }),
    },

    // Verlivo planning steps
    {
      match: /definition|use.?case|feature|integration|event|schema|openapi/i,
      response: JSON.stringify({
        service_name: 'auth-service',
        phase: 1,
        team: 'Backend',
        complete_plan: '# auth-service Plan\n\n## Definition\nHandles authentication and JWT issuance.\n\n## Use Cases\n- User login\n- Token refresh\n\n## Features\n- JWT generation\n- RBAC enforcement',
      }),
    },
  ]);
}

/**
 * Create a minimal MockLLMRegistry for use in orchestrators.
 */
export function createMockLLMRegistry(overrides: MockResponse[] = []): Record<string, LLMProvider> {
  const mock = createTestLLM(overrides);
  return {
    default: mock,
    research: mock,
    planning: mock,
  };
}
