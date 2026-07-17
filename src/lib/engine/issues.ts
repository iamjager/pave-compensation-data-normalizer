export type IssueSeverity = "error" | "warning";

export interface Issue {
  severity: IssueSeverity;
  /** Target schema field the issue relates to, when field-scoped. */
  field?: string;
  /** Stable machine code, e.g. "required_missing", "enum_unmapped". */
  code: string;
  message: string;
  /** Offending source value, when relevant (feeds drift aggregation). */
  value?: unknown;
}
