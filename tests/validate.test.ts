import { describe, expect, test } from "vitest";
import type { CompanyConfig } from "@/lib/engine/config";
import { normalize } from "@/lib/engine/normalize";
import { validateRecord } from "@/lib/engine/validate";
import { makeValidData } from "./helpers";

describe("record validation (schema-driven)", () => {
  test("a fully valid record has no issues", () => {
    expect(validateRecord(makeValidData())).toEqual([]);
  });

  test("the salary plausibility floor catches an unannualized monthly amount", () => {
    const issues = validateRecord(makeValidData({ base_salary_annual: 6666.67 }));
    expect(issues).toMatchObject([
      { severity: "error", field: "base_salary_annual", code: "out_of_range" },
    ]);
  });

  test("percent fields are bounded 0–100", () => {
    const issues = validateRecord(makeValidData({ bonus_target_pct: 250 }));
    expect(issues).toMatchObject([{ severity: "error", code: "out_of_range" }]);
  });

  test("termination before hire is flagged", () => {
    const issues = validateRecord(
      makeValidData({ hire_date: "2023-05-01", termination_date: "2022-01-01" }),
    );
    expect(issues).toMatchObject([{ severity: "warning", code: "termination_before_hire" }]);
  });

  test("terminated status without a termination date warns", () => {
    const issues = validateRecord(makeValidData({ employment_status: "terminated" }));
    expect(issues).toMatchObject([{ severity: "warning", code: "terminated_missing_date" }]);
  });

  test("missing department is a warning, not an error", () => {
    const issues = validateRecord(makeValidData({ department: null }));
    expect(issues).toMatchObject([
      { severity: "warning", field: "department", code: "expected_missing" },
    ]);
  });

  test("an invalid hard-enum value is an error", () => {
    const issues = validateRecord(makeValidData({ employment_status: "Active" }));
    expect(issues).toMatchObject([{ severity: "error", code: "invalid_enum" }]);
  });
});

const miniConfig = (mappings: CompanyConfig["mappings"]): CompanyConfig => ({
  config_version: 1,
  company_id: "test_co",
  company_name: "Test Co",
  updated_at: "2026-07-17T00:00:00.000Z",
  source: { format: "json" },
  mappings: {
    employee_id: { source: "id" },
    first_name: { source: "first" },
    last_name: { source: "last" },
    job_title: { source: "title" },
    department: { source: "dept" },
    employment_status: { const: "active" },
    hire_date: { source: "hired" },
    currency: { const: "USD" },
    base_salary_annual: { source: "salary" },
    ...mappings,
  },
});

const person = (overrides: Record<string, unknown> = {}) => ({
  id: "1", first: "Ada", last: "Lovelace", title: "Engineer", dept: "Eng",
  hired: "2022-01-01", salary: 150000, ...overrides,
});

describe("run-level disposition", () => {
  test("a record missing its required ID is quarantined and the summary reconciles", async () => {
    const raw = JSON.stringify([person(), person({ id: null })]);
    const run = await normalize(raw, miniConfig({}));
    expect(run.envelope.summary).toEqual({ total: 2, clean: 1, warnings: 0, quarantined: 1 });
    const bad = run.records[1];
    expect(bad.issues).toMatchObject([
      { severity: "error", field: "employee_id", code: "required_missing" },
    ]);
  });

  test("duplicate employee IDs quarantine every involved record", async () => {
    const raw = JSON.stringify([person(), person({ first: "Grace" }), person({ id: "2" })]);
    const run = await normalize(raw, miniConfig({}));
    expect(run.envelope.summary.quarantined).toBe(2);
    expect(run.records[0].issues).toMatchObject([{ code: "duplicate_employee_id" }]);
    expect(run.records[1].issues).toMatchObject([{ code: "duplicate_employee_id" }]);
    expect(run.records[2].issues).toEqual([]);
  });

  test("config referencing an unknown transform or field surfaces run-level warnings", async () => {
    const run = await normalize(
      JSON.stringify([person()]),
      miniConfig({
        base_salary_annual: { source: "salary", transforms: [{ fn: "does_not_exist" }] },
        not_a_field: { const: 1 },
      }),
    );
    expect(run.envelope.config_warnings.join(" ")).toContain("does_not_exist");
    expect(run.envelope.config_warnings.join(" ")).toContain("not_a_field");
  });
});
