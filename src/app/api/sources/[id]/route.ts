import { NextResponse } from "next/server";
import { guessRecordsPath, loadRecords } from "@/lib/engine/loaders";
import { profileRecords } from "@/lib/engine/profile";
import { deleteCompany, readConfig, readRawFile } from "@/lib/server/store";

/**
 * Source inspection: parse the raw file and profile every field.
 * Uses the saved config's source settings when present, an explicit
 * ?records_path= override, or a best-effort guess for brand-new files.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const { text, info } = readRawFile(id);
    const config = readConfig(id);
    const url = new URL(request.url);
    const override = url.searchParams.get("records_path");

    const recordsPath =
      override !== null ? override || undefined
      : config?.source.records_path ?? (info.format === "json" ? guessRecordsPath(text) ?? undefined : undefined);

    const { records, sourceGeneratedAt } = loadRecords(text, {
      format: info.format,
      records_path: recordsPath,
      generated_at_path: config?.source.generated_at_path,
    });

    return NextResponse.json({
      info,
      recordsPath: recordsPath ?? null,
      recordCount: records.length,
      sourceGeneratedAt,
      profiles: profileRecords(records),
      sampleRecords: records.slice(0, 5),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}

/**
 * Remove a company entirely: raw file + saved mapping + cached equity
 * extractions matched by the file's note texts.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const result = deleteCompany(id);
    if (!result.rawDeleted && !result.configDeleted) {
      return NextResponse.json({ error: `Unknown company "${id}"` }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
