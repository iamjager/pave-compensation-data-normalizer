import { describe, expect, test } from "vitest";
import type { CompanyConfig, SourceSpec } from "@/lib/engine/config";
import { enumerateLists, loadRecords } from "@/lib/engine/loaders";
import { normalize } from "@/lib/engine/normalize";

const DOC = {
  company: { name: "Spark Studios", payroll_provider: "Gusto" },
  employees: [
    { employee_id: "SS-1", name: "Mia" },
    { employee_id: "SS-2", name: "Omar" },
    { employee_id: null, name: "Ghost" },
  ],
  compensation: [
    { employee_id: "SS-1", salary: 100000 },
    { employee_id: "SS-2", salary: 90000 },
    { employee_id: "SS-2", salary: 95000 }, // duplicate key — last wins
    { employee_id: null, salary: 1 }, // unkeyed — must never match the null primary
  ],
  contractors: [{ employee_id: "C-1", name: "Rex" }],
  audit_log: [{ event: "login" }],
  tags: ["a", "b"], // scalar array — not a record list
};

const source = (overrides: Partial<SourceSpec> = {}): SourceSpec => ({
  format: "json",
  records_path: "employees",
  ...overrides,
});

describe("enumerateLists", () => {
  test("finds record arrays top-level first, then one deep; skips scalars and objects", () => {
    const nested = { report: { workers: [{ id: 1 }] }, employees: [{ id: 2 }], meta: { n: 1 } };
    expect(enumerateLists(nested).map((l) => l.path)).toEqual(["employees", "report.workers"]);
    expect(enumerateLists(DOC).map((l) => l.path)).toEqual([
      "employees", "compensation", "contractors", "audit_log",
    ]);
  });
});

describe("loadJson dispositions", () => {
  test("merge embeds the matched row under the list's last segment", () => {
    const { records, lists } = loadRecords(JSON.stringify(DOC), source({
      additional_lists: [
        { path: "compensation", mode: "merge", primary_key: "employee_id" },
        { path: "contractors", mode: "concat" },
        { path: "audit_log", mode: "ignore" },
      ],
    }));
    const mia = records.find((r) => r.employee_id === "SS-1")!;
    expect(mia.compensation).toMatchObject({ salary: 100000 });
    // duplicate join key: last occurrence wins, and it's counted
    const omar = records.find((r) => r.employee_id === "SS-2")!;
    expect(omar.compensation).toMatchObject({ salary: 95000 });
    // Matches: SS-1 and SS-2. Ghost has a null key (skipped); the concat'd
    // contractor C-1 has no comp row.
    const merge = lists.find((l) => l.path === "compensation")!;
    expect(merge).toMatchObject({ mode: "merge", matchedCount: 2, duplicateKeys: 1, embedSegment: "compensation" });
    // concat'd contractor is part of the stream AND participates in the merge
    expect(records).toHaveLength(4);
    expect(lists.find((l) => l.path === "contractors")).toMatchObject({ mode: "concat", recordCount: 1 });
    expect(lists.find((l) => l.path === "audit_log")).toMatchObject({ mode: "ignore" });
    expect(lists.find((l) => l.mode === "unhandled")).toBeUndefined();
  });

  test("null join keys never unify: unkeyed rows match nothing", () => {
    const { records } = loadRecords(JSON.stringify(DOC), source({
      additional_lists: [{ path: "compensation", mode: "merge", primary_key: "employee_id" }],
    }));
    const ghost = records.find((r) => r.name === "Ghost")!;
    expect("compensation" in ghost).toBe(false);
  });

  test("missing configured list is tolerated and flagged, not thrown", () => {
    const { records, lists } = loadRecords(JSON.stringify(DOC), source({
      additional_lists: [{ path: "benefits", mode: "merge", primary_key: "employee_id" }],
    }));
    expect(records).toHaveLength(3);
    expect(lists.find((l) => l.path === "benefits")).toMatchObject({ mode: "merge", missing: true });
  });

  test("embed-key collision skips the merge and flags it", () => {
    const doc = {
      workers: [{ id: "1", compensation: { amount: 5 } }],
      compensation: [{ id: "1", salary: 100000 }],
    };
    const { records, lists } = loadRecords(JSON.stringify(doc), source({
      records_path: "workers",
      additional_lists: [{ path: "compensation", mode: "merge", primary_key: "id" }],
    }));
    expect(records[0].compensation).toEqual({ amount: 5 }); // native field untouched
    expect(lists.find((l) => l.path === "compensation")).toMatchObject({ collision: true });
  });

  test("unconfigured lists are reported as unhandled", () => {
    const { lists } = loadRecords(JSON.stringify(DOC), source());
    const unhandled = lists.filter((l) => l.mode === "unhandled").map((l) => l.path).sort();
    expect(unhandled).toEqual(["audit_log", "compensation", "contractors"]);
  });

  test("merged rows come from a nested list path via its last segment", () => {
    const doc = {
      staff: [{ id: "1" }],
      payload: { comp: [{ id: "1", salary: 50000 }] },
    };
    const { records } = loadRecords(JSON.stringify(doc), source({
      records_path: "staff",
      additional_lists: [{ path: "payload.comp", mode: "merge", primary_key: "id" }],
    }));
    expect(records[0].comp).toMatchObject({ salary: 50000 });
  });
});

