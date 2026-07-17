import { NextResponse } from "next/server";
import { normalize } from "@/lib/engine/normalize";
import { getEquityExtractor } from "@/lib/server/equity-extractor";
import { readConfig, readRawFile, writeOutput } from "@/lib/server/store";

/** Export runs the SAVED config (never an unsaved draft) and writes the dataset to disk. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { companyId: string; sourceId: string };
    const config = readConfig(body.companyId);
    if (!config) {
      return NextResponse.json({ error: "Save the config before exporting" }, { status: 400 });
    }
    const { text, info } = readRawFile(body.sourceId);
    const result = await normalize(text, config, {
      sourceFile: info.fileName,
      equityExtractor: getEquityExtractor(),
    });
    const outputPath = writeOutput(result);
    return NextResponse.json({ outputPath, summary: result.envelope.summary });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
