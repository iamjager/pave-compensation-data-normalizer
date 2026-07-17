/**
 * One-time cache warmer: runs the LLM equity extractor over every distinct
 * equity note in the Globex export and writes the results to
 * src/data/cache/equity/ (committed), so runs, tests, and the demo are
 * deterministic and work offline.
 *
 * Run: npm run warm-cache   (uses ANTHROPIC_API_KEY from .env)
 */
import { loadRecords } from "@/lib/engine/loaders";
import { getEquityExtractor } from "@/lib/server/equity-extractor";
import { readRawFile } from "@/lib/server/store";

async function main() {
  const { text } = readRawFile("globex_inc");
  const { records } = loadRecords(text, { format: "json", records_path: "employees" });

  const notes = [
    ...new Set(
      records
        .map((r) => r.equityNotes)
        .filter((n): n is string => typeof n === "string" && n.trim() !== ""),
    ),
  ];

  console.log(`Extracting ${notes.length} distinct equity notes…`);
  const extractor = getEquityExtractor();
  for (const note of notes) {
    const result = await extractor.extract(note);
    const summary = result.error
      ? `ERROR: ${result.error}`
      : result.grants
          .map((g) => `${g.type} ${g.value ?? "?"} / ${g.vesting_months ?? "?"}mo`)
          .join(" + ");
    console.log(`- "${note.slice(0, 60)}…" -> ${summary}`);
  }
  console.log("Done. Commit src/data/cache/equity/.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
