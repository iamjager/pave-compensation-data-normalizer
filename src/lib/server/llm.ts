import Anthropic from "@anthropic-ai/sdk";

/**
 * All LLM usage is server-side and design-time-shaped: suggesting mappings
 * and extracting structure from free text, always cached or human-reviewed.
 * The deterministic pipeline never depends on a live API call.
 */

export const LLM_MODEL = "claude-opus-4-8";

export const hasApiKey = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}
