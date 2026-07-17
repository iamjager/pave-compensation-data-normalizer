import { NextResponse } from "next/server";
import { loadRecords } from "@/lib/engine/loaders";
import {
  listSourceFiles,
  rawFileExists,
  readConfig,
  readRawFile,
  sanitizeCompanyId,
  writeRawFile,
} from "@/lib/server/store";

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

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Onboard (or replace) a company's raw export from the browser. Validates
 * shape only — mapping stays interactive in the mapper. Uploading a file
 * whose id already exists returns 409 unless ?overwrite=1: replacing is the
 * drift-repair flow (config kept; the next preview reports what changed).
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file received — attach the export as \"file\"" }, { status: 400 });
    }
    const format = file.name.toLowerCase().match(/\.(json|csv)$/)?.[1] as "json" | "csv" | undefined;
    if (!format) {
      return NextResponse.json({ error: "Upload a .json or .csv export from the HR system" }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "File is larger than 5 MB — that doesn't look like an HR export" }, { status: 400 });
    }

    const text = await file.text();
    if (format === "json") {
      try {
        JSON.parse(text);
      } catch {
        return NextResponse.json(
          { error: "This file isn't valid JSON — re-export it from the HR system and try again" },
          { status: 400 },
        );
      }
    } else {
      try {
        if (loadRecords(text, { format: "csv" }).records.length === 0) {
          return NextResponse.json({ error: "This CSV has a header row but no data rows" }, { status: 400 });
        }
      } catch (e) {
        return NextResponse.json(
          { error: `This CSV couldn't be parsed: ${e instanceof Error ? e.message : String(e)}` },
          { status: 400 },
        );
      }
    }

    const id = sanitizeCompanyId(file.name);
    const replacing = rawFileExists(id);
    const overwrite = new URL(request.url).searchParams.get("overwrite") === "1";
    if (replacing && !overwrite) {
      return NextResponse.json(
        { error: `A company "${id}" already exists`, conflict: true, id },
        { status: 409 },
      );
    }

    const info = writeRawFile(id, format, text);
    return NextResponse.json({ ...info, replaced: replacing }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
