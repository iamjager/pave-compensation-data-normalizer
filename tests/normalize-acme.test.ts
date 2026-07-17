import { beforeAll, describe, expect, test } from "vitest";
import { normalize, type RunResult } from "@/lib/engine/normalize";
import { readConfig, readRaw } from "./helpers";

let run: RunResult;

beforeAll(async () => {
  run = await normalize(readRaw("acme_corp.json"), readConfig("acme_corp.json"), {
    sourceFile: "acme_corp.json",
  });
});

const byId = (id: string) => {
  const record = run.records.find((r) => r.data.employee_id === id);
  if (!record) throw new Error(`no record ${id}`);
  return record;
};

describe("Acme golden run", () => {
  test("all 20 workers normalize cleanly", () => {
    expect(run.envelope.summary).toEqual({ total: 20, clean: 20, warnings: 0, quarantined: 0 });
    expect(run.envelope.config_warnings).toEqual([]);
  });

  test("envelope carries the export's snapshot timestamp", () => {
    expect(run.envelope.source_generated_at).toBe("2026-04-15T08:30:00Z");
  });

  test("terminated worker keeps status and date", () => {
    const park = byId("WD-10901");
    expect(park.data.employment_status).toBe("terminated");
    expect(park.data.termination_date).toBe("2026-02-28");
  });

  test("sales rep with null bonus_plan maps commission cleanly", () => {
    const mitchell = byId("WD-10333");
    expect(mitchell.data.bonus_target_pct).toBeNull();
    expect(mitchell.data.bonus_plan_name).toBeNull();
    expect(mitchell.data.ote).toBe(240000);
    expect(mitchell.data.variable_comp_notes).toContain("uncapped");
    expect(mitchell.issues).toHaveLength(0);
  });

  test("supervisory_org splits into department + team; single-part orgs get no team", () => {
    const chen = byId("WD-10042");
    expect(chen.data.department).toBe("Engineering");
    expect(chen.data.team).toBe("Platform");
    const johnson = byId("WD-10600"); // supervisory_org: "Data Science"
    expect(johnson.data.department).toBe("Data Science");
    expect(johnson.data.team).toBeNull();
    const wu = byId("WD-10334"); // "Sales - Mid-Market"
    expect(wu.data.team).toBe("Mid-Market");
  });

  test("job architecture and apostrophe names survive", () => {
    const obrien = byId("WD-10305");
    expect(obrien.data.last_name).toBe("O'Brien");
    const chen = byId("WD-10042");
    expect(chen.data.job_level).toBe("P4");
    expect(chen.data.management_track).toBe("ic");
    expect(chen.data.job_family).toBe("Engineering");
  });

  test("vesting string yields months AND cliff via two value maps", () => {
    const chen = byId("WD-10042");
    expect(chen.data.equity_grants).toEqual([
      {
        type: "rsu", value: 200000, vesting_months: 48, cliff_months: 12,
        granted: null, strike_price: null, provenance: "mapped",
      },
    ]);
    expect(chen.data.equity_total_value).toBe(200000);
  });

  test("every source field is mapped or covered — no drift on a fresh config", () => {
    expect(run.drift.missingSources).toEqual([]);
    expect(run.drift.unknownEnumValues).toEqual([]);
    expect(run.drift.unmappedSourceFields).toEqual([]);
  });
});
