import type { OpenApiAnalysis } from '../types';

export type LintSeverity = 'error' | 'warning';

/** A single rule violation, before the registry stamps source/code/severity. */
export interface LintFinding {
  message: string;
  /** RFC 6901 JSON Pointer to the offending location, when known. */
  pointer?: string;
  /**
   * Set when the finding is about something *absent* from the node (no
   * security, no 5xx response, no description). The node has no offending
   * text of its own, so hosts underline just its key (`post:`, `responses:`)
   * instead of squiggling every line of the value.
   */
  anchor?: boolean;
}

/**
 * A local, Spectral-like OpenAPI quality/security rule. Rules read the
 * already-computed analysis (parsed spec, operations, resolved refs) rather
 * than re-walking the document, and stay platform-agnostic — no VS Code deps —
 * so the desktop app can adopt them later.
 */
export interface LintRule {
  id: string;
  description: string;
  defaultSeverity: LintSeverity;
  run(analysis: OpenApiAnalysis): LintFinding[];
}

/** Caller-supplied configuration for a lint pass. */
export interface LintOptions {
  /**
   * Rule ids to skip. When omitted, the registry falls back to its default
   * opt-in set (e.g. the speculative rate-limit rule); pass `[]` to run every
   * rule, including opt-in ones.
   */
  disabledRules?: string[];
  /** Per-rule severity, or `'off'` to disable a single rule. */
  severityOverrides?: Record<string, LintSeverity | 'off'>;
}