const miniConfig = (src: SourceSpec, mappings: CompanyConfig["mappings"]): CompanyConfig => ({
  config_version: 1,
  company_id: "spark_test",
  company_name: "Spark Test",
  updated_at: "2026-07-20T00:00:00.000Z",
  source: src,
  mappings: {
    employee_id: { source: "employee_id" },
    first_name: { source: "name" },
    last_name: { source: "name" },
    job_title: { const: "Engineer" },
    department: { const: "Eng" },
    employment_status: { const: "active" },
    hire_date: { const: "2022-01-01" },
    currency: { const: "USD" },
    ...mappings,
  },
});

describe("normalize over multi-list documents", () => {
  test("merged fields map; unmatched records warn; join keys are not drift", async () => {
    const config = miniConfig(
      source({ additional_lists: [{ path: "compensation", mode: "merge", primary_key: "employee_id" }] }),
      { base_salary_annual: { source: "compensation.salary" } },
    );
    const run = await normalize(JSON.stringify(DOC), config);

    const mia = run.records.find((r) => r.data.employee_id === "SS-1")!;
    expect(mia.data.base_salary_annual).toBe(100000);

    const ghost = run.records.find((r) => r.data.first_name === "Ghost")!;
    expect(ghost.issues.some((i) => i.code === "merge_unmatched")).toBe(true);

    // BUG-3 regression: the embedded join key must not appear as dropped data.
    expect(run.drift.unmappedSourceFields.map((f) => f.path)).not.toContain("compensation.employee_id");
    // Unconfigured lists surface as drift…
    expect(run.drift.unhandledLists.map((l) => l.path).sort()).toEqual(["audit_log", "contractors"]);
    // …and the run carries the list report + live profiles.
    expect(run.lists.find((l) => l.mode === "primary")).toMatchObject({ path: "employees" });
    expect(run.sourceProfiles.some((p) => p.path === "compensation.salary")).toBe(true);
  });

  test("a configured list that vanished is a loud run-level warning", async () => {
    const config = miniConfig(
      source({ additional_lists: [{ path: "benefits", mode: "merge", primary_key: "employee_id" }] }),
      {},
    );
    const run = await normalize(JSON.stringify(DOC), config);
    expect(run.envelope.config_warnings.join(" ")).toContain('"benefits" was not found');
  });

  test("csv sources warn when additional_lists is set", async () => {
    const run = await normalize("A,B\n1,2\n", {
      ...miniConfig(source(), {}),
      source: { format: "csv", additional_lists: [{ path: "x", mode: "concat" }] },
    });
    expect(run.envelope.config_warnings.join(" ")).toContain("CSV");
  });
});
