import { readFileSync } from "node:fs";
import path from "node:path";
import type { CompanyConfig } from "@/lib/engine/config";
import type { EquityExtractor } from "@/lib/engine/equity";
import type { Issue, IssueSeverity } from "@/lib/engine/issues";
import type { TransformCtx } from "@/lib/engine/transforms";

const ROOT = path.resolve(import.meta.dirname, "..");

export const readRaw = (name: string): string =>
  readFileSync(path.join(ROOT, "src/data/raw", name), "utf8");

export const readConfig = (name: string): CompanyConfig =>
  JSON.parse(readFileSync(path.join(ROOT, "src/data/configs", name), "utf8"));

/** Transform-test harness: a ctx that records issues and annotations. */
export function mockCtx(record: Record<string, unknown> = {}, targetField = "test_field") {
  const issues: Issue[] = [];
  const annotations: Record<string, unknown> = {};
  const ctx: TransformCtx = {
    record,
    targetField,
    addIssue: (severity: IssueSeverity, code: string, message: string, value?: unknown) =>
      issues.push({ severity, field: targetField, code, message, value }),
    annotate: (key, value) => {
      annotations[`${targetField}.${key}`] = value;
    },
  };
  return { ctx, issues, annotations };
}

/** An extractor that returns no grants and never errors (pre-LLM goldens). */
export const emptyExtractor: EquityExtractor = {
  extract: async () => ({ grants: [] }),
};

/** A minimal valid normalized record for validateRecord unit tests. */
export function makeValidData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    employee_id: "E-1",
    first_name: "Ada",
    last_name: "Lovelace",
    work_email: null,
    job_title: "Engineer",
    job_level: null,
    management_track: null,
    job_family: null,
    division: null,
    department: "Engineering",
    team: null,
    manager_employee_id: null,
    employment_status: "active",
    hire_date: "2022-01-01",
    termination_date: null,
    city: null,
    state: null,
    country: "US",
    currency: "USD",
    pay_type: "salaried",
    base_salary_annual: 150000,
    bonus_target_pct: null,
    bonus_target_amount: null,
    bonus_plan_name: null,
    commission_pct: null,
    ote: null,
    variable_comp_notes: null,
    equity_grants: [],
    equity_total_value: null,
    equity_notes: null,
    ...overrides,
  };
}
