# Design Decisions

A tool like this is a chain of judgment calls. The ones marked **Human call** were made — or forced — by me during the design discussion, usually by pushing back on the AI's first proposal; they are highlighted because that's where the product got its shape. The full split is in [AI usage](#ai-usage) at the end.

To see the decisions below in action, watch [`demo.mp4`](./demo.mp4) (~4 minutes, covering onboarding, the trust loop, drift repair, and validation).

## Product decisions (the Integration Mapper)

**Who this is for.** An integrations specialist whose job has three cognitive parts: understand an unfamiliar export, match it semantically to the schema, and catch the traps — Globex pays two people per *month*, so mapping `payRate` without noticing `payPer` ships a $6,666 "salary" into benchmarks. Every screen decision serves one of those three parts.

**A workbench, not a wizard.** One screen: a source profiler on the left (types, fill rates, samples — how you notice a commission block exists on only 2 of 20 records), a mapping table keyed by *target* field in the middle (required badges and a "6/8 required mapped" counter — the specialist always knows what *done* looks like), and the trust loop at the bottom: a live preview that re-runs the real pipeline on every edit, per-record status, raw-vs-normalized side by side, and a summary that always reconciles ("15 clean · 2 warnings · 0 quarantined · of 17"). Preview and saved runs go through the same normalize call, so the UI provably produces the exact artifact the pipeline runs. Trust comes from watching real records validate, not from software sounding confident. The showpiece for non-technical users: the value-map editor pre-fills with the distinct values actually in the file, so mapping status codes means picking meanings from dropdowns, not typing config.

**Human call — the LLM assists; humans commit.** I pushed on how AI fits a tool for "regular people" before agreeing to any of it. The contract we settled on: the LLM only *drafts* (mapping suggestions from field names + samples; equity grants from free text), every draft is visibly provisional (suggestion chips, confidence, ✨inferred badges), Save is the only commit point, and the deterministic pipeline never depends on a live model call — remove the API key and the tool still fully works. For a compensation platform, "the model decided your salary" must never be a sentence anyone has to say.

**Human call — drift and bad data are product surfaces, not error handling.** I asked early: what happens when a company's data structure changes next quarter, and how do we validate corrupted data? That moved two things into core scope: three-class drift detection on every run (mapped fields that vanished upstream, enum values the map has never seen, source data being silently dropped) and the principle that the mapper doubles as the *maintenance* surface — a new export run against a saved config self-reports what broke, and you repair it in the same screen you onboarded with.

**Human call — self-serve onboarding.** The AI's first cut-list included file upload, with "drop the export into `src/data/raw/`" as the workaround. I rejected that: it's a developer instruction in a tool whose premise is non-technical users. The full lifecycle now lives in the UI — upload (drag-drop, shape-only validation with friendly errors), replace (uploading for an existing company keeps its config and turns the name collision into the drift-repair flow), reset a mapping, and delete a company including its cached extractions.

**Never silent.** Errors quarantine a record — flagged and excluded from the clean count, but always listed with reasons, never dropped. Warnings include the record, flagged. The summary reconciles to the input count, and deliberately unmapped source columns stay visible in the drift panel. A specialist can always tell a data problem (kick back to the customer) from a mapping problem (fix here).

Left out on purpose: config version history/diff UI (lineage is recorded; only the current version is shown), per-row suggestion accept/reject (Save confirms all — one decision instead of twenty), transform-chip reordering, auth/multi-user.

## Design decisions

### Standard schema

**Human call — the hybrid comp shape.** The AI recommended flat fields for everything; I caught the case that breaks it: Globex's Mike Reeves has an initial RSU grant *plus a refresh* in one free-text note, and a single `equity_grant_value` slot loses one of them. The test we settled on: model a concept as repeating only if it repeats in reality. Base, bonus, and commission are single-instance in all three sources → flat fields (every mapping row stays a simple `target ← source + transforms` line). Equity genuinely repeats (refreshes are standard practice) → an `equity_grants[]` array of typed grants. Structured sources fill one grant through flat "virtual" fields the engine assembles; only the LLM extractor emits several — so multi-grant support cost engine work, not UI complexity.

**Human call — job architecture is first-class.** I flagged Acme's `job_profile` (two kinds of level; family as distinct from org) as schema-worthy. Benchmarking is keyed on *family × level × location*, so these are the platform's join keys, not nice-to-haves. Levels stay raw ("P4" — cross-company leveling is a later mapping problem), and distinct concepts stay distinct even when only one source separates them: `job_family` ≠ `department`, Acme's `supervisory_org` is really department+team in one string, and Globex's `division` nests the *opposite* way to Acme's. Sparse-but-honest beats dense-but-wrong.

**Human call — the completeness audit.** When schema drafts kept missing fields, I made the AI re-audit all three files field-by-field. That recovered `bonus_plan_name`, equity `cliff_months`, `pay_type` (hourly exists even though this data has none), and Acme's report-level `generated_at`, which became dataset lineage. Every source field is now mapped, consumed by a transform, or *visibly* dropped.

Two more schema stances: bonus keeps both percent and amount forms because the sources genuinely disagree — deriving one from the other silently would fabricate data; amounts are annualized numbers with the original frequency kept as a per-record annotation ("annualized from Month"), not a schema field.

### Config format

One JSON document per company: `{source: {format, records_path}, mappings: {<target>: {source | const, transforms[]}}}` — dot-paths cover nested JSON and CSV columns behind one interface, and a small transform registry (`split`, `map_values`, `annualize`, `parse_date`, `to_number`, `stringify`, `extract_equity_llm`) does the rest. Each transform declares its args, so the UI renders editors generically and adding a capability is one registry entry. Deliberately *not* expressible: arbitrary code, conditional logic, cross-record joins, per-company validation overrides — each would erode the two properties that matter most: a non-engineer can read the config, and the UI can author all of it. Validation lives on the schema registry, not in configs, so every company is held to the same bar.

### Storage

**Human call — one entity or several tables?** I raised the modeling question directly. The answer separates the logical record (flat + grants array) from physical storage: three kinds of immutable JSON documents — configs (version-bumped on save), run envelopes (lineage: source file, its own snapshot date, config version, run time, summary), and one employee record per run carrying its `issues[]`. Pipeline outputs are snapshot facts, never mutated in place — which buys reproducibility, run-to-run diffing (that *is* drift detection), and audit lineage. Relational decomposition (grant tables, comp-component facts) belongs in the warehouse when analytics demands it. Flat files keep the tool transparent; only `store.ts` knows the paths, so swapping in a database is one file.

### Error handling

Layered, because different layers catch different failures: parse-level (bad numbers and dates, unmapped enum values), schema sanity rules — the underrated one is plausibility ranges, where the $10k salary floor catches *both* fat-fingered data *and* a forgotten annualize transform — cross-field (termination before hire), cross-record (duplicate IDs), and config-level warnings (unknown fields or transforms). LLM failures degrade to warnings with the raw text retained. Every output is stamped with lineage, and reruns reproduce byte-for-byte — extraction included, thanks to a committed, content-addressed cache.

## AI usage

**In the product** — two contained features under the contract described above: suggest-mappings, which drafted 19/19 correct rules for the Initech CSV in testing and flagged its one genuine judgment call (`DEPT_NAME → job_family`) as low-confidence; and equity extraction, structured-output constrained, cached by content hash, committed for offline reproducibility, and flagged `llm_inferred` per grant.

**In building it** — designed and built with Claude Code, and the **Human call** markers above are the honest record of the split: the AI proposed designs, wrote nearly all the code and tests, and moved fast; I set direction and corrected it at the load-bearing moments — the refresh-grant catch that changed the schema shape, the field-completeness audit, insisting upload belongs in a tool for non-technical users, and pulling drift and validation into core scope. End-to-end verification earned its keep too: live testing caught a real bug in delete's cache cleanup (substring matching wrongly removed a neighboring company's `"50k RSU…"` entry because it's a substring of `"150k RSU…"`; fixed with exact content-hash matching plus a regression test). What worked well: AI turns a precise spec into working code remarkably fast. What required human judgment: everything that made the spec precise.

For anyone who wants the primary source, the full working session — the design debate behind every Human call above, plan reviews, implementation, and the live verification runs — is exported verbatim in [`claude-code-pave-compensation-data-normalizer-session.txt`](./claude-code-pave-compensation-data-normalizer-session.txt).
