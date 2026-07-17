"use client";

import type { SchemaField } from "@/lib/engine/schema";

/**
 * The non-technical showpiece: the left column is pre-filled with the
 * distinct values actually present in the source, so mapping a status code
 * is picking what each one means — not typing config by hand.
 */
export default function MapValuesEditor({
  field,
  map,
  distinctValues,
  onChange,
}: {
  field: SchemaField;
  map: Record<string, unknown>;
  distinctValues: unknown[] | undefined;
  onChange: (map: Record<string, unknown>) => void;
}) {
  if (!distinctValues) {
    return (
      <div className="text-[11px] text-slate-400">
        Choose a source field first (or it has too many distinct values to list) — edit the map
        in the Config JSON tab instead.
      </div>
    );
  }

  const sourceKeys = distinctValues.map((v) => String(v));
  // Keep any extra keys that exist in the map but not in this file's data.
  const extraKeys = Object.keys(map).filter((k) => !sourceKeys.includes(k));

  const setEntry = (key: string, raw: string) => {
    const next = { ...map };
    if (raw === "") {
      delete next[key];
    } else {
      next[key] = raw.trim() !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
    }
    onChange(next);
  };

  const renderTarget = (key: string) => {
    const current = map[key] === undefined ? "" : String(map[key]);
    if (field.enumValues) {
      return (
        <select
          value={current}
          onChange={(e) => setEntry(key, e.target.value)}
          className={`rounded border px-1.5 py-0.5 ${current === "" ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}
        >
          <option value="">— unmapped (flags a warning) —</option>
          {field.enumValues.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        value={current}
        onChange={(e) => setEntry(key, e.target.value)}
        placeholder="unmapped → warning"
        className={`w-36 rounded border px-1.5 py-0.5 ${current === "" ? "border-amber-300 bg-amber-50" : "border-slate-200"}`}
      />
    );
  };

  return (
    <div className="inline-block rounded-lg border border-slate-200 bg-white p-2">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Value map — every value seen in the data
      </div>
      <table className="text-xs">
        <tbody>
          {[...sourceKeys, ...extraKeys].map((key) => (
            <tr key={key}>
              <td className="pr-2 font-mono text-slate-700">
                “{key}”
                {extraKeys.includes(key) && (
                  <span className="ml-1 text-[10px] text-slate-400">(not in this file)</span>
                )}
              </td>
              <td className="pr-2 text-slate-300">→</td>
              <td className="py-0.5">{renderTarget(key)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
