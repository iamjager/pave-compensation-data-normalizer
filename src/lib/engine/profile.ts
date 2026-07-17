/**
 * Profiles raw records so a non-technical user can understand the source:
 * every leaf path with its inferred type, fill rate, and sample values.
 * Also feeds the suggest prompt and the drift report.
 */

export type InferredType = "string" | "number" | "boolean" | "array" | "mixed";

export interface FieldProfile {
  path: string;
  inferredType: InferredType;
  /** Share of records where this path is non-null and non-empty (0–1). */
  fillRate: number;
  samples: unknown[];
  /** Present only when the field has few distinct values (enum candidates). */
  distinctValues?: unknown[];
}

const MAX_SAMPLES = 5;
const MAX_DISTINCT = 25;

interface Accumulator {
  filled: number;
  types: Set<string>;
  samples: unknown[];
  distinct: Map<string, unknown>;
  distinctOverflow: boolean;
}

export function profileRecords(records: Record<string, unknown>[]): FieldProfile[] {
  const acc = new Map<string, Accumulator>();

  const visit = (value: unknown, path: string) => {
    if (value === null || value === undefined || value === "") return;
    if (typeof value === "object" && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        visit(v, path ? `${path}.${k}` : k);
      }
      return;
    }
    let a = acc.get(path);
    if (!a) {
      a = { filled: 0, types: new Set(), samples: [], distinct: new Map(), distinctOverflow: false };
      acc.set(path, a);
    }
    a.filled += 1;
    a.types.add(Array.isArray(value) ? "array" : typeof value);
    const key = JSON.stringify(value);
    if (!a.distinct.has(key)) {
      if (a.distinct.size >= MAX_DISTINCT) a.distinctOverflow = true;
      else a.distinct.set(key, value);
    }
    if (a.samples.length < MAX_SAMPLES && !a.samples.some((s) => JSON.stringify(s) === key)) {
      a.samples.push(value);
    }
  };

  for (const record of records) visit(record, "");

  const total = records.length || 1;
  return [...acc.entries()].map(([path, a]) => ({
    path,
    inferredType: (a.types.size === 1 ? [...a.types][0] : "mixed") as InferredType,
    fillRate: a.filled / total,
    samples: a.samples,
    ...(a.distinctOverflow ? {} : { distinctValues: [...a.distinct.values()] }),
  }));
}
