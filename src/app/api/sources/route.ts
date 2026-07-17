import { NextResponse } from "next/server";
import { loadRecords } from "@/lib/engine/loaders";
import { listSourceFiles, readConfig, readRawFile } from "@/lib/server/store";

/** Home-page inventory: every raw file plus its config/record status. */
export async function GET() {
  const sources = listSourceFiles().map((info) => {
    const config = readConfig(info.id);
    let recordCount: number | null = null;
    if (config) {
      try {
        recordCount = loadRecords(readRawFile(info.id).text, config.source).records.length;
      } catch {
        recordCount = null;
      }
    }
    return {
      ...info,
      hasConfig: config !== null,
      configVersion: config?.config_version ?? null,
      companyName: config?.company_name ?? null,
      recordCount,
    };
  });
  return NextResponse.json({ sources });
}
