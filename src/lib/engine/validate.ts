import type { Issue } from "./issues";
import { SCHEMA } from "./schema";

/**
 * Schema-driven validation of a normalized record. Rules live on the schema
 * registry (not in per-company config), so every company is held to the same
 * bar. The same rules catch bad source data AND bad mappings — e.g. the
 * base-salary plausibility floor flags a monthly amount nobody annualized.
 */
export function validateRecord(data: Record<string, unknown>): Issue[] {
  const issues: Issue[] = [];

  for (const field of SCHEMA) {
    if (field.virtual || field.derived || field.type === "equity_grants") continue;
    const value = data[field.key];
    const empty = value === null || value === undefined || value === "";

    if (empty) {
      if (field.required) {
        issues.push({
          severity: "error", field: field.key, code: "required_missing",
          message: `${field.label} is required but has no value`,
        });
      } else if (field.warnIfMissing) {
        issues.push({
          severity: "warning", field: field.key, code: "expected_missing",
          message: `${field.label} is expected but has no value`,
        });
      }
      continue;
    }

    if (field.type === "number") {
      if (typeof value !== "number") {
        issues.push({
          severity: "warning", field: field.key, code: "type_mismatch",
          message: `${field.label} should be a number, got "${String(value)}"`, value,
        });
        continue;
      }
      const { min, max } = field.range ?? {};
      if ((min !== undefined && value < min) || (max !== undefined && value > max)) {
        issues.push({
          severity: "error", field: field.key, code: "out_of_range",
          message: `${field.label} of ${value} is outside the plausible range ${min ?? "-∞"}–${max ?? "∞"}`,
          value,
        });
      }
    }

    if (field.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
      issues.push({
        severity: "warning", field: field.key, code: "invalid_date_format",
        message: `${field.label} "${String(value)}" is not in YYYY-MM-DD format`, value,
      });
    }

    if (field.type === "enum" && field.enumValues && !field.enumValues.includes(String(value))) {
      issues.push({
        severity: field.softEnum ? "warning" : "error", field: field.key, code: "invalid_enum",
        message: `${field.label} "${String(value)}" is not one of: ${field.enumValues.join(", ")}`,
        value,
      });
    }
  }

  // Cross-field rules (YYYY-MM-DD strings compare correctly lexicographically).
  const hire = data.hire_date;
  const term = data.termination_date;
  if (typeof hire === "string" && typeof term === "string" && term < hire) {
    issues.push({
      severity: "warning", field: "termination_date", code: "termination_before_hire",
      message: `Termination date ${term} is before hire date ${hire}`,
    });
  }
  if (data.employment_status === "terminated" && (term === null || term === undefined || term === "")) {
    issues.push({
      severity: "warning", field: "termination_date", code: "terminated_missing_date",
      message: "Status is terminated but there is no termination date",
    });
  }

  return issues;
}

/** Cross-record rules over the whole run; mutates issues in place. */
export function applyDatasetValidation(
  records: Array<{ data: Record<string, unknown>; issues: Issue[] }>,
): void {
  const byId = new Map<string, number[]>();
  records.forEach((record, index) => {
    const id = record.data.employee_id;
    if (id === null || id === undefined || id === "") return;
    const key = String(id);
    byId.set(key, [...(byId.get(key) ?? []), index]);
  });

  for (const [id, indexes] of byId) {
    if (indexes.length < 2) continue;
    for (const index of indexes) {
      records[index].issues.push({
        severity: "error", field: "employee_id", code: "duplicate_employee_id",
        message: `Employee ID "${id}" appears ${indexes.length} times in this file`, value: id,
      });
    }
  }
}
