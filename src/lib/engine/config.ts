import { mappableFields } from "./schema";

export interface SourceSpec {
  format: "json" | "csv";
  /** Dot-path to the record array inside a JSON document (e.g. "workers"). */
  records_path?: string;
  /** Dot-path to the export's snapshot timestamp, if the document carries one. */
  generated_at_path?: string;
}

export interface TransformSpec {
  fn: string;
  args?: Record<string, unknown>;
}

/**
 * One rule per target schema field: where the value comes from
 * (a source path or a constant), then an optional transform chain.
 */
export interface MappingRule {
  source?: string;
  const?: unknown;
  transforms?: TransformSpec[];
  /** Used when the rule resolves to null. */
  fallback?: unknown;
}

export interface CompanyConfig {
  config_version: number;
  company_id: string;
  company_name: string;
  updated_at: string;
  source: SourceSpec;
  mappings: Record<string, MappingRule>;
}

/** Structural sanity check; returned strings surface as run-level warnings. */
export function validateConfig(
  config: CompanyConfig,
  knownTransformIds: ReadonlySet<string>,
): string[] {
  const warnings: string[] = [];
  const mappable = new Set(mappableFields().map((f) => f.key));
  for (const [target, rule] of Object.entries(config.mappings)) {
    if (!mappable.has(target)) {
      warnings.push(`Mapping targets unknown schema field "${target}" — it will be ignored.`);
    }
    if (rule.source === undefined && rule.const === undefined) {
      warnings.push(`Mapping for "${target}" has neither a source nor a const value.`);
    }
    for (const t of rule.transforms ?? []) {
      if (!knownTransformIds.has(t.fn)) {
        warnings.push(`Mapping for "${target}" uses unknown transform "${t.fn}".`);
      }
    }
  }
  return warnings;
}
