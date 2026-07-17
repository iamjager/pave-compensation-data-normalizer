import { beforeAll, describe, expect, test } from "vitest";
import { normalize } from "@/lib/engine/normalize";
import { getEquityExtractor } from "@/lib/server/equity-extractor";
import { readConfig, readRaw } from "./helpers";

// These run against the COMMITTED extraction cache (src/data/cache/equity/),
// so they are deterministic and need no API key — proving the offline/demo
// path works end to end with real LLM output shapes.
beforeAll(() => {
  delete process.env.ANTHROPIC_API_KEY; // force the cache-only path
});

describe("cached LLM equity extraction (offline)", () => {
  test("the refresh note yields two grants from cache", async () => {
    const result = await getEquityExtractor().extract(
      "500k RSU over 4 years, granted 2019-11. Refresh: 200k RSU over 4 years, granted 2023-01",
    );
    expect(result.error).toBeUndefined();
    expect(result.grants).toMatchObject([
      { type: "rsu", value: 500000, vesting_months: 48, granted: "2019-11", provenance: "llm_inferred" },
      { type: "rsu", value: 200000, vesting_months: 48, granted: "2023-01", provenance: "llm_inferred" },
    ]);
  });

  test("cliff months come out of '4yr vest, 1yr cliff'", async () => {
    const result = await getEquityExtractor().extract(
      "280k RSU, 4yr vest, 1yr cliff, granted 2021-03",
    );
    expect(result.grants).toMatchObject([
      { type: "rsu", value: 280000, vesting_months: 48, cliff_months: 12 },
    ]);
  });

  test("options carry a strike price and the option type", async () => {
    const result = await getEquityExtractor().extract(
      "60k options, strike $4.20, granted 2021-08",
    );
    expect(result.grants).toMatchObject([
      { type: "option", value: 60000, strike_price: 4.2 },
    ]);
  });

  test("an uncached note degrades to an error result, not a crash", async () => {
    const result = await getEquityExtractor().extract("brand new note nobody cached");
    expect(result.grants).toEqual([]);
    expect(result.error).toContain("ANTHROPIC_API_KEY");
  });

  test("full Globex golden with the real extractor: Reeves totals 700k inferred", async () => {
    const run = await normalize(readRaw("globex_inc.json"), readConfig("globex_inc.json"), {
      equityExtractor: getEquityExtractor(),
    });
    const reeves = run.records.find((r) => r.data.employee_id === "5050")!;
    expect(reeves.data.equity_total_value).toBe(700000);
    expect(reeves.annotations["equity_grants.llm_inferred"]).toBe(true);
    expect(run.envelope.summary).toEqual({ total: 17, clean: 17, warnings: 0, quarantined: 0 });
  });
});
