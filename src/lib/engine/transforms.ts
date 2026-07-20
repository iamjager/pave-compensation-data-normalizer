import type { MappingRule } from "./config";
import { coerceGrants, type EquityExtractor } from "./equity";
import type { IssueSeverity } from "./issues";
import { getPath } from "./paths";

/**
 * The transform registry. Each entry is a pure value-level function plus
 * enough metadata for the mapper UI to render an editor for it.
 * Adding a capability to the config language = adding one entry here.
 */

export interface TransformArgDef {
  name: string;
  label: string;
  type: "string" | "number" | "map" | "source_path";
  required?: boolean;
}

export interface TransformCtx {
  /** The full raw record, for transforms that read sibling fields. */
  record: Record<string, unknown>;
  targetField: string;
  addIssue(severity: IssueSeverity, code: string, message: string, value?: unknown): void;
  /** Attach provenance metadata to the output record (namespaced per field). */
  annotate(key: string, value: unknown): void;
  equityExtractor?: EquityExtractor;
}

export interface TransformDef {
  id: string;
  label: string;
  description: string;
  args: TransformArgDef[];
  fn(value: unknown, args: Record<string, unknown>, ctx: TransformCtx): unknown | Promise<unknown>;
}

const FREQUENCY_FACTORS: Record<string, number> = {
  annual: 1, annually: 1, year: 1, yearly: 1,
  quarter: 4, quarterly: 4,
  month: 12, monthly: 12,
  week: 52, weekly: 52,
  hour: 40 * 52, hourly: 40 * 52,
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export const TRANSFORMS: Record<string, TransformDef> = {
  trim: {
    id: "trim",
    label: "Trim whitespace",
    description: "Removes surrounding whitespace from text.",
    args: [],
    fn: (value) => (typeof value === "string" ? value.trim() : value),
  },

  to_number: {
    id: "to_number",
    label: "To number",
    description: "Parses text into a number; flags values that aren't numeric.",
    args: [],
    fn: (value, _args, ctx) => {
      const n = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""));
      if (!Number.isFinite(n)) {
        ctx.addIssue("warning", "not_a_number", `"${String(value)}" is not a number`, value);
        return null;
      }
      return n;
    },
  },

  split: {
    id: "split",
    label: "Split text",
    description: "Splits text on a separator and keeps one part (e.g. \"Last, First\" → parts 0 and 1). A missing part becomes empty, not an error.",
    args: [
      { name: "separator", label: "Separator", type: "string", required: true },
      { name: "index", label: "Part # (from 0)", type: "number", required: true },
    ],
    fn: (value, args) => {
      const parts = String(value).split(String(args.separator ?? ","));
      const part = parts[Number(args.index ?? 0)];
      return part === undefined ? null : part.trim();
    },
  },

  map_values: {
    id: "map_values",
    label: "Map values",
    description: "Translates source values via an explicit lookup (e.g. A → active). Unmapped values become empty and are flagged.",
    args: [{ name: "map", label: "Value map", type: "map", required: true }],
    fn: (value, args, ctx) => {
      const map = (args.map ?? {}) as Record<string, unknown>;
      const key = String(value);
      if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
      ctx.addIssue(
        "warning", "enum_unmapped",
        `Value "${key}" has no mapping for ${ctx.targetField}`, key,
      );
      return null;
    },
  },

  annualize: {
    id: "annualize",
    label: "Annualize amount",
    description: "Converts an amount to annual using a frequency read from another source field (Month × 12, Quarter × 4, Hour × 2080, Year × 1).",
    args: [{ name: "frequency_source", label: "Frequency field", type: "source_path", required: true }],
    fn: (value, args, ctx) => {
      const n = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""));
      if (!Number.isFinite(n)) {
        ctx.addIssue("warning", "not_a_number", `"${String(value)}" is not a number`, value);
        return null;
      }
      const freqRaw = getPath(ctx.record, String(args.frequency_source ?? ""));
      if (freqRaw === null || freqRaw === undefined || freqRaw === "") {
        ctx.addIssue("warning", "frequency_missing",
          `No pay frequency at "${String(args.frequency_source)}" — assuming annual`);
        return round2(n);
      }
      const factor = FREQUENCY_FACTORS[String(freqRaw).trim().toLowerCase()];
      if (factor === undefined) {
        ctx.addIssue("warning", "frequency_unknown",
          `Unrecognized pay frequency "${String(freqRaw)}"`, freqRaw);
        return null;
      }
      if (factor !== 1) ctx.annotate("annualized_from", String(freqRaw));
      return round2(n * factor);
    },
  },

  parse_date: {
    id: "parse_date",
    label: "Parse date",
    description: "Normalizes a date to YYYY-MM-DD; flags values that aren't valid dates.",
    args: [],
    fn: (value, _args, ctx) => {
      const s = String(value).trim();
      const isoLike = /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
      const parsed = new Date(isoLike ?? s);
      if (Number.isNaN(parsed.getTime())) {
        ctx.addIssue("warning", "invalid_date", `"${s}" is not a valid date`, value);
        return null;
      }
      return isoLike ?? parsed.toISOString().slice(0, 10);
    },
  },

  stringify: {
    id: "stringify",
    label: "Object to text",
    description: "Flattens a structured value into readable text (e.g. {type, split} → \"type: uncapped, split: 50/50\").",
    args: [],
    fn: (value) => {
      if (value === null || typeof value !== "object") return String(value);
      const parts = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
      return parts.length > 0 ? parts.join(", ") : null;
    },
  },

  extract_equity_llm: {
    id: "extract_equity_llm",
    label: "Extract grants from text (LLM)",
    description: "Reads free-text equity notes and extracts structured grants (value, vesting, cliff, strike). Output is flagged as inferred; the raw text is always kept.",
    args: [],
    fn: async (value, _args, ctx) => {
      const text = typeof value === "string" ? value.trim() : "";
      if (text === "") return [];
      if (!ctx.equityExtractor) {
        ctx.addIssue("warning", "equity_extraction_unavailable",
          "Equity extraction is not available (no API key) — raw notes retained");
        return [];
      }
      const result = await ctx.equityExtractor.extract(text);
      if (result.error) {
        ctx.addIssue("warning", "equity_extraction_failed",
          `Equity extraction failed: ${result.error} — raw notes retained`);
        return [];
      }
      const grants = coerceGrants(result.grants, "llm_inferred");
      if (grants.length > 0) ctx.annotate("llm_inferred", true);
      return grants;
    },
  },
};

export const TRANSFORM_IDS: ReadonlySet<string> = new Set(Object.keys(TRANSFORMS));

const isEmpty = (v: unknown) => v === null || v === undefined || v === "";

/**
 * Resolve one mapping rule against one raw record.
 * Contract: empty input (null/undefined/"") short-circuits the transform
 * chain to null; a transform returning empty stops the chain; the rule's
 * fallback applies last.
 */
export async function applyRule(
  rule: MappingRule,
  ctx: TransformCtx,
): Promise<unknown> {
  let value: unknown =
    rule.const !== undefined ? rule.const :
    rule.source ? getPath(ctx.record, rule.source) : undefined;

  if (!isEmpty(value)) {
    for (const spec of rule.transforms ?? []) {
      const def = TRANSFORMS[spec.fn];
      if (!def) {
        ctx.addIssue("error", "unknown_transform", `Unknown transform "${spec.fn}"`);
        return null;
      }
      value = await def.fn(value, spec.args ?? {}, ctx);
      if (isEmpty(value)) break;
    }
  }

  if (isEmpty(value)) value = rule.fallback !== undefined ? rule.fallback : null;
  return value ?? null;
}
