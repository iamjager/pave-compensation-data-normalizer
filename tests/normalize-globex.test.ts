import { beforeAll, describe, expect, test } from "vitest";
import { normalize, type RunResult } from "@/lib/engine/normalize";
import { emptyExtractor, readConfig, readRaw } from "./helpers";

// Equity extraction asserts live in equity-llm.test.ts (mocked) and are
// wired to the real cached extractor in the server tests; this golden run
// uses a no-op extractor so it exercises everything else deterministically.
let run: RunResult;

beforeAll(async () => {
  run = await normalize(readRaw("globex_inc.json"), readConfig("globex_inc.json"), {
    sourceFile: "globex_inc.json",
    equityExtractor: emptyExtractor,
  });
});

const byId = (id: string) => {
  const record = run.records.find((r) => r.data.employee_id === id);
  if (!record) throw new Error(`no record ${id}`);
  return record;
};

describe("Globex golden run", () => {
  test("all 17 employees normalize cleanly", () => {
    expect(run.envelope.summary).toEqual({ total: 17, clean: 17, warnings: 0, quarantined: 0 });
  });

  test("monthly VP pay is annualized with provenance", () => {
    const reeves = byId("5050");
    expect(reeves.data.base_salary_annual).toBe(230000.04);
    expect(reeves.annotations["base_salary_annual.annualized_from"]).toBe("Month");
    expect(reeves.data.bonus_target_amount).toBe(46000);
  });

  test("monthly AE pay annualizes too, and empty equity notes stay quiet", () => {
    const mitchell = byId("4150");
    expect(mitchell.data.base_salary_annual).toBe(80000.04);
    expect(mitchell.data.equity_notes).toBeNull();
    expect(mitchell.data.equity_grants).toEqual([]);
    expect(mitchell.data.variable_comp_notes).toBe("Uncapped, 50/50 base/variable OTE $160k");
    expect(mitchell.issues).toHaveLength(0);
  });

  test('location "City, ST" splits into city and state', () => {
    const sharma = byId("4521");
    expect(sharma.data.city).toBe("New York");
    expect(sharma.data.state).toBe("NY");
    expect(sharma.data.country).toBe("US"); // const — Globex has no country field
    expect(sharma.data.currency).toBe("USD"); // const — nor a currency field
  });

  test("terminated analyst keeps her dates", () => {
    const kowalski = byId("4950");
    expect(kowalski.data.employment_status).toBe("terminated");
    expect(kowalski.data.termination_date).toBe("2025-08-30");
    expect(kowalski.data.hire_date).toBe("2023-11-20");
  });

  test("raw equity notes are preserved verbatim", () => {
    const reeves = byId("5050");
    expect(reeves.data.equity_notes).toBe(
      "500k RSU over 4 years, granted 2019-11. Refresh: 200k RSU over 4 years, granted 2023-01",
    );
  });

  test("no drift on a fresh config", () => {
    expect(run.drift.missingSources).toEqual([]);
    expect(run.drift.unknownEnumValues).toEqual([]);
    expect(run.drift.unmappedSourceFields).toEqual([]);
  });
});
