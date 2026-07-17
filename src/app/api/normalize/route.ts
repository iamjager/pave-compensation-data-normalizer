import { NextResponse } from "next/server";
import type { CompanyConfig } from "@/lib/engine/config";
import { normalize } from "@/lib/engine/normalize";
import { getEquityExtractor } from "@/lib/server/equity-extractor";
import { readConfig, readRawFile } from "@/lib/server/store";

/**
 * THE normalization endpoint — the same engine call serves the mapper's
 * live preview (inline draft config in the body) and saved runs (config
 * read from disk by companyId). One config, one pipeline, everywhere.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      sourceId: string;
      config?: CompanyConfig;
      companyId?: string;
    };
    const config = body.config ?? (body.companyId ? readConfig(body.companyId) : null);
    if (!config) {
      return NextResponse.json({ error: "Provide a config or a companyId with a saved config" }, { status: 400 });
    }
    const { text, info } = readRawFile(body.sourceId);
    const result = await normalize(text, config, {
      sourceFile: info.fileName,
      equityExtractor: getEquityExtractor(),
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
