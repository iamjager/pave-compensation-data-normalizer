/**
 * The standard schema, defined as data. This registry drives the mapping UI
 * (rows, groups, tooltips), validation, and the LLM suggest prompt.
 * Adding a field to the platform = adding one entry here.
 */

export type FieldGroup =
  | "Identity"
  | "Job & Org"
  | "Status & Dates"
  | "Location"
  | "Cash Comp"
  | "Equity";

export type FieldType = "string" | "number" | "date" | "enum" | "equity_grants";

export interface SchemaField {
  key: string;
  label: string;
  group: FieldGroup;
  type: FieldType;
  /** Record is quarantined when a required field ends up null. */
  required?: boolean;
  enumValues?: readonly string[];
  /** Soft enums warn on unknown values instead of erroring. */
  softEnum?: boolean;
  /** Emit a warning (not an error) when the field ends up null. */
  warnIfMissing?: boolean;
  /** Plausibility range for numbers; violations are errors (quarantine). */
  range?: { min?: number; max?: number };
  /** Mappable in the UI but assembled into another field, never emitted. */
  virtual?: boolean;
  /** Computed by the engine; not mappable. */
  derived?: boolean;
  description: string;
}

export const EMPLOYMENT_STATUSES = ["active", "terminated", "leave", "unknown"] as const;
export const MANAGEMENT_TRACKS = ["ic", "manager", "director", "vp", "executive"] as const;
export const PAY_TYPES = ["salaried", "hourly"] as const;
export const GRANT_TYPES = ["rsu", "option", "unknown"] as const;

