# Design Decisions

## Schema design

**Shape: flat fields + one embedded array (`equity_grants`).** The full registry lives in [`src/lib/engine/schema.ts`](src/lib/engine/schema.ts) — ~30 fields across Identity, Job & Org, Status & Dates, Location, Cash Comp, and Equity, defined as *data* (label, type, required, enum values, plausibility range, description). Adding a field is one entry; validation and the UI derive from it.

The shape came from a test applied to the actual data: **model a concept as repeating only if it repeats in reality.** Base, bonus, and commission are single-instance in all three sources, so they stay flat — which keeps every mapping-UI row a simple `target ← source + transforms` line a non-engineer can operate. Equity is the one genuinely repeating concept (Globex's Mike Reeves has an initial grant *plus a refresh*; refreshes are standard practice), so it's an array of typed grants `{type rsu|option, value, vesting_months, cliff_months, granted, strike_price, provenance}`. Structured sources fill one grant through flat "virtual" fields the engine assembles; only the LLM text-extractor produces multiple grants — so multi-grant support cost schema+engine work, not UI complexity. A fully component-based comp model (closer to Pave production) was considered and rejected for scope: repeating-group editors for every comp type is the biggest UI time sink, and the hybrid loses nothing on this data.

Deliberate schema stances:

- **Job architecture is first-class** (`job_family`, `job_level`, `management_track`, plus `division`/`department`/`team`): benchmarking is keyed on *family × level × location*, so these are the platform's join keys, not nice-to-haves. Levels are stored **raw** ("P4") — cross-company leveling is a downstream mapping problem (and our `map_values` transform is exactly the right tool for it later).
- **Don't conflate concepts even when only one source distinguishes them.** `job_family` ≠ `department` (Customer Success *departments* contain Solutions *Engineers*); Acme's `supervisory_org` is really department+team in one string; Globex's `division` is *broader* than its department — the reverse of Acme's nesting. Separate optional fields let each source land honestly. Sparse-but-honest beats dense-but-wrong.
- **Bonus keeps both `bonus_target_pct` and `bonus_target_amount`** because the sources genuinely disagree on representation (percent vs absolute). Deriving one from the other silently would fabricate data.
- **Amounts are annualized numbers + a `currency` field**; the original pay frequency survives as a per-record annotation (`annualized_from: "Month"`), not a schema field — the schema holds normalized facts, the envelope holds how they got there.
- **Every source field is accounted for.** The three files were audited field-by-field; the only deliberately dropped columns (`DEPT_CODE`, `LOCATION_CODE` — redundant) surface in the drift panel rather than vanishing. Acme's report-level `generated_at` becomes dataset-level lineage (`source_generated_at`), not a per-employee field.

**Storage: immutable documents, not relational tables.** Three entities: configs (one per company, versioned), dataset runs (envelope with lineage: config version, source file, snapshot date, run time, summary), and employee records (one document per employee *per run*, grants embedded, each carrying its `issues[]`). Normalized records are snapshot facts about a sync run — never mutated in place — so run-scoped immutable documents buy reproducibility, run-to-run diffability, and audit lineage. Relational decomposition (a grants table, comp-component facts) belongs in the warehouse layer when analytics needs it; the mapper shouldn't pay that cost. Persistence is flat JSON files — transparent, diffable, zero setup; only `src/lib/server/store.ts` knows the paths, so swapping in SQLite/Postgres is one file.

## Config design

**Format:** one JSON document per company:

```jsonc
{
  "config_version": 1,                    // bumped on every save
  "company_id": "globex_inc",
  "source": { "format": "json", "records_path": "employees", "generated_at_path": "…" },
  "mappings": {
    "base_salary_annual": {
      "source": "payRate",                // dot-path into the record (or "const": value)
      "transforms": [{ "fn": "annualize", "args": { "frequency_source": "payPer" } }]
    }
  }
}
```

One rule per target field: a **source** (dot-path, null-safe through things like Acme's `bonus_plan: null`) or a **const**, plus an ordered **transform chain** from a small registry: `trim`, `to_number`, `split`, `map_values`, `annualize`, `parse_date`, `stringify`, `extract_equity_llm`. Each transform declares its args schema, so the UI renders editors generically and **adding a transform is one registry entry** — the config language grows without touching the parser.

What it can express (all exercised by the three real configs): nested JSON paths and CSV columns behind one interface; enum translation with explicit value maps (`A → active`; also `"4yr_1yr_cliff" → 48` *and* `→ 12` — same source, two targets); annualization reading a sibling frequency field; splitting combined values ("Last, First", "City, ST", "Dept - Team" — with missing parts going quietly null for "Data Science"-style orgs); constants for fields a source simply lacks (Globex has no currency or country column); flattening structured leftovers to notes text; LLM extraction for genuinely unstructured text.

What it deliberately can't express: arbitrary code or formulas, conditional logic ("if X then map Y"), cross-record joins (resolving `MGR_EMP_NUM` to a name), multi-file merges, per-company validation overrides, currency conversion. Each of these is a real production need, but each also makes the config harder for a non-engineer to read and for the UI to author — the two properties the assignment says matter most. Validation intentionally lives on the **schema registry**, not in configs: every company is held to the same bar, and the mapper can't be configured into silence.

## Integration Mapper (product decisions)

The user is a specialist whose job has three cognitive parts: *understand the raw data*, *match it semantically to the schema*, and *catch the traps* (Globex's `payRate` is silently wrong without noticing `payPer` = "Month"). The screen is a 3-zone workbench serving exactly that:

- **Left — source profiler**: every field with inferred type, fill-rate bar, and sample values. This is "understand the raw data" (and it's how you notice `commission_plan` exists on only 2 of 20 records).
- **Center — mapping table keyed by TARGET field**, grouped by schema section, with required badges and a `6/8 required mapped` counter: the specialist always knows what *done* looks like. Each row shows its rule, transform chips, and a **live sample** (first record through the rule). The row editor's showpiece is the **value-map editor pre-filled with the distinct values actually in the file** — mapping status codes is picking meanings from dropdowns, not typing config.
- **Bottom — the trust loop**: live preview table with per-record status, an always-reconciling summary (`15 clean · 2 warnings · 0 quarantined · of 17`), raw-vs-normalized side-by-side on click, an issues list, the drift report, and the read-only config JSON (proof the UI writes the same artifact the pipeline runs — `/api/normalize` serves the live preview with the inline draft and saved runs with the stored config, same engine call).

Every edit re-runs the real pipeline (debounced 400ms). The specialist never trusts a mapping because software sounded confident — they see 20 real records come out validated. Provenance is visible in-line: `⚡×12` on annualized amounts, `✨inferred` on LLM-extracted grants.

**Suggestions are draft → review → approve.** ✨Suggest prefills only *unmapped* fields, marks rows `suggested`/`needs review`, editing a row clears its chip, and **Save confirms everything** (and bumps `config_version`). Nothing runs on data the specialist didn't approve. Export requires a *saved* config — you can't ship an un-reviewed draft.

**The mapper is also the maintenance surface.** When a future export drifts, the same screen is the repair tool — the drift panel turns silent breakage into a to-do list (see below).

**Onboarding is self-serve.** The home page uploads a `.json`/`.csv` export (drag-drop or browse); validation at upload is shape-only — is it parseable at all — because mapping is the interactive part the mapper owns. Uploading a file whose company already exists deliberately offers *replace* rather than erroring: that is the drift-maintenance flow — the saved config is kept and the next preview reports exactly what changed in the new export.

Left out, on purpose: config version *history/diff* UI (versions+lineage are recorded; the UI shows only current), per-row accept/reject for suggestions (Save-confirms-all is one decision instead of twenty), transform-chip reordering (remove+re-add, or the JSON escape hatch), auth/multi-user.

## Error handling

Principle: **never silent — every record accounted for, every problem actionable.** Layers:

1. **Parse-level** (transforms): unparseable numbers/dates, unmapped enum values → field-scoped warnings carrying the offending value.
2. **Schema sanity rules**: plausibility ranges are the underrated one — `base_salary_annual` ∈ [$10k, $5M] catches *both* fat-fingered data *and* a forgotten annualize transform (an unannualized monthly 6,666.67 lands below the floor). Percents bounded 0–100; `termination_date ≥ hire_date`; `terminated` without a termination date warns.
3. **Cross-record**: duplicate `employee_id`s quarantine every involved record.
4. **Config-level**: unknown target fields or transforms surface as run-level banner warnings; an unparseable file or bad `records_path` fails the preview loudly with the reason.

**Disposition:** `error` ⇒ the record is *quarantined* — flagged and excluded from the clean count but still listed with its reasons (never dropped); `warning` ⇒ included, flagged. The summary always reconciles to the input count. Clicking any flagged record shows raw vs normalized so the specialist can tell in seconds whether it's a data problem (kick back to the customer) or a mapping problem (fix here).

**Drift detection** runs on every normalize, so a new export against a saved config self-reports three failure classes: (1) *missing sources* — a mapped path empty in 100% of records (renamed upstream; defined as exactly-0% fill so sparse fields like a commission block on 2/20 records don't false-positive), (2) *unknown enum values* with counts ("`on_leave` × 2 fell through the status map"), (3) *unmapped source fields* — data being dropped, listed with fill rates and samples. Missing-required also quarantines the affected records, so drift is loud twice.

**Lineage:** every run's envelope records company, source file, the export's own snapshot timestamp, config version, run time, and summary — a bad batch downstream traces to the exact config and input, and reruns reproduce byte-for-byte (LLM extraction included, thanks to the committed cache).

**LLM degradation:** no API key / API failure ⇒ warning issue, raw equity notes retained, everything else normal; suggestions fall back to fuzzy matching. The deterministic pipeline never depends on a live LLM call.

## AI usage

**In the product** (both server-side, `claude-opus-4-8`):

- **Suggest mappings** — design-time only. The model sees field names, types, fill rates, and a few sample values (never full records), returns draft rules with per-field confidence, and the output is sanitized against the schema/transform registries before the UI shows it. It drafted 19/19 correct rules for the Initech CSV in testing — including splits, value maps, and consts — and flagged its one judgment call (`DEPT_NAME → job_family`) as low-confidence, which is exactly the division of labor: the model does the tedium, the human makes the calls. Wrong suggestions cost a click; they can't reach data because Save is the only commit point.
- **Equity-notes extraction** — the one place the LLM touches record data, chosen because free text ("500k RSU over 4 years… Refresh: 200k RSU…") has no deterministic parse. Contained four ways: structured-output JSON schema; results cached on disk by text-hash **and committed**, so runs are reproducible and offline; output flagged `llm_inferred` per grant and badged in the UI; raw notes always preserved alongside. In production this pattern would add a review queue for low-confidence extractions.

Where AI is deliberately *not* used: the normalization pipeline itself, validation, and drift detection are pure deterministic code — for a compensation platform, "the model decided your salary" is not an acceptable sentence.

**In building this**: designed and built with Claude Code. The design phase was a genuine back-and-forth — the schema audit (catching `bonus_plan_name`, `cliff_months`, `pay_type`, and the snapshot timestamp as misses), the flat-vs-components decision forced by the refresh-grant case, and storage shape were argued before any code. AI wrote most of the implementation against that locked design; my judgment went into the product decisions above, the edge-case catalog (monthly pay, quoted CSV names, `" - "` splits with missing teams, empty-string cells), and insisting on the golden tests running over the *real* raw files rather than synthetic fixtures. What worked well: AI is extremely fast at turning a precise spec into code and tests. What required human judgment: everything that made the spec precise.
