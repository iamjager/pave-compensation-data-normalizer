import { describe, expect, test } from "vitest";
import { applyRule, TRANSFORMS } from "@/lib/engine/transforms";
import { mockCtx } from "./helpers";

describe("annualize", () => {
  test("monthly pay is multiplied by 12 and rounded to cents", async () => {
    const { ctx, annotations } = mockCtx({ payPer: "Month" }, "base_salary_annual");
    const result = await TRANSFORMS.annualize.fn(19166.67, { frequency_source: "payPer" }, ctx);
    expect(result).toBe(230000.04);
    expect(annotations["base_salary_annual.annualized_from"]).toBe("Month");
  });

  test("the other monthly record: 6666.67 → 80000.04", async () => {
    const { ctx } = mockCtx({ payPer: "Month" });
    expect(await TRANSFORMS.annualize.fn(6666.67, { frequency_source: "payPer" }, ctx)).toBe(80000.04);
  });

  test("annual frequency passes through without annotation", async () => {
    const { ctx, annotations } = mockCtx({ payPer: "Year" });
    expect(await TRANSFORMS.annualize.fn(178000, { frequency_source: "payPer" }, ctx)).toBe(178000);
    expect(Object.keys(annotations)).toHaveLength(0);
  });

  test("unknown frequency yields null plus a warning", async () => {
    const { ctx, issues } = mockCtx({ payPer: "Fortnight" });
    expect(await TRANSFORMS.annualize.fn(1000, { frequency_source: "payPer" }, ctx)).toBeNull();
    expect(issues).toMatchObject([{ severity: "warning", code: "frequency_unknown" }]);
  });

  test("missing frequency assumes annual with a warning", async () => {
    const { ctx, issues } = mockCtx({});
    expect(await TRANSFORMS.annualize.fn(1000, { frequency_source: "payPer" }, ctx)).toBe(1000);
    expect(issues).toMatchObject([{ severity: "warning", code: "frequency_missing" }]);
  });
});

describe("split", () => {
  test('splits "Last, First" names both ways', async () => {
    const { ctx } = mockCtx();
    expect(await TRANSFORMS.split.fn("Reeves, Mike", { separator: ",", index: 0 }, ctx)).toBe("Reeves");
    expect(await TRANSFORMS.split.fn("Reeves, Mike", { separator: ",", index: 1 }, ctx)).toBe("Mike");
  });

  test("missing part returns null without an issue (Acme orgs without a team)", async () => {
    const { ctx, issues } = mockCtx();
    expect(await TRANSFORMS.split.fn("Data Science", { separator: " - ", index: 1 }, ctx)).toBeNull();
    expect(issues).toHaveLength(0);
  });

  test('the " - " separator keeps hyphenated names intact', async () => {
    const { ctx } = mockCtx();
    expect(await TRANSFORMS.split.fn("Sales - Mid-Market", { separator: " - ", index: 1 }, ctx)).toBe("Mid-Market");
  });
});

describe("map_values", () => {
  test("maps known values, including to numbers", async () => {
    const { ctx } = mockCtx();
    expect(await TRANSFORMS.map_values.fn("A", { map: { A: "active" } }, ctx)).toBe("active");
    expect(await TRANSFORMS.map_values.fn("4yr_1yr_cliff", { map: { "4yr_1yr_cliff": 48 } }, ctx)).toBe(48);
  });

  test("unmapped values become null with a warning carrying the value", async () => {
    const { ctx, issues } = mockCtx({}, "employment_status");
    expect(await TRANSFORMS.map_values.fn("on_leave", { map: { A: "active" } }, ctx)).toBeNull();
    expect(issues).toMatchObject([
      { severity: "warning", code: "enum_unmapped", field: "employment_status", value: "on_leave" },
    ]);
  });
});

describe("parse_date / to_number / stringify", () => {
  test("valid dates normalize, invalid dates warn to null", async () => {
    const { ctx, issues } = mockCtx();
    expect(await TRANSFORMS.parse_date.fn("2026-02-28", {}, ctx)).toBe("2026-02-28");
    expect(await TRANSFORMS.parse_date.fn("not-a-date", {}, ctx)).toBeNull();
    expect(issues).toMatchObject([{ code: "invalid_date" }]);
  });

  test("to_number handles strings and flags garbage", async () => {
    const { ctx, issues } = mockCtx();
    expect(await TRANSFORMS.to_number.fn("215000", {}, ctx)).toBe(215000);
    expect(await TRANSFORMS.to_number.fn("N/A", {}, ctx)).toBeNull();
    expect(issues).toMatchObject([{ code: "not_a_number" }]);
  });

  test("stringify flattens an object into readable text", async () => {
    const { ctx } = mockCtx();
    const result = await TRANSFORMS.stringify.fn(
      { type: "uncapped", ote: 240000, split: "50/50" }, {}, ctx,
    );
    expect(result).toBe("type: uncapped, ote: 240000, split: 50/50");
  });
});

describe("applyRule pipeline contract", () => {
  test("empty input short-circuits the chain to null", async () => {
    const { ctx, issues } = mockCtx({ TERM_DT: null });
    const value = await applyRule(
      { source: "TERM_DT", transforms: [{ fn: "parse_date" }] }, ctx,
    );
    expect(value).toBeNull();
    expect(issues).toHaveLength(0); // parse_date never ran on the empty cell
  });

  test("const rules and fallback apply", async () => {
    const { ctx } = mockCtx({});
    expect(await applyRule({ const: "USD" }, ctx)).toBe("USD");
    expect(await applyRule({ source: "missing", fallback: "US" }, ctx)).toBe("US");
  });

  test("null-safe traversal through Acme's bonus_plan: null", async () => {
    const { ctx, issues } = mockCtx({ compensation: { bonus_plan: null } });
    expect(await applyRule({ source: "compensation.bonus_plan.target_pct" }, ctx)).toBeNull();
    expect(issues).toHaveLength(0);
  });
});
