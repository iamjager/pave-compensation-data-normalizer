import { describe, expect, test } from "vitest";
import type { CompanyConfig } from "@/lib/engine/config";
import { normalize } from "@/lib/engine/normalize";

const config: CompanyConfig = {
  config_version: 3,
  company_id: "globex_inc",
  company_name: "Globex Inc",
  updated_at: "2026-07-17T00:00:00.000Z",
  source: { format: "json", records_path: "employees" },
  mappings: {
    employee_id: { source: "id" },
    first_name: { source: "firstName" },
    last_name: { source: "lastName" },
    job_title: { source: "jobTitle" },
    department: { source: "department" },
    employment_status: {
      source: "status",
      transforms: [{ fn: "map_values", args: { map: { active: "active", terminated: "terminated" } } }],
    },
    hire_date: { source: "hireDate" },
    currency: { const: "USD" },
    base_salary_annual: {
      source: "payRate",
      transforms: [{ fn: "annualize", args: { frequency_source: "payPer" } }],
    },
    ote: { source: "ote" },
  },
};

const employee = (overrides: Record<string, unknown> = {}) => ({
  id: "1", firstName: "Ada", lastName: "Lovelace", jobTitle: "Engineer",
  department: "Eng", status: "active", hireDate: "2022-01-01",
  payRate: 150000, payPer: "Year", ...overrides,
});

describe("drift detection", () => {
  test("a renamed source field is reported as missing (payRate → basePayRate)", async () => {
    const drifted = [
      { ...employee(), payRate: undefined, basePayRate: 150000 },
      { ...employee({ id: "2" }), payRate: undefined, basePayRate: 160000 },
    ];
    const run = await normalize(JSON.stringify({ employees: drifted }), config);
    expect(run.drift.missingSources).toContainEqual({
      targetField: "base_salary_annual",
      sourcePath: "payRate",
    });
    // ...and the new column shows up as unmapped data.
    expect(run.drift.unmappedSourceFields.map((f) => f.path)).toContain("basePayRate");
    // Every record also fails the required base salary — loud, not silent.
    expect(run.envelope.summary.quarantined).toBe(2);
  });

  test("a new enum value the map doesn't know is aggregated with a count", async () => {
    const drifted = [
      employee(),
      employee({ id: "2", status: "on_leave" }),
      employee({ id: "3", status: "on_leave" }),
    ];
    const run = await normalize(JSON.stringify({ employees: drifted }), config);
    expect(run.drift.unknownEnumValues).toEqual([
      { targetField: "employment_status", value: "on_leave", count: 2 },
    ]);
  });

  test("a sparse field (filled on some records) is NOT a missing source", async () => {
    const records = [employee({ ote: 240000 }), employee({ id: "2" })]; // ote on 1 of 2
    const run = await normalize(JSON.stringify({ employees: records }), config);
    expect(run.drift.missingSources).toEqual([]);
  });

  test("a source path referenced only via a transform arg still counts as covered", async () => {
    const run = await normalize(JSON.stringify({ employees: [employee()] }), config);
    // payPer is only used as annualize's frequency_source — it must not
    // appear in unmapped fields.
    expect(run.drift.unmappedSourceFields.map((f) => f.path)).not.toContain("payPer");
  });
});
