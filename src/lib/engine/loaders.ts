import Papa from "papaparse";
import { embedSegment, type SourceSpec } from "./config";
import { getPath } from "./paths";

export interface ListInfo {
  path: string;
  mode: "primary" | "merge" | "concat" | "ignore" | "unhandled";
  recordCount: number;
  /** merge only: how many stream records found a match */
  matchedCount?: number;
  /** merge only: duplicate join keys in the list (last occurrence wins) */
  duplicateKeys?: number;
  /** merge only: the key matched rows are embedded under */
  embedSegment?: string;
  /** configured list not found (or not a record array) in this document */
  missing?: boolean;
  /** embed key already exists natively in the records — merge skipped */
  collision?: boolean;
}

export interface LoadedSource {
  records: Record<string, unknown>[];
  sourceGeneratedAt: string | null;
  /** Every record list in the document and what happened to it. */
  lists: ListInfo[];
}

const isRecordArray = (v: unknown): v is Record<string, unknown>[] =>
  Array.isArray(v) && v.length > 0 && v.every((x) => x && typeof x === "object" && !Array.isArray(x));

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
  return { records, sourceGeneratedAt: null, lists: [] };
}

/**
 * Every record array in a document: all top-level keys first, then one
 * level deep — breadth-first, so the "first list" (the guess default)
 * favors top-level lists.
 */
export function enumerateLists(
  doc: unknown,
): Array<{ path: string; records: Record<string, unknown>[] }> {
  const found: Array<{ path: string; records: Record<string, unknown>[] }> = [];
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return found;
  const entries = Object.entries(doc as Record<string, unknown>);
  for (const [key, value] of entries) {
    if (isRecordArray(value)) found.push({ path: key, records: value });
  }
  for (const [outer, value] of entries) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [inner, nested] of Object.entries(value as Record<string, unknown>)) {
        if (isRecordArray(nested)) found.push({ path: `${outer}.${inner}`, records: nested });
      }
    }
  }
  return found;
}

/** Text-level wrapper for routes; unparseable input yields []. */
export function enumerateListsFromText(
  rawText: string,
): Array<{ path: string; records: Record<string, unknown>[] }> {
  try {
    return enumerateLists(JSON.parse(rawText));
  } catch {
    return [];
  }
}

/**
 * Best-effort guess of where the record array lives in an unknown JSON
 * document: seeds the draft config for a newly uploaded company.
 */
export function guessRecordsPath(rawText: string): string | null {
  try {
    const doc = JSON.parse(rawText);
    if (Array.isArray(doc)) return null; // root array — no path needed
    return enumerateLists(doc)[0]?.path ?? null;
  } catch {
    // unparseable — the loader will report it properly
  }
  return null;
}

const isUsableKey = (v: unknown) => v !== null && v !== undefined && v !== "";

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

  // Shallow-copy records so merges never mutate the parsed document.
  let records = (arr as Record<string, unknown>[]).map((r) => ({ ...r }));

  const configured = source.additional_lists ?? [];
  const lists: ListInfo[] = [
    { path: source.records_path ?? "(root)", mode: "primary", recordCount: records.length },
  ];

  // Concat first, so merges join into the full record stream.
  for (const entry of configured.filter((l) => l.mode === "concat")) {
    const found = getPath(doc, entry.path);
    if (!isRecordArray(found)) {
      lists.push({ path: entry.path, mode: "concat", recordCount: 0, missing: true });
      continue;
    }
    records = records.concat(found.map((r) => ({ ...r })));
    lists.push({ path: entry.path, mode: "concat", recordCount: found.length });
  }

  for (const entry of configured.filter((l) => l.mode === "merge")) {
    const segment = embedSegment(entry.path);
    const found = getPath(doc, entry.path);
    if (!isRecordArray(found)) {
      lists.push({ path: entry.path, mode: "merge", recordCount: 0, missing: true, embedSegment: segment });
      continue;
    }
    // Never clobber a field the records already carry (e.g. Acme's native
    // `compensation` object) — skip the merge and report it instead.
    if (records.some((r) => segment in r)) {
      lists.push({
        path: entry.path, mode: "merge", recordCount: found.length,
        collision: true, embedSegment: segment,
      });
      continue;
    }

    const primaryKey = entry.primary_key ?? "";
    const listKey = entry.list_key || primaryKey;
    const index = new Map<string, Record<string, unknown>>();
    let duplicateKeys = 0;
    for (const row of found) {
      const key = getPath(row, listKey);
      if (!isUsableKey(key)) continue; // unkeyed rows can never match
      if (index.has(String(key))) duplicateKeys += 1;
      index.set(String(key), row);
    }

    let matchedCount = 0;
    for (const record of records) {
      const key = getPath(record, primaryKey);
      if (!isUsableKey(key)) continue;
      const match = index.get(String(key));
      if (match) {
        record[segment] = match;
        matchedCount += 1;
      }
    }
    lists.push({
      path: entry.path, mode: "merge", recordCount: found.length,
      matchedCount, embedSegment: segment,
      ...(duplicateKeys > 0 ? { duplicateKeys } : {}),
    });
  }

  for (const entry of configured.filter((l) => l.mode === "ignore")) {
    const found = getPath(doc, entry.path);
    lists.push({
      path: entry.path, mode: "ignore",
      recordCount: isRecordArray(found) ? found.length : 0,
      ...(isRecordArray(found) ? {} : { missing: true }),
    });
  }

  // Anything enumerated but unaccounted for is an unhandled list — the
  // sidebar prompts for a disposition and drift reports it.
  const covered = new Set(
    [source.records_path, ...configured.map((l) => l.path)].filter(Boolean),
  );
  for (const entry of enumerateLists(doc)) {
    if (!covered.has(entry.path)) {
      lists.push({ path: entry.path, mode: "unhandled", recordCount: entry.records.length });
    }
  }

  return {
    records,
    sourceGeneratedAt: typeof generatedAt === "string" ? generatedAt : null,
    lists,
  };
}
