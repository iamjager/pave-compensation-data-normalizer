import type { EquityExtractor } from "@/lib/engine/equity";

/**
 * Placeholder until the LLM step lands: no extractor means the engine emits
 * an "extraction unavailable" warning and keeps raw notes — the documented
 * degraded mode, so every route already behaves correctly end-to-end.
 */
export function getEquityExtractor(): EquityExtractor | undefined {
  return undefined;
}
