/**
 * flomatai error hierarchy.
 */

export class FlomatAIError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = 'FlomatAIError';
    this.code = code;
    this.details = details;
  }
}

// ── Skill Errors ─────────────────────────────────────────────────────────────

export class SkillError extends FlomatAIError {
  readonly skillName: string;

  constructor(skillName: string, message: string, details?: unknown) {
    super(message, 'SKILL_ERROR', details);
    this.name = 'SkillError';
    this.skillName = skillName;
  }
}

export class SkillValidationError extends FlomatAIError {
  readonly skillName: string;
  readonly field: 'input' | 'output';

  constructor(
    skillName: string,
    field: 'input' | 'output',
    message: string,
    details?: unknown,
  ) {
    super(message, 'SKILL_VALIDATION_ERROR', details);
    this.name = 'SkillValidationError';
    this.skillName = skillName;
    this.field = field;
  }
}

export class SkillTimeoutError extends SkillError {
  readonly timeoutMs: number;

  constructor(skillName: string, timeoutMs: number) {
    super(skillName, `Skill "${skillName}" timed out after ${timeoutMs}ms`);
    this.name = 'SkillTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

// ── Pipeline Errors ──────────────────────────────────────────────────────────

export class PipelineError extends FlomatAIError {
  readonly pipelineName: string;
  readonly stepName?: string;

  constructor(pipelineName: string, message: string, stepName?: string, details?: unknown) {
    super(message, 'PIPELINE_ERROR', details);
    this.name = 'PipelineError';
    this.pipelineName = pipelineName;
    this.stepName = stepName;
  }
}

export class StepMaxRetriesError extends PipelineError {
  constructor(pipelineName: string, stepName: string, attempts: number, cause: Error) {
    super(
      pipelineName,
      `Step "${stepName}" failed after ${attempts} attempts: ${cause.message}`,
      stepName,
      { cause },
    );
    this.name = 'StepMaxRetriesError';
  }
}

// ── Agent Errors ─────────────────────────────────────────────────────────────

export class AgentError extends FlomatAIError {
  readonly agentName: string;

  constructor(agentName: string, message: string, details?: unknown) {
    super(message, 'AGENT_ERROR', details);
    this.name = 'AgentError';
    this.agentName = agentName;
  }
}

export class AgentMaxIterationsError extends AgentError {
  constructor(agentName: string, maxIterations: number) {
    super(
      agentName,
      `Agent "${agentName}" hit max iterations (${maxIterations}) without finishing`,
    );
    this.name = 'AgentMaxIterationsError';
  }
}

export class AgentMaxDepthError extends AgentError {
  constructor(agentName: string, maxDepth: number) {
    super(agentName, `Agent hierarchy exceeded max depth (${maxDepth})`);
    this.name = 'AgentMaxDepthError';
  }
}

// ── LLM Errors ───────────────────────────────────────────────────────────────

export class LLMError extends FlomatAIError {
  readonly providerName: string;
  readonly statusCode?: number;

  constructor(providerName: string, message: string, statusCode?: number, details?: unknown) {
    super(message, 'LLM_ERROR', details);
    this.name = 'LLMError';
    this.providerName = providerName;
    this.statusCode = statusCode;
  }
}

export class LLMRateLimitError extends LLMError {
  readonly retryAfterMs?: number;

  constructor(providerName: string, retryAfterMs?: number) {
    super(
      providerName,
      `Rate limit exceeded for provider "${providerName}"${retryAfterMs ? `. Retry after ${retryAfterMs}ms` : ''}`,
      429,
    );
    this.name = 'LLMRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

// ── State Errors ─────────────────────────────────────────────────────────────

export class StateError extends FlomatAIError {
  constructor(message: string, details?: unknown) {
    super(message, 'STATE_ERROR', details);
    this.name = 'StateError';
  }
}
