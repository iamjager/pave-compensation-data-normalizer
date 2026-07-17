# Pave Integration Mapper

A tool where a non-technical integrations specialist loads a company's raw HR export, maps its fields to Pave's standard compensation schema in a UI, previews validated normalized output, and saves the mapping as a per-company config. Onboarding a new company = creating a new config, not writing code.

The original assignment brief is in [ASSIGNMENT.md](./ASSIGNMENT.md). Design rationale and tradeoffs are in [DECISIONS.md](./DECISIONS.md).

## Setup

```bash
npm install
npm run dev        # → http://localhost:3000
```

Node 20+ recommended. The `.env` with `ANTHROPIC_API_KEY` enables the two LLM assists (suggest mappings, equity-notes extraction). **The tool is fully functional without it** — suggestions fall back to fuzzy name-matching, and equity extraction is served from a committed cache (`src/data/cache/equity/`), so the whole demo works offline.

## Tests

```bash
npm test           # 64 tests: transform units, golden runs over the real raw
                   # files, validation/quarantine, drift detection, LLM
                   # extraction (mocked + committed-cache backed)
```

## Demo walkthrough (~3 minutes)

1. **Home** lists the three companies with their config versions. Open **Initech** (the CSV).
2. **Orient**: left panel profiles every source column (type, fill rate, samples). The header shows `8/8 required mapped` and the reconciling summary (`22 clean · 0 warnings · 0 quarantined · of 22`).
3. **Break something**: expand `Employee ID`, remove the mapping — the preview instantly shows 22 quarantined records and the summary still reconciles. Re-map it via the searchable source picker (sample values shown inline).
4. **The showpiece**: expand `Employment status` — the value-map editor is pre-filled with the exact codes in the file (`A`, `T`, `L`) mapped through dropdowns.
5. **Drift tab**: shows `DEPT_CODE` and `LOCATION_CODE` as unmapped source data — dropping data is always visible, never silent.
6. **✨ Suggest** (on a company with mappings cleared, or any file): drafts the table with confidence chips; edited rows lose their chip; **Save** confirms all and bumps the config version.
7. Open **Globex**: Ryan Mitchell's monthly `6666.67` shows as `80,000.04` with a `⚡×12` annualization badge; Mike Reeves' free-text refresh note shows `700,000` equity total with an `✨inferred` badge — click the row for raw-vs-normalized side by side.
8. **Export** writes the normalized dataset (envelope + records + issues) to `src/data/output/`.

To onboard a **new company**, use the **＋ Onboard a new company** card on the home page — drag-drop or browse a `.json`/`.csv` export and you land straight in the mapper with the file profiled and ✨Suggest one click away. Uploading a file for an already-mapped company offers to **replace** its raw file: the saved mapping is kept, and the preview immediately reports any drift in the new export. (Dropping files into `src/data/raw/` still works as the power-user path.)

## Layout

```
src/lib/engine/     pure TS normalization engine (no framework imports):
                    schema registry, transforms, validation, drift, profiling
src/lib/server/     fs persistence + Anthropic client (the only impure layer)
src/app/api/        thin routes over the engine; /api/normalize serves both
                    live preview (inline draft config) and saved runs
src/components/     the mapper workbench UI
src/data/raw/       provided exports        src/data/configs/  saved configs
src/data/cache/     committed LLM cache     src/data/output/   exports (gitignored)
tests/              Vitest suites
```
