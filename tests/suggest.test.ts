import { describe, expect, test } from "vitest";
import { loadRecords } from "@/lib/engine/loaders";
import { profileRecords } from "@/lib/engine/profile";
import { fuzzySuggest, parseSuggestResponse } from "@/lib/engine/suggest-core";
import { readRaw } from "./helpers";

describe("fuzzy suggest fallback (no LLM)", () => {
  test("matches obvious Initech columns by normalized name", () => {
    const { records } = loadRecords(readRaw("initech_llc.csv"), { format: "csv" });
    const { mappings, confidence } = fuzzySuggest(profileRecords(records));
    expect(mappings.employee_id).toEqual({ source: "EMP_NUM" });
    expect(mappings.base_salary_annual).toEqual({ source: "BASE_ANNUAL" });
    expect(mappings.employment_status).toEqual({ source: "STATUS" });
    // Fuzzy matches are always flagged for review.
    expect(new Set(Object.values(confidence))).toEqual(new Set(["low"]));
  });
});

describe("suggest response sanitizing", () => {
  test("keeps valid rules, drops unknown fields and transforms", () => {
    const raw = `Here you go:
{"suggestions": [
  {"target_field": "first_name", "rule": {"source": "firstName"}, "confidence": "high"},
  {"target_field": "not_a_real_field", "rule": {"source": "x"}},
  {"target_field": "base_salary_annual", "rule": {"source": "payRate", "transforms": [
    {"fn": "annualize", "args": {"frequency_source": "payPer"}},
    {"fn": "made_up_transform"}
  ]}, "confidence": "low"},
  {"target_field": "city", "rule": {}}
]}`;
    const { mappings, confidence } = parseSuggestResponse(raw);
    expect(Object.keys(mappings).sort()).toEqual(["base_salary_annual", "first_name"]);
    expect(mappings.base_salary_annual.transforms).toEqual([
      { fn: "annualize", args: { frequency_source: "payPer" } },
    ]);
    expect(confidence.base_salary_annual).toBe("low");
  });
});
