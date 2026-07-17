import Papa from "papaparse";
import type { SourceSpec } from "./config";
import { getPath } from "./paths";

export interface LoadedSource {
  records: Record<string, unknown>[];
  sourceGeneratedAt: string | null;
}

/**
 * Parse raw file text into an array of record objects.
 * Throws with a human-readable message on unparseable input — callers
 * (API route / tests) surface it; nothing downstream runs on bad input.
 */
export function loadRecords(rawText: string, source: SourceSpec): LoadedSource {
  if (source.format === "csv") return loadCsv(rawText);
  return loadJson(rawText, source);
}

function loadCsv(rawText: string): LoadedSource {
  // dynamicTyping stays OFF: IDs like EMP_NUM must remain strings; numeric
  // coercion is an explicit mapping decision (the to_number transform).
  const parsed = Papa.parse<Record<string, string>>(rawText.trim(), {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  const fatal = parsed.errors.find((e) => e.type === "Delimiter" || e.type === "Quotes");
  if (fatal) throw new Error(`CSV parse failed: ${fatal.message}`);

  // Empty CSV cells arrive as "" — normalize to null so optional fields
  // don't shower bogus parse warnings downstream.
  const records = parsed.data.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      out[key] = value === "" ? null : value;
    }
    return out;
  });
  return { records, sourceGeneratedAt: null };
}

function loadJson(rawText: string, source: SourceSpec): LoadedSource {
  let doc: unknown;
  try {
    doc = JSON.parse(rawText);
  } catch (e) {
    throw new Error(`JSON parse failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  const arr = source.records_path ? getPath(doc, source.records_path) : doc;
  if (!Array.isArray(arr)) {
    throw new Error(
      source.records_path
        ? `records_path "${source.records_path}" did not resolve to an array`
        : "JSON document is not an array — set source.records_path to the record list",
    );
  }

  const generatedAt = source.generated_at_path ? getPath(doc, source.generated_at_path) : null;
  return {
    records: arr as Record<string, unknown>[],
    sourceGeneratedAt: typeof generatedAt === "string" ? generatedAt : null,
  };
}