export const SCHEMA: SchemaField[] = [
  // ── Identity ────────────────────────────────────────────────────────────
  { key: "employee_id", label: "Employee ID", group: "Identity", type: "string", required: true,
    description: "The company's own identifier for the employee, kept as a string (e.g. \"WD-10042\", \"4521\")." },
  { key: "first_name", label: "First name", group: "Identity", type: "string", required: true,
    description: "Employee's first / given name." },
  { key: "last_name", label: "Last name", group: "Identity", type: "string", required: true,
    description: "Employee's last / family name." },
  { key: "work_email", label: "Work email", group: "Identity", type: "string",
    description: "Company email address, when the source provides one." },

  // ── Job & Org ───────────────────────────────────────────────────────────
  { key: "job_title", label: "Job title", group: "Job & Org", type: "string", required: true,
    description: "Business title as the company writes it (e.g. \"Software Engineer III\")." },
  { key: "job_level", label: "Job level (company code)", group: "Job & Org", type: "string",
    description: "The company's own level code, stored raw (e.g. \"P4\", \"M1\"). Cross-company leveling is a downstream mapping." },
  { key: "management_track", label: "Management track", group: "Job & Org", type: "enum",
    enumValues: MANAGEMENT_TRACKS, softEnum: true,
    description: "IC vs management ladder: ic, manager, director, vp, executive." },
  { key: "job_family", label: "Job family", group: "Job & Org", type: "string",
    description: "Discipline for benchmarking (e.g. \"Engineering\"). Distinct from department — do not conflate." },
  { key: "division", label: "Division", group: "Job & Org", type: "string",
    description: "Broad org grouping above department, when the source has one." },
  { key: "department", label: "Department", group: "Job & Org", type: "string", warnIfMissing: true,
    description: "The employee's department (e.g. \"Engineering\", \"Customer Success\")." },
  { key: "team", label: "Team", group: "Job & Org", type: "string",
    description: "Sub-team within the department (e.g. \"Platform\" from \"Engineering - Platform\")." },
  { key: "manager_employee_id", label: "Manager employee ID", group: "Job & Org", type: "string",
    description: "The manager's employee ID in the same source, if provided. Not resolved to a name." },

  // ── Status & Dates ──────────────────────────────────────────────────────
  { key: "employment_status", label: "Employment status", group: "Status & Dates", type: "enum",
    required: true, enumValues: EMPLOYMENT_STATUSES,
    description: "Normalized status: active, terminated, leave, or unknown. Map source codes explicitly (e.g. A → active)." },
  { key: "hire_date", label: "Hire date", group: "Status & Dates", type: "date", required: true,
    description: "Start date, normalized to YYYY-MM-DD." },
  { key: "termination_date", label: "Termination date", group: "Status & Dates", type: "date",
    description: "End date for terminated employees, normalized to YYYY-MM-DD." },

  // ── Location ────────────────────────────────────────────────────────────
  { key: "city", label: "City", group: "Location", type: "string",
    description: "Work location city." },
  { key: "state", label: "State / region", group: "Location", type: "string",
    description: "Work location state or region code (e.g. \"CA\")." },
  { key: "country", label: "Country", group: "Location", type: "string",
    description: "Work location country code (e.g. \"US\"). Often a constant when the source omits it." },

  // ── Cash Comp ───────────────────────────────────────────────────────────
  { key: "currency", label: "Currency", group: "Cash Comp", type: "string", required: true,
    description: "ISO currency code for all cash amounts (e.g. \"USD\"). Often a constant when the source omits it." },
  { key: "pay_type", label: "Pay type", group: "Cash Comp", type: "enum",
    enumValues: PAY_TYPES, softEnum: true,
    description: "salaried or hourly. Hourly rates must not be mapped into base salary." },
  { key: "base_salary_annual", label: "Base salary (annualized)", group: "Cash Comp", type: "number",
    required: true, range: { min: 10_000, max: 5_000_000 },
    description: "Annual base salary. Sources paying per month must be annualized (see the annualize transform). The plausibility range catches unannualized values." },
  { key: "bonus_target_pct", label: "Bonus target (% of base)", group: "Cash Comp", type: "number",
    range: { min: 0, max: 100 },
    description: "Target bonus as a percent of base, when the source expresses it that way." },
  { key: "bonus_target_amount", label: "Bonus target (amount)", group: "Cash Comp", type: "number",
    range: { min: 0 },
    description: "Target bonus as an absolute annual amount, when the source expresses it that way." },
  { key: "bonus_plan_name", label: "Bonus plan name", group: "Cash Comp", type: "string",
    description: "Which bonus plan the employee is on (e.g. \"IC Bonus Plan\")." },
  { key: "commission_pct", label: "Commission (% target)", group: "Cash Comp", type: "number",
    range: { min: 0, max: 100 },
    description: "Commission target percent for variable-comp roles." },
  { key: "ote", label: "OTE (on-target earnings)", group: "Cash Comp", type: "number",
    range: { min: 0 },
    description: "On-target earnings for commissioned roles (base + variable at 100% attainment)." },
  { key: "variable_comp_notes", label: "Variable comp notes", group: "Cash Comp", type: "string",
    description: "Unstructured commission/variable details preserved as text (e.g. \"uncapped, 50/50 split\")." },

  // ── Equity: virtual single-grant targets (assembled into equity_grants) ─
  { key: "equity_grant_type", label: "Equity grant type", group: "Equity", type: "enum",
    enumValues: GRANT_TYPES, softEnum: true, virtual: true,
    description: "rsu or option, for sources with one structured grant." },
  { key: "equity_grant_value", label: "Equity grant value", group: "Equity", type: "number",
    range: { min: 0 }, virtual: true,
    description: "Grant value in currency units, for sources with one structured grant." },
  { key: "equity_vesting_months", label: "Vesting (months)", group: "Equity", type: "number",
    range: { min: 0, max: 240 }, virtual: true,
    description: "Total vesting period in months (e.g. 48)." },
  { key: "equity_cliff_months", label: "Cliff (months)", group: "Equity", type: "number",
    range: { min: 0, max: 60 }, virtual: true,
    description: "Cliff length in months (e.g. 12 for a 1-year cliff)." },
  { key: "equity_granted", label: "Grant date", group: "Equity", type: "string", virtual: true,
    description: "When the grant was made, kept as written (e.g. \"2023-01\")." },
  { key: "equity_strike_price", label: "Strike price", group: "Equity", type: "number",
    range: { min: 0 }, virtual: true,
    description: "Option strike price, when applicable." },

  // ── Equity: real fields ─────────────────────────────────────────────────
  { key: "equity_grants", label: "Equity grants", group: "Equity", type: "equity_grants",
    description: "List of grants. Structured sources fill one grant via the fields above; free-text sources use the LLM extract transform (multiple grants, flagged as inferred)." },
  { key: "equity_total_value", label: "Equity total value", group: "Equity", type: "number", derived: true,
    description: "Derived: sum of grant values. Not mappable." },
  { key: "equity_notes", label: "Equity notes (raw)", group: "Equity", type: "string",
    description: "The source's equity text preserved verbatim — always kept even when grants are extracted." },
];

export const FIELD_GROUPS: FieldGroup[] = [
  "Identity", "Job & Org", "Status & Dates", "Location", "Cash Comp", "Equity",
];

export const VIRTUAL_EQUITY_KEYS = [
  "equity_grant_type", "equity_grant_value", "equity_vesting_months",
  "equity_cliff_months", "equity_granted", "equity_strike_price",
] as const;

export const schemaField = (key: string): SchemaField | undefined =>
  SCHEMA.find((f) => f.key === key);

/** Fields that appear in the normalized output record. */
export const outputFields = (): SchemaField[] => SCHEMA.filter((f) => !f.virtual);

/** Fields a mapping rule may target (everything except derived). */
export const mappableFields = (): SchemaField[] => SCHEMA.filter((f) => !f.derived);
