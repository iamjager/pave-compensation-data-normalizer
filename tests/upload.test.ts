import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { guessRecordsPath } from "@/lib/engine/loaders";
import { collectStringHashes, sanitizeCompanyId } from "@/lib/server/store";

describe("sanitizeCompanyId (uploaded file name → company id)", () => {
  test("normalizes messy export names", () => {
    expect(sanitizeCompanyId("Acme Corp (2026) Export.JSON")).toBe("acme_corp_2026_export");
    expect(sanitizeCompanyId("globex_inc.json")).toBe("globex_inc");
    expect(sanitizeCompanyId("Employee Roster.csv")).toBe("employee_roster");
  });

  test("never produces an empty or unsafe id", () => {
    expect(sanitizeCompanyId("!!!.csv")).toBe("company");
    expect(sanitizeCompanyId("../../etc/passwd.json")).toBe("etc_passwd");
  });
});

describe("collectStringHashes (cache cleanup on company delete)", () => {
  const sha = (s: string) => createHash("sha256").update(s.trim()).digest("hex");

  test("hashes every string value, nested and trimmed", () => {
    const doc = { a: "note one", nested: { list: [{ b: "  note two  " }] }, n: 42, empty: "" };
    const hashes = collectStringHashes(doc);
    expect(hashes.has(sha("note one"))).toBe(true);
    expect(hashes.has(sha("note two"))).toBe(true);
    expect(hashes.size).toBe(2);
  });

  test("exact match only — a substring note from ANOTHER company must not match", () => {
    // Regression: "50k RSU over 4 years" (another company's cached note) is a
    // substring of this company's "150k RSU over 4 years, granted 2022-01".
    const doc = { equityText: "150k RSU over 4 years, granted 2022-01" };
    const hashes = collectStringHashes(doc);
    expect(hashes.has(sha("150k RSU over 4 years, granted 2022-01"))).toBe(true);
    expect(hashes.has(sha("50k RSU over 4 years"))).toBe(false);
    expect(hashes.has(sha("100k RSU over 4 years"))).toBe(false);
  });
});

describe("guessRecordsPath (seeding a draft config for uploads)", () => {
  test("finds top-level record arrays", () => {
    expect(guessRecordsPath(JSON.stringify({ employees: [{ id: 1 }] }))).toBe("employees");
  });

  test("finds record arrays one level deep", () => {
    const doc = { report: { generated: "2026-01-01", workers: [{ id: 1 }, { id: 2 }] } };
    expect(guessRecordsPath(JSON.stringify(doc))).toBe("report.workers");
  });

  test("root arrays need no path; junk yields null", () => {
    expect(guessRecordsPath(JSON.stringify([{ id: 1 }]))).toBeNull();
    expect(guessRecordsPath("not json")).toBeNull();
    expect(guessRecordsPath(JSON.stringify({ counts: [1, 2, 3] }))).toBeNull();
  });
});
