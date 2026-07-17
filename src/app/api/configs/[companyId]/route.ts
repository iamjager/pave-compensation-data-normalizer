import { NextResponse } from "next/server";
import type { CompanyConfig } from "@/lib/engine/config";
import { readConfig, writeConfig } from "@/lib/server/store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const config = readConfig(companyId);
  if (!config) return NextResponse.json({ error: "No config yet" }, { status: 404 });
  return NextResponse.json({ config });
}

/** Save = the specialist's commit point; the store bumps config_version. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  try {
    const body = (await request.json()) as { config: CompanyConfig };
    if (!body?.config || body.config.company_id !== companyId) {
      return NextResponse.json({ error: "config.company_id must match the URL" }, { status: 400 });
    }
    return NextResponse.json({ config: writeConfig(body.config) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
