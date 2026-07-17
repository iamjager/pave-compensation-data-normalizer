import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  coerceGrants,
  type EquityExtractionResult,
  type EquityExtractor,
} from "@/lib/engine/equity";
import { getClient, hasApiKey, LLM_MODEL } from "./llm";
import { EQUITY_CACHE_DIR } from "./store";

/**
 * LLM-backed equity extraction with a committed disk cache keyed by the
 * sha256 of the note text. The cache makes runs deterministic and lets the
 * demo (and tests) work offline; a cache miss without an API key degrades
 * to a warning in the pipeline while the raw notes are always retained.
 */

const SYSTEM_PROMPT = `You extract structured equity grant data from free-text HR system notes.

Rules:
- A bare amount like "500k" or "150k" is a grant VALUE in USD (k = thousand). It is never a share count.
- "over 4 years" or "4yr vest" means vesting_months = 48. "1yr cliff" means cliff_months = 12.
- Grant dates like "granted 2023-01" go into "granted" exactly as written (a string, possibly partial).
- "RSU" -> type "rsu". "options" -> type "option"; "strike $4.20" -> strike_price 4.2.
- A "Refresh:" clause or any additional sentence describing another grant is a SEPARATE grant.
- Use null for anything the text does not state. If the text describes no equity, return {"grants": []}.`;

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["grants"],
  properties: {
    grants: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "value", "vesting_months", "cliff_months", "granted", "strike_price"],
        properties: {
          type: { type: "string", enum: ["rsu", "option", "unknown"] },
          value: { anyOf: [{ type: "number" }, { type: "null" }] },
          vesting_months: { anyOf: [{ type: "number" }, { type: "null" }] },
          cliff_months: { anyOf: [{ type: "number" }, { type: "null" }] },
          granted: { anyOf: [{ type: "string" }, { type: "null" }] },
          strike_price: { anyOf: [{ type: "number" }, { type: "null" }] },
        },
      },
    },
  },
} as const;

const cacheFile = (text: string): string => {
  const key = createHash("sha256").update(text.trim()).digest("hex");
  return path.join(EQUITY_CACHE_DIR, `${key}.json`);
};

class CachedLlmEquityExtractor implements EquityExtractor {
  async extract(text: string): Promise<EquityExtractionResult> {
    const file = cacheFile(text);
    if (existsSync(file)) {
      const cached = JSON.parse(readFileSync(file, "utf8")) as { grants: unknown };
      return { grants: coerceGrants(cached.grants, "llm_inferred") };
    }
    if (!hasApiKey()) {
      return { grants: [], error: "no cached extraction and ANTHROPIC_API_KEY is not set" };
    }

    try {
      const response = await getClient().messages.create({
        model: LLM_MODEL,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        output_config: { format: { type: "json_schema", schema: EXTRACTION_SCHEMA } },
        messages: [{ role: "user", content: `Equity notes:\n${text}` }],
      });
      if (response.stop_reason !== "end_turn") {
        return { grants: [], error: `extraction stopped unexpectedly (${response.stop_reason})` };
      }
      const textBlock = response.content.find((b) => b.type === "text");
      const parsed = JSON.parse(textBlock?.text ?? "{}") as { grants?: unknown };
      const grants = coerceGrants(parsed.grants, "llm_inferred");

      mkdirSync(EQUITY_CACHE_DIR, { recursive: true });
      writeFileSync(file, JSON.stringify({ source_text: text, grants }, null, 2) + "\n");
      return { grants };
    } catch (e) {
      return { grants: [], error: e instanceof Error ? e.message : String(e) };
    }
  }
}

export function getEquityExtractor(): EquityExtractor {
  return new CachedLlmEquityExtractor();
}
