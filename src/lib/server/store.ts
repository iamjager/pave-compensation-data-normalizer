import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CompanyConfig } from "@/lib/engine/config";
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

export function writeOutput(result: RunResult): string {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const stamp = result.envelope.run_at.replace(/[:.]/g, "-");
  const file = path.join(OUTPUT_DIR, `${result.envelope.company_id}.${stamp}.normalized.json`);
  writeFileSync(file, JSON.stringify(result, null, 2) + "\n");
  return path.relative(process.cwd(), file);
}
