/** Music validation result model (PRD §SCR-002, §13). */

export type ValidationSeverity = "info" | "warning" | "error" | "fatal";

/** Canonical rule codes required by the PRD. */
export const VALIDATION_RULES = [
  "MEASURE_DURATION_MATCH",
  "PICKUP_MEASURE_ALLOWED",
  "NOTE_ORDER_VALID",
  "PITCH_RANGE_REASONABLE",
  "ACCIDENTAL_SCOPE_VALID",
  "TIE_TARGET_EXISTS",
  "TIE_PITCH_MATCH",
  "LYRIC_NOTE_REFERENCE_EXISTS",
  "VERSE_NUMBER_VALID",
  "REPEAT_START_END_BALANCED",
  "ENDING_REFERENCE_VALID",
  "NO_ORPHANED_SOURCE_REGION",
  // Implementation-specific additions:
  "DANGLING_SOURCE_REGION",
] as const;

export type ValidationRuleCode = (typeof VALIDATION_RULES)[number];

export interface SuggestedAction {
  kind: string;
  description: string;
}

export interface ScoreValidationIssue {
  code: ValidationRuleCode | string;
  severity: ValidationSeverity;
  entityId?: string;
  measureId?: string;
  sourceRegionId?: string;
  message: string;
  repairable: boolean;
  suggestedActions: SuggestedAction[];
}

export interface ScoreValidationResult {
  issues: ScoreValidationIssue[];
  /** True when no `error` or `fatal` issues are present. */
  ok: boolean;
  /** True when at least one `error`/`fatal` issue blocks approval & export. */
  hasBlocking: boolean;
}
