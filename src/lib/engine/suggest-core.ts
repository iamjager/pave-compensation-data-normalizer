import type { MappingRule, TransformSpec } from "./config";
import type { FieldProfile } from "./profile";
import { mappableFields } from "./schema";
import { TRANSFORMS } from "./transforms";

/**
 * Mapping suggestions are design-time drafts: the LLM (or the fuzzy
 * fallback) proposes config, the specialist reviews in the UI, and nothing
 * touches employee data until a human saves. This module is pure — prompt
 * building, response sanitizing, and the no-LLM fallback; the API call
 * itself lives in the server layer.
 */

export interface SuggestResult {
  mappings: Record<string, MappingRule>;
  confidence: Record<string, "high" | "low">;
}

export function buildSuggestPrompt(
  profiles: FieldProfile[],
  source: { format: string; recordsPath: string | null },
): { system: string; user: string } {
  const fieldList = mappableFields()
    .map((f) => {
      const bits = [f.type as string];
      if (f.required) bits.push("required");
      if (f.enumValues) bits.push(`one of: ${f.enumValues.join(" | ")}`);
      return `- ${f.key} (${bits.join(", ")}): ${f.description}`;
    })
    .join("\n");

  const transformList = Object.values(TRANSFORMS)
    .map((t) => `- ${t.id}(${t.args.map((a) => a.name).join(", ")}): ${t.description}`)
    .join("\n");

  const system = `You draft field mappings from a company's raw HR export to Pave's standard compensation schema. A human integrations specialist will review every suggestion before anything runs — prefer a good draft over a timid one, and mark anything uncertain with confidence "low".

TARGET SCHEMA FIELDS:
${fieldList}

AVAILABLE TRANSFORMS (applied in order to the source value):
${transformList}

A mapping rule is JSON: {"source": "<dot.path>"} or {"const": <value>}, plus optional "transforms": [{"fn": "<id>", "args": {...}}].

RULES:
- Judge by the SAMPLE VALUES, not just field names.
- Enum targets (employment_status, management_track, pay_type) MUST use map_values whose map keys are exactly the distinct values shown for the chosen source field.
- If an amount could be non-annual (a sibling field holds a frequency like "Month"/"Year"), map it with annualize and set args.frequency_source to that sibling path.
- Combined values need split: "Last, First" names (watch the order!), "City, ST" locations, "Dept - Team" org strings (separator " - ").
- Date fields get parse_date. Plain numeric strings in CSVs get to_number.
- NEVER add to_number to identifiers (employee_id, manager_employee_id) — IDs stay strings.
- If the data is clearly US-based but has no currency/country field, use {"const": "USD"} / {"const": "US"}.
- Free-text equity notes: map equity_notes to the raw text AND equity_grants to the same source with extract_equity_llm. Structured equity columns instead fill equity_grant_value / equity_vesting_months / etc.
- Leave a target out rather than inventing a mapping with no supporting source field.

Respond with ONLY a JSON object, no prose:
{"suggestions": [{"target_field": "...", "rule": {...}, "confidence": "high" | "low"}]}`;

  const user = JSON.stringify(
    {
      source_format: source.format,
      records_path: source.recordsPath,
      source_fields: profiles.map((p) => ({
        path: p.path,
        type: p.inferredType,
        fill_rate: Math.round(p.fillRate * 100) / 100,
        samples: p.samples.slice(0, 5),
        ...(p.distinctValues && p.distinctValues.length <= 25
          ? { distinct_values: p.distinctValues }
          : {}),
      })),
    },
    null,
    2,
  );

  return { system, user };
}

/** Parse + sanitize the LLM response: only known fields, known transforms. */
export function parseSuggestResponse(text: string): SuggestResult {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in suggestion response");
  const parsed = JSON.parse(text.slice(start, end + 1)) as {
    suggestions?: Array<{ target_field?: string; rule?: MappingRule; confidence?: string }>;
  };

  const known = new Set(mappableFields().map((f) => f.key));
  const mappings: Record<string, MappingRule> = {};
  const confidence: Record<string, "high" | "low"> = {};

  for (const s of parsed.suggestions ?? []) {
    if (!s.target_field || !known.has(s.target_field) || !s.rule) continue;
    const rule: MappingRule = {};
    if (typeof s.rule.source === "string" && s.rule.source !== "") rule.source = s.rule.source;
    if (s.rule.const !== undefined) rule.const = s.rule.const;
    if (rule.source === undefined && rule.const === undefined) continue;
    const transforms = (s.rule.transforms ?? []).filter(
      (t): t is TransformSpec => typeof t?.fn === "string" && t.fn in TRANSFORMS,
    );
    if (transforms.length > 0) rule.transforms = transforms;
    mappings[s.target_field] = rule;
    confidence[s.target_field] = s.confidence === "low" ? "low" : "high";
  }
  return { mappings, confidence };
}

// ── Fuzzy fallback (no LLM): normalized name matching ─────────────────────

const SYNONYMS: Record<string, string[]> = {
  employee_id: ["id", "employeeid", "empid", "empnum", "workerid", "employeenumber"],
  first_name: ["firstname", "first", "fname", "givenname"],
  last_name: ["lastname", "last", "lname", "surname", "familyname"],
  work_email: ["email", "workemail", "emailaddress"],
  job_title: ["jobtitle", "title", "businesstitle", "position"],
  job_level: ["joblevel", "level", "grade"],
  job_family: ["jobfamily", "family"],
  management_track: ["managementlevel", "managementtrack", "track"],
  division: ["division"],
  department: ["department", "dept", "deptname"],
  team: ["team", "subteam"],
  manager_employee_id: ["managerid", "mgrempnum", "managerempnum", "supervisorid", "reportsto"],
  employment_status: ["status", "workerstatus", "employmentstatus"],
  hire_date: ["hiredate", "hiredt", "startdate", "datehired"],
  termination_date: ["terminationdate", "termdt", "termdate", "enddate"],
  city: ["city"],
  state: ["state", "province"],
  country: ["country"],
  currency: ["currency", "currencycode"],
  pay_type: ["paytype"],
  base_salary_annual: ["basesalary", "baseannual", "payrate", "salary", "basepay", "annualsalary", "totalbasepay", "amount"],
  bonus_target_pct: ["bonustargetpct", "bonuspct", "targetpct"],
  bonus_target_amount: ["bonusamount", "bonustargetamount"],
  bonus_plan_name: ["bonusplanname", "planname", "bonusplan"],
  commission_pct: ["commissionpct"],
  ote: ["ote", "ontargetearnings"],
  variable_comp_notes: ["commissionrate", "commissionnotes"],
  equity_grant_value: ["equitygrantval", "equityvalue", "grantvalue", "equitygrant"],
  equity_vesting_months: ["vestmonths", "vestingmonths"],
  equity_notes: ["equitynotes", "stocknotes"],
};

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function fuzzySuggest(profiles: FieldProfile[]): SuggestResult {
  const mappings: Record<string, MappingRule> = {};
  const confidence: Record<string, "high" | "low"> = {};

  for (const field of mappableFields()) {
    const candidates = new Set([normalize(field.key), ...(SYNONYMS[field.key] ?? [])]);
    const match = profiles.find((p) => {
      const segments = p.path.split(".");
      return (
        candidates.has(normalize(p.path)) ||
        candidates.has(normalize(segments[segments.length - 1]))
      );
    });
    if (match) {
      mappings[field.key] = { source: match.path };
      confidence[field.key] = "low"; // name-matching only — always review
    }
  }
  return { mappings, confidence };
}
