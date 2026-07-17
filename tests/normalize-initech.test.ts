import { beforeAll, describe, expect, test } from "vitest";
import { normalize, type RunResult } from "@/lib/engine/normalize";
import { readConfig, readRaw } from "./helpers";

let run: RunResult;

beforeAll(async () => {
  run = await normalize(readRaw("initech_llc.csv"), readConfig("initech_llc.json"), {
    sourceFile: "initech_llc.csv",
  });
});

const byId = (id: string) => {
  const record = run.records.find((r) => r.data.employee_id === id);
  if (!record) throw new Error(`no record ${id}`);
  return record;
};

describe("Initech golden run (CSV)", () => {
  test("all 22 rows normalize cleanly", () => {
    expect(run.envelope.summary).toEqual({ total: 22, clean: 22, warnings: 0, quarantined: 0 });
  });

  test("employee IDs stay strings — no numeric coercion", () => {
    expect(byId("10001").data.employee_id).toBe("10001");
    expect(typeof byId("10001").data.employee_id).toBe("string");
  });

  test('quoted "Last, First" names split correctly', () => {
    const williams = byId("10001");
    expect(williams.data.first_name).toBe("Marcus");
    expect(williams.data.last_name).toBe("Williams");
    const obrien = byId("10020");
    expect(obrien.data.last_name).toBe("O'Brien");
    expect(obrien.data.first_name).toBe("Kevin");
  });

  test("status codes map: A/T/L", () => {
    expect(byId("10001").data.employment_status).toBe("active");
    const park = byId("10003");
    expect(park.data.employment_status).toBe("terminated");
    expect(park.data.termination_date).toBe("2024-11-15");
    expect(byId("10010").data.employment_status).toBe("leave");
  });

  test("empty CSV cells become null without bogus issues", () => {
    const nakamura = byId("10012"); // no manager
    expect(nakamura.data.manager_employee_id).toBeNull();
    expect(nakamura.issues).toHaveLength(0);
    const sales = byId("10002");
    expect(sales.data.commission_pct).toBe(25);
    expect(sales.data.bonus_target_pct).toBeNull();
  });

  test("structured equity becomes a single mapped grant", () => {
    const williams = byId("10001");
    expect(williams.data.equity_grants).toMatchObject([
      { type: "unknown", value: 300000, vesting_months: 48, provenance: "mapped" },
    ]);
  });

  test("deliberately unmapped columns show up as drift — and only those", () => {
    const paths = run.drift.unmappedSourceFields.map((f) => f.path).sort();
    expect(paths).toEqual(["DEPT_CODE", "LOCATION_CODE"]);
    expect(run.drift.missingSources).toEqual([]);
  });
});
