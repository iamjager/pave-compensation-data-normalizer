# Scenario files for manual testing

Drag any of these onto the **＋ Onboard a new company** card on the home page. They live outside `src/data/` so nothing becomes a company until you upload it. When you're done testing, hover the company's card and hit **✕** to remove it again — note that deleting an uploaded `umbrella_corp` also removes its pre-cached equity extractions (they're matched by note text); restore them with `git checkout -- src/data/cache/equity/`.

| File | Scenario | Expected behavior |
|---|---|---|
| `notes.txt` | Wrong file type | Rejected: "Upload a .json or .csv export from the HR system" |
| `broken.json` | Truncated/malformed JSON | Rejected: "This file isn't valid JSON — re-export it from the HR system and try again" |
| `empty_roster.csv` | Header row, no data | Rejected: "This CSV has a header row but no data rows" |
| `messy_startup.csv` | **Bad data** in a new company | Uploads fine; problems surface in the preview after mapping (see below) |
| `umbrella_corp.json` | **Brand-new company**, unfamiliar structure | Uploads fine; records found at the nested `payload.staff`; rehearses full onboarding (see below) |
| `globex_inc.json` | **Structural drift** for an existing company | Triggers the replace-confirm dialog, then the drift-repair flow (see below) |
| `spark_studios.json` | **Multiple lists in one file** | Uploads fine; the sidebar shows both lists and prompts for a disposition (see below) |

## `messy_startup.csv` — the validation showcase

Upload, hit **✨ Suggest**, map `STATUS` values (`ACTIVE → active`, `TERM → terminated`, leave `X` unmapped) — then read the preview. Ten rows, and every problem is a different failure class:

- **Quarantined (6)**: a row with no `EMP_ID`; `S-002` appearing **twice** (duplicate id — both flagged); `S-004` earning `6,500` (below the $10k plausibility floor — fat-finger or monthly pay); `S-007` with status `X` (unmapped → required status empty, and `X` shows in the drift panel); `S-009` hired `"TBD"` (unparseable required date).
- **Warnings (2)**: `S-005` terminated *before* she was hired; `S-006` terminated with no termination date.
- **Clean (2)**: `S-001`, `S-010`.

The summary bar should read `2 clean · 2 warnings · 6 quarantined · of 10`.

## `umbrella_corp.json` — new-company onboarding rehearsal

A PayFlow-style export the tool has never seen: records nested at `payload.staff` (exercises the deeper records-path guess), unfamiliar field names (`givenName`, `orgUnit`, `employmentState`…), **everyone paid monthly** (`monthlyPay` + `payCycle`), statuses `EMPLOYED/EXITED/SABBATICAL`, and free-text equity including two refresh grants.

Things to try:

- Map `monthlyPay` straight to base salary *without* annualize: two records (8,750 and 9,500) quarantine on the $10k plausibility floor, and the rest show up as suspiciously low "annual" salaries in the preview — the range check is a safety net, the preview is the real review. Add **annualize** with `payCycle` as the frequency source → everything recovers with `⚡×12` badges.
- Map `employmentState` with the value-map editor: `EMPLOYED → active`, `EXITED → terminated`, `SABBATICAL → leave`.
- `equityText` → `equity_notes` raw + `equity_grants` via the LLM transform (✨Suggest proposes exactly this pairing). UC-002 and UC-008 each yield **two** grants (refresh), UC-004 an option with a $2.10 strike. These notes ship pre-cached (`src/data/cache/equity/`) so the preview is instant and offline-safe; a genuinely new note would extract live with the API key, or degrade to a warning without one — the raw text is kept either way.

## `spark_studios.json` — multiple lists in one file

A Gusto-style export with a `company` metadata object plus **two parallel lists**: `employees` (12) and `compensation` (12, keyed by `employee_id`). On open, the sidebar's **Lists in this file** section shows `employees — primary` and `compensation — not handled` (also reported in the Drift tab).

1. Set the compensation list to **Merge into records** on `employee_id` — the badge flips to `12 matched` and `compensation.*` paths appear live in the source panel and every picker.
2. ✨ Suggest now drafts mappings from both lists (it flags `compensation.salary_amount → base salary` as *low confidence* — it saw the hourly rows).
3. Zoe Martinez (SS-010) is paid **hourly** (`salary_type: "hourly"`, 45/hr): map base salary with annualize on `compensation.salary_type` → `93,600` with a ⚡ badge.
4. Also in here: equity in **shares** with strike prices in the notes (the shares-vs-dollars discussion), a rehire (SS-004/SS-005), lowercase city/department variants, and a `commission_plan` free-text.

Try **Append as records** or **Ignore** on the same list to see concat and explicit-drop behavior; unmatched merges produce per-record `merge_unmatched` warnings.

## `globex_inc.json` — the drift-repair story

Same 17 Globex employees as the real export, but "the payroll provider changed the export": `payRate` renamed to `basePayRate`, a new `equityValue` column appeared, and two people now have status `on_leave`.

1. Upload → the name collides → confirm **Replace** (the saved mapping is kept).
2. The preview goes loud: **17 quarantined** (base salary's source is gone), and the **Drift tab** lists all three signals: `payRate` missing (mapped source not in the file), `on_leave × 2` (value with no mapping), `basePayRate` + `equityValue` (source data no mapping uses).
3. Repair live: re-point *Base salary (annualized)* to `basePayRate` (annualize stays on `payPer`) → 15 recover. Add `on_leave → leave` in the status value map → all 17 clean. Optionally map `equityValue`.
4. **Save** → config bumps a version. Restore the original file afterwards with:
   `git checkout -- src/data/raw/globex_inc.json` (or re-upload the original from git history).
