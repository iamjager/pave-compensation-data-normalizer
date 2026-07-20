import { mappableFields } from "./schema";

export type ListMode = "merge" | "concat" | "ignore";

/** Disposition for a record list other than the primary one. */
export interface AdditionalList {
  path: string;
  mode: ListMode;
  /** Join key in the PRIMARY records (dot-path). Required for merge. */
  primary_key?: string;
  /** Join key in this list's records; defaults to primary_key. */
  list_key?: string;
}

export interface SourceSpec {
  format: "json" | "csv";
  /** Dot-path to the record array inside a JSON document (e.g. "workers"). */
  records_path?: string;
  /** Dot-path to the export's snapshot timestamp, if the document carries one. */
  generated_at_path?: string;
  /** Other record lists in the same document and what to do with them. */
  additional_lists?: AdditionalList[];
}

/** The key a merged list's rows are embedded under: the path's last segment. */
export const embedSegment = (path: string): string => path.split(".").at(-1) ?? path;

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

  const lists = config.source.additional_lists ?? [];
  if (lists.length > 0 && config.source.format === "csv") {
    warnings.push("additional_lists has no effect for CSV sources — a CSV is a single table.");
  }
  const mergeSegments = new Set<string>();
  for (const list of lists) {
    if (list.mode === "merge") {
      if (!list.primary_key) {
        warnings.push(`List "${list.path}" is set to merge but has no join key — pick a record ID.`);
      }
      const segment = embedSegment(list.path);
      if (mergeSegments.has(segment)) {
        warnings.push(`Two merged lists share the name "${segment}" — one would overwrite the other.`);
      }
      mergeSegments.add(segment);
    }
  }

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
