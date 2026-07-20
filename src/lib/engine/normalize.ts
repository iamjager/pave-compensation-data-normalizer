import { type CompanyConfig, validateConfig } from "./config";
import { computeDrift, type DriftReport } from "./drift";
import { coerceGrants, type EquityExtractor, type EquityGrant, type GrantType } from "./equity";
import type { Issue } from "./issues";
import { type ListInfo, loadRecords } from "./loaders";
import { type FieldProfile, profileRecords } from "./profile";
import { GRANT_TYPES, SCHEMA, outputFields } from "./schema";
import { applyRule, TRANSFORM_IDS, type TransformCtx } from "./transforms";
import { applyDatasetValidation, validateRecord } from "./validate";

/**
 * The one pipeline shared verbatim by the mapper preview, saved runs,
 * exports, and tests: same config in, same records out.
 */

export interface WrappedRecord {
  /** The normalized employee record. */
  data: Record<string, unknown>;
  issues: Issue[];
  raw_index: number;
  /** The source record, kept for side-by-side review. */
  raw: Record<string, unknown>;
  /** Provenance notes keyed "<field>.<note>", e.g. "base_salary_annual.annualized_from". */
  annotations: Record<string, unknown>;
}

export interface RunSummary {
  total: number;
  clean: number;
  warnings: number;
  quarantined: number;
}

export interface RunEnvelope {
  company_id: string;
  company_name: string;
  source_file: string | null;
  source_generated_at: string | null;
  config_version: number;
  run_at: string;
  summary: RunSummary;
  config_warnings: string[];
}

export interface RunResult {
  envelope: RunEnvelope;
  records: WrappedRecord[];
  drift: DriftReport;
  /** Every record list in the document and what happened to it. */
  lists: ListInfo[];
  /** Profiles of the (merged) record stream — lets the UI refresh pickers live. */
  sourceProfiles: FieldProfile[];
}

export interface NormalizeOptions {
  sourceFile?: string;
  equityExtractor?: EquityExtractor;
  /** Injectable for reproducible tests. */
  runAt?: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.replace(/[$,\s]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return null;
};

export async function normalize(
  rawText: string,
  config: CompanyConfig,
  opts: NormalizeOptions = {},
): Promise<RunResult> {
  const { records: rawRecords, sourceGeneratedAt, lists } = loadRecords(rawText, config.source);
  const configWarnings = validateConfig(config, TRANSFORM_IDS);
  const profiles = profileRecords(rawRecords);

  // List-level problems are run-level warnings, loud but non-fatal.
  for (const list of lists) {
    if (list.missing && list.mode !== "unhandled") {
      configWarnings.push(`Configured list "${list.path}" was not found in this file.`);
    }
    if (list.collision) {
      configWarnings.push(
        `List "${list.path}" was NOT merged: records already contain a "${list.embedSegment}" field.`,
      );
    }
  }
  const mergeSegments = lists.filter(
    (l) => l.mode === "merge" && !l.missing && !l.collision && l.embedSegment,
  );

  const records: WrappedRecord[] = [];
  for (let index = 0; index < rawRecords.length; index++) {
    const raw = rawRecords[index];
    const issues: Issue[] = [];
    const annotations: Record<string, unknown> = {};

    // Resolve every mappable field (real + virtual) through its rule.
    const resolved: Record<string, unknown> = {};
    for (const field of SCHEMA) {
      if (field.derived) continue;
      const rule = config.mappings[field.key];
      if (!rule) {
        resolved[field.key] = null;
        continue;
      }
      const ctx: TransformCtx = {
        record: raw,
        targetField: field.key,
        addIssue: (severity, code, message, value) =>
          issues.push({ severity, field: field.key, code, message, value }),
        annotate: (key, value) => {
          annotations[`${field.key}.${key}`] = value;
        },
        equityExtractor: opts.equityExtractor,
      };
      resolved[field.key] = await applyRule(rule, ctx);
    }

    // Emit output fields; equity is assembled below.
    const data: Record<string, unknown> = {};
    for (const field of outputFields()) {
      if (field.derived || field.type === "equity_grants") continue;
      data[field.key] = resolved[field.key] ?? null;
    }

    data.equity_grants = assembleGrants(resolved);
    const grantValues = (data.equity_grants as EquityGrant[])
      .map((g) => g.value)
      .filter((v): v is number => typeof v === "number");
    data.equity_total_value =
      grantValues.length > 0 ? round2(grantValues.reduce((a, b) => a + b, 0)) : null;

    for (const list of mergeSegments) {
      if (!(list.embedSegment! in raw)) {
        issues.push({
          severity: "warning", code: "merge_unmatched",
          message: `No matching "${list.path}" row for this record — its ${list.embedSegment}.* values are empty`,
        });
      }
    }

    issues.push(...validateRecord(data));
    records.push({ data, issues, raw_index: index, raw, annotations });
  }

  applyDatasetValidation(records);

  const summary: RunSummary = { total: records.length, clean: 0, warnings: 0, quarantined: 0 };
  for (const record of records) {
    if (record.issues.some((i) => i.severity === "error")) summary.quarantined += 1;
    else if (record.issues.length > 0) summary.warnings += 1;
    else summary.clean += 1;
  }

  return {
    envelope: {
      company_id: config.company_id,
      company_name: config.company_name,
      source_file: opts.sourceFile ?? null,
      source_generated_at: sourceGeneratedAt,
      config_version: config.config_version,
      run_at: opts.runAt ?? new Date().toISOString(),
      summary,
      config_warnings: configWarnings,
    },
    records,
    drift: computeDrift(
      rawRecords,
      profiles,
      config,
      records.map((r) => r.issues),
      lists
        .filter((l) => l.mode === "unhandled")
        .map((l) => ({ path: l.path, recordCount: l.recordCount })),
    ),
    lists,
    sourceProfiles: profiles,
  };
}

/**
 * Equity assembly: a direct `equity_grants` mapping (LLM extraction or a
 * source array) wins; otherwise the flat virtual equity_* fields become a
 * single "mapped" grant. Either way the mapping table stays flat rows.
 */
function assembleGrants(resolved: Record<string, unknown>): EquityGrant[] {
  const direct = resolved.equity_grants;
  if (Array.isArray(direct)) return coerceGrants(direct, "mapped");

  const type = GRANT_TYPES.includes(resolved.equity_grant_type as GrantType)
    ? (resolved.equity_grant_type as GrantType)
    : "unknown";
  const grant: EquityGrant = {
    type,
    value: toFiniteNumber(resolved.equity_grant_value),
    vesting_months: toFiniteNumber(resolved.equity_vesting_months),
    cliff_months: toFiniteNumber(resolved.equity_cliff_months),
    granted:
      typeof resolved.equity_granted === "string" && resolved.equity_granted !== ""
        ? resolved.equity_granted
        : null,
    strike_price: toFiniteNumber(resolved.equity_strike_price),
    provenance: "mapped",
  };
  const hasContent =
    grant.value !== null || grant.vesting_months !== null || grant.cliff_months !== null ||
    grant.granted !== null || grant.strike_price !== null;
  return hasContent ? [grant] : [];
}
