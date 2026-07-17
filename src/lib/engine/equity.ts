import { GRANT_TYPES } from "./schema";

export type GrantType = (typeof GRANT_TYPES)[number];
export type GrantProvenance = "mapped" | "llm_inferred";

export interface EquityGrant {
  type: GrantType;
  value: number | null;
  vesting_months: number | null;
  cliff_months: number | null;
  /** Kept as written in the source (often partial, e.g. "2023-01"). */
  granted: string | null;
  strike_price: number | null;
  provenance: GrantProvenance;
}

export interface EquityExtractionResult {
  grants: EquityGrant[];
  error?: string;
}

/**
 * Extraction is injected into the engine so the pipeline stays pure:
 * the server provides an LLM-backed implementation, tests provide mocks.
 */
export interface EquityExtractor {
  extract(text: string): Promise<EquityExtractionResult>;
}

const asNumber = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const asString = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

/**
 * Coerce untrusted (LLM or directly-mapped) output into well-typed grants;
 * drops empty rows. An item's own valid provenance wins over the default,
 * so re-coercing already-extracted grants is lossless.
 */
export function coerceGrants(raw: unknown, defaultProvenance: GrantProvenance): EquityGrant[] {
  if (!Array.isArray(raw)) return [];
  const grants: EquityGrant[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== "object") continue;
    const g = item as Record<string, unknown>;
    const type = GRANT_TYPES.includes(g.type as GrantType) ? (g.type as GrantType) : "unknown";
    const provenance: GrantProvenance =
      g.provenance === "llm_inferred" || g.provenance === "mapped"
        ? g.provenance
        : defaultProvenance;
    const grant: EquityGrant = {
      type,
      value: asNumber(g.value),
      vesting_months: asNumber(g.vesting_months),
      cliff_months: asNumber(g.cliff_months),
      granted: asString(g.granted),
      strike_price: asNumber(g.strike_price),
      provenance,
    };
    const hasContent =
      grant.value !== null || grant.vesting_months !== null || grant.granted !== null ||
      grant.strike_price !== null || grant.cliff_months !== null;
    if (hasContent) grants.push(grant);
  }
  return grants;
}
