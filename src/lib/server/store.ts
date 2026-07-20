import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CompanyConfig } from "@/lib/engine/config";
import { loadRecords } from "@/lib/engine/loaders";
import type { RunResult } from "@/lib/engine/normalize";

/**
 * All persistence is flat JSON files under src/data — a deliberate choice:
 * transparent, diffable, zero setup. Only this module knows the paths.
 */

const DATA_ROOT = path.join(process.cwd(), "src", "data");
export const RAW_DIR = path.join(DATA_ROOT, "raw");
export const CONFIG_DIR = path.join(DATA_ROOT, "configs");
export const EQUITY_CACHE_DIR = path.join(DATA_ROOT, "cache", "equity");
export const OUTPUT_DIR = path.join(DATA_ROOT, "output");

const SAFE_ID = /^[a-zA-Z0-9_-]+$/;

const assertSafeId = (id: string): string => {
  if (!SAFE_ID.test(id)) throw new Error(`Invalid identifier "${id}"`);
  return id;
};

export interface SourceFileInfo {
  id: string;
  fileName: string;
  format: "json" | "csv";
}

export function listSourceFiles(): SourceFileInfo[] {
  return readdirSync(RAW_DIR)
    .filter((f) => f.endsWith(".json") || f.endsWith(".csv"))
    .sort()
    .map((fileName) => ({
      id: fileName.replace(/\.(json|csv)$/, ""),
      fileName,
      format: fileName.endsWith(".csv") ? "csv" as const : "json" as const,
    }));
}

/** Derive a company id from an uploaded file name; always passes SAFE_ID. */
export function sanitizeCompanyId(fileName: string): string {
  const base = fileName.replace(/\.[^.]*$/, "");
  const id = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return id !== "" ? id : "company";
}

export function rawFileExists(id: string): boolean {
  return listSourceFiles().some((f) => f.id === id);
}

/**
 * Write (or replace) a company's raw export. Any existing raw file with the
 * same id is removed first — including one with the other extension — so an
 * id always maps to exactly one file.
 */
export function writeRawFile(id: string, format: "json" | "csv", text: string): SourceFileInfo {
  assertSafeId(id);
  mkdirSync(RAW_DIR, { recursive: true });
  for (const existing of listSourceFiles()) {
    if (existing.id === id) unlinkSync(path.join(RAW_DIR, existing.fileName));
  }
  const fileName = `${id}.${format}`;
  writeFileSync(path.join(RAW_DIR, fileName), text);
  return { id, fileName, format };
}

export function readRawFile(id: string): { text: string; info: SourceFileInfo } {
  const info = listSourceFiles().find((f) => f.id === assertSafeId(id));
  if (!info) throw new Error(`Unknown source file "${id}"`);
  return { text: readFileSync(path.join(RAW_DIR, info.fileName), "utf8"), info };
}

export function readConfig(companyId: string): CompanyConfig | null {
  const file = path.join(CONFIG_DIR, `${assertSafeId(companyId)}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as CompanyConfig;
}

/** Saving always bumps the version and stamps updated_at. */
export function writeConfig(config: CompanyConfig): CompanyConfig {
  assertSafeId(config.company_id);
  const previous = readConfig(config.company_id);
  const saved: CompanyConfig = {
    ...config,
    config_version: (previous?.config_version ?? 0) + 1,
    updated_at: new Date().toISOString(),
  };
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(path.join(CONFIG_DIR, `${config.company_id}.json`), JSON.stringify(saved, null, 2) + "\n");
  return saved;
}

/** Remove a company's saved mapping config. Returns false if none existed. */
export function deleteConfig(companyId: string): boolean {
  const file = path.join(CONFIG_DIR, `${assertSafeId(companyId)}.json`);
  if (!existsSync(file)) return false;
  unlinkSync(file);
  return true;
}

/**
 * Content hashes of every string value in a parsed document — the same
 * sha256(trimmed text) the equity-extraction cache uses as its file name,
 * so cache entries can be matched EXACTLY (a shorter note that is merely a
 * substring of another company's note must not match).
 */
export function collectStringHashes(value: unknown, hashes = new Set<string>()): Set<string> {
  if (typeof value === "string" && value.trim() !== "") {
    hashes.add(createHash("sha256").update(value.trim()).digest("hex"));
  } else if (Array.isArray(value)) {
    for (const item of value) collectStringHashes(item, hashes);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStringHashes(item, hashes);
  }
  return hashes;
}

/**
 * Remove a company entirely: raw file, saved config, and cached equity
 * extractions whose exact source text occurs in the file. The cache is
 * content-addressed (keyed by note text, not by company), so an identical
 * note shared with another company is removed too — it simply re-extracts
 * on next use.
 */
export function deleteCompany(id: string): {
  rawDeleted: boolean;
  configDeleted: boolean;
  cacheDeleted: number;
} {
  assertSafeId(id);
  const info = listSourceFiles().find((f) => f.id === id);
  let cacheDeleted = 0;

  if (info) {
    const rawText = readFileSync(path.join(RAW_DIR, info.fileName), "utf8");
    let hashes = new Set<string>();
    try {
      hashes = collectStringHashes(
        info.format === "json" ? JSON.parse(rawText) : loadRecords(rawText, { format: "csv" }).records,
      );
    } catch {
      // unparseable file — delete it without cache cleanup
    }
    if (hashes.size > 0 && existsSync(EQUITY_CACHE_DIR)) {
      for (const entry of readdirSync(EQUITY_CACHE_DIR).filter((f) => f.endsWith(".json"))) {
        if (hashes.has(entry.replace(/\.json$/, ""))) {
          unlinkSync(path.join(EQUITY_CACHE_DIR, entry));
          cacheDeleted += 1;
        }
      }
    }
    unlinkSync(path.join(RAW_DIR, info.fileName));
  }

  return { rawDeleted: Boolean(info), configDeleted: deleteConfig(id), cacheDeleted };
}

export function writeOutput(result: RunResult): string {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const stamp = result.envelope.run_at.replace(/[:.]/g, "-");
  const file = path.join(OUTPUT_DIR, `${result.envelope.company_id}.${stamp}.normalized.json`);
  // sourceProfiles is UI plumbing, not part of the normalized dataset.
  const { sourceProfiles: _omit, ...persisted } = result;
  writeFileSync(file, JSON.stringify(persisted, null, 2) + "\n");
  return path.relative(process.cwd(), file);
}
