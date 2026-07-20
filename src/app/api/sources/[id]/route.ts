import { NextResponse } from "next/server";
import { enumerateListsFromText, guessRecordsPath, loadRecords } from "@/lib/engine/loaders";
import { profileRecords } from "@/lib/engine/profile";
import { deleteCompany, readConfig, readRawFile } from "@/lib/server/store";

/**
 * Source inspection: parse the raw file (applying the saved config's full
 * source spec, including additional lists) and profile every field. Falls
 * back to an explicit ?records_path= override or a best-effort guess for
 * brand-new files.
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

    // A records_path override that points at a configured additional list
    // promotes it to primary — drop the stale list entry.
    const additionalLists = (config?.source.additional_lists ?? []).filter(
      (l) => l.path !== recordsPath,
    );

    const { records, sourceGeneratedAt, lists } = loadRecords(text, {
      format: info.format,
      records_path: recordsPath,
      generated_at_path: config?.source.generated_at_path,
      additional_lists: additionalLists,
    });

    // Join-key candidates per list, for the merge pickers.
    const enumerated = info.format === "json" ? enumerateListsFromText(text) : [];
    const listsWithKeys = lists.map((list) => ({
      ...list,
      keyCandidates: [
        ...new Set(
          (enumerated.find((e) => e.path === list.path)?.records ?? [])
            .slice(0, 50)
            .flatMap((r) => Object.keys(r)),
        ),
      ],
    }));

    return NextResponse.json({
      info,
      recordsPath: recordsPath ?? null,
      recordCount: records.length,
      sourceGeneratedAt,
      profiles: profileRecords(records),
      sampleRecords: records.slice(0, 5),
      lists: listsWithKeys,
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
