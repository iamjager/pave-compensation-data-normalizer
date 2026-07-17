"use client";

import type { MappingRule, TransformSpec } from "@/lib/engine/config";
import type { FieldProfile } from "@/lib/engine/profile";
import type { SchemaField } from "@/lib/engine/schema";
import { TRANSFORMS } from "@/lib/engine/transforms";
import MapValuesEditor from "./MapValuesEditor";

const DEFAULT_ARGS: Record<string, Record<string, unknown>> = {
  split: { separator: ",", index: 0 },
  map_values: { map: {} },
  annualize: { frequency_source: "" },
};

export default function TransformEditor({
  field,
  rule,
  profiles,
  onChange,
}: {
  field: SchemaField;
  rule: MappingRule;
  profiles: FieldProfile[];
  onChange: (rule: MappingRule) => void;
}) {
  const transforms = rule.transforms ?? [];

  const setTransforms = (next: TransformSpec[]) =>
    onChange({ ...rule, transforms: next.length > 0 ? next : undefined });

  const updateArgs = (index: number, args: Record<string, unknown>) =>
    setTransforms(transforms.map((t, i) => (i === index ? { ...t, args } : t)));

  const sourceProfile = profiles.find((p) => p.path === rule.source);

  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-slate-500">Transforms:</span>
        {transforms.map((spec, index) => (
          <span
            key={`${spec.fn}-${index}`}
            className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 font-medium text-violet-700"
            title={TRANSFORMS[spec.fn]?.description ?? "Unknown transform"}
          >
            ⚡ {TRANSFORMS[spec.fn]?.label ?? spec.fn}
            <button
              onClick={() => setTransforms(transforms.filter((_, i) => i !== index))}
              className="text-violet-400 hover:text-violet-800"
              title="Remove transform"
            >
              ×
            </button>
          </span>
        ))}
        <select
          value=""
          onChange={(e) => {
            if (!e.target.value) return;
            setTransforms([
              ...transforms,
              { fn: e.target.value, args: DEFAULT_ARGS[e.target.value] ?? {} },
            ]);
          }}
          className="rounded border border-dashed border-slate-300 bg-white px-1.5 py-0.5 text-slate-500 hover:border-slate-500"
        >
          <option value="">+ add transform</option>
          {Object.values(TRANSFORMS).map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {transforms.map((spec, index) => {
        const args = spec.args ?? {};
        if (spec.fn === "split") {
          return (
            <div key={index} className="flex items-center gap-2 pl-4">
              <span className="text-slate-500">split on</span>
              <input
                value={String(args.separator ?? "")}
                onChange={(e) => updateArgs(index, { ...args, separator: e.target.value })}
                className="w-16 rounded border border-slate-200 px-1.5 py-0.5 font-mono"
              />
              <span className="text-slate-500">keep part #</span>
              <input
                type="number"
                min={0}
                value={Number(args.index ?? 0)}
                onChange={(e) => updateArgs(index, { ...args, index: Number(e.target.value) })}
                className="w-14 rounded border border-slate-200 px-1.5 py-0.5"
              />
            </div>
          );
        }
        if (spec.fn === "annualize") {
          return (
            <div key={index} className="flex items-center gap-2 pl-4">
              <span className="text-slate-500">frequency comes from</span>
              <select
                value={String(args.frequency_source ?? "")}
                onChange={(e) =>
                  updateArgs(index, { ...args, frequency_source: e.target.value })
                }
                className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono"
              >
                <option value="">choose field…</option>
                {profiles.map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.path}
                  </option>
                ))}
              </select>
            </div>
          );
        }
        if (spec.fn === "map_values") {
          return (
            <div key={index} className="pl-4">
              <MapValuesEditor
                field={field}
                map={(args.map ?? {}) as Record<string, unknown>}
                distinctValues={sourceProfile?.distinctValues}
                onChange={(map) => updateArgs(index, { ...args, map })}
              />
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
