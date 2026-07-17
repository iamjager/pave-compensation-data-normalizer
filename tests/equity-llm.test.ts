import { describe, expect, test, vi } from "vitest";
import type { EquityExtractor, EquityGrant } from "@/lib/engine/equity";
import { normalize } from "@/lib/engine/normalize";
import { readConfig, readRaw } from "./helpers";

const REFRESH_NOTE =
  "500k RSU over 4 years, granted 2019-11. Refresh: 200k RSU over 4 years, granted 2023-01";

// The engine coerces extractor output through coerceGrants, so partial
// grants are the realistic shape to feed it.
const grants = (items: Array<Partial<EquityGrant>>) => items as EquityGrant[];

/** Deterministic stand-in for the LLM: understands the two note shapes we assert on. */
const mockExtractor = (): EquityExtractor & { extract: ReturnType<typeof vi.fn> } => ({
  extract: vi.fn(async (text: string) => {
    if (text === REFRESH_NOTE) {
      return {
        grants: grants([
          { type: "rsu", value: 500000, vesting_months: 48, granted: "2019-11" },
          { type: "rsu", value: 200000, vesting_months: 48, granted: "2023-01" },
        ]),
      };
    }
    if (text.includes("options")) {
      return { grants: grants([{ type: "option", value: 60000, strike_price: 4.2, granted: "2021-08" }]) };
    }
    return { grants: grants([{ type: "rsu", value: 100000 }]) };
  }),
});

describe("LLM equity extraction (mocked extractor)", () => {
  test("the refresh note yields two inferred grants and a summed total", async () => {
    const extractor = mockExtractor();
    const run = await normalize(readRaw("globex_inc.json"), readConfig("globex_inc.json"), {
      equityExtractor: extractor,
    });
    const reeves = run.records.find((r) => r.data.employee_id === "5050")!;
    expect(reeves.data.equity_grants).toMatchObject([
      { type: "rsu", value: 500000, granted: "2019-11", provenance: "llm_inferred" },
      { type: "rsu", value: 200000, granted: "2023-01", provenance: "llm_inferred" },
    ]);
    expect(reeves.data.equity_total_value).toBe(700000);
    expect(reeves.annotations["equity_grants.llm_inferred"]).toBe(true);
    // Raw text is always preserved alongside the extraction.
    expect(reeves.data.equity_notes).toBe(REFRESH_NOTE);
  });

  test("options with a strike price extract as option grants", async () => {
    const run = await normalize(readRaw("globex_inc.json"), readConfig("globex_inc.json"), {
      equityExtractor: mockExtractor(),
    });
    const okafor = run.records.find((r) => r.data.employee_id === "4333")!;
    expect(okafor.data.equity_grants).toMatchObject([
      { type: "option", strike_price: 4.2, provenance: "llm_inferred" },
    ]);
  });

  test("empty notes never call the extractor and produce no grants or issues", async () => {
    const extractor = mockExtractor();
    const run = await normalize(readRaw("globex_inc.json"), readConfig("globex_inc.json"), {
      equityExtractor: extractor,
    });
    const mitchell = run.records.find((r) => r.data.employee_id === "4150")!;
    expect(mitchell.data.equity_grants).toEqual([]);
    expect(mitchell.issues).toHaveLength(0);
    const calledWith = extractor.extract.mock.calls.map((c) => c[0]);
    expect(calledWith).not.toContain("");
  });

  test("extractor failure degrades to a warning; notes and other fields survive", async () => {
    const failing: EquityExtractor = {
      extract: async () => ({ grants: [], error: "API unreachable" }),
    };
    const run = await normalize(readRaw("globex_inc.json"), readConfig("globex_inc.json"), {
      equityExtractor: failing,
    });
    const reeves = run.records.find((r) => r.data.employee_id === "5050")!;
    expect(reeves.data.equity_grants).toEqual([]);
    expect(reeves.data.equity_notes).toBe(REFRESH_NOTE);
    expect(reeves.data.base_salary_annual).toBe(230000.04);
    expect(reeves.issues).toMatchObject([
      { severity: "warning", code: "equity_extraction_failed" },
    ]);
  });

  test("no extractor at all (no API key) warns and keeps the pipeline running", async () => {
    const run = await normalize(readRaw("globex_inc.json"), readConfig("globex_inc.json"), {});
    const reeves = run.records.find((r) => r.data.employee_id === "5050")!;
    expect(reeves.issues).toMatchObject([
      { severity: "warning", code: "equity_extraction_unavailable" },
    ]);
    expect(run.envelope.summary.quarantined).toBe(0);
  });
});
