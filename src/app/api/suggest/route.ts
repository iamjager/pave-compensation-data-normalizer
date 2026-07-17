import { NextResponse } from "next/server";
import { guessRecordsPath, loadRecords } from "@/lib/engine/loaders";
import { profileRecords } from "@/lib/engine/profile";
import {
  buildSuggestPrompt,
  fuzzySuggest,
  parseSuggestResponse,
} from "@/lib/engine/suggest-core";
import { getClient, hasApiKey, LLM_MODEL } from "@/lib/server/llm";
import { readConfig, readRawFile } from "@/lib/server/store";

/**
 * Design-time drafting: the LLM sees field names + samples (never whole
 * records) and proposes config for human review. Degrades to fuzzy
 * name-matching without an API key — the tool never requires the LLM.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { sourceId: string; recordsPath?: string | null };
    const { text, info } = readRawFile(body.sourceId);
    const recordsPath =
      body.recordsPath ??
      readConfig(body.sourceId)?.source.records_path ??
      (info.format === "json" ? guessRecordsPath(text) ?? undefined : undefined);

    const { records } = loadRecords(text, { format: info.format, records_path: recordsPath });
    const profiles = profileRecords(records);

    if (hasApiKey()) {
      try {
        const { system, user } = buildSuggestPrompt(profiles, {
          format: info.format,
          recordsPath: recordsPath ?? null,
        });
        const response = await getClient().messages.create({
          model: LLM_MODEL,
          max_tokens: 8192,
          system,
          messages: [{ role: "user", content: user }],
        });
        const textBlock = response.content.find((b) => b.type === "text");
        const result = parseSuggestResponse(textBlock?.text ?? "");
        return NextResponse.json({ ...result, provider: "llm" });
      } catch (e) {
        console.error("LLM suggest failed, falling back to fuzzy matching:", e);
      }
    }
    return NextResponse.json({ ...fuzzySuggest(profiles), provider: "fuzzy" });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
