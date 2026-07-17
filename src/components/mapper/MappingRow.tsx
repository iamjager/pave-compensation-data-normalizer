"use client";

import type { MappingRule } from "@/lib/engine/config";
import type { WrappedRecord } from "@/lib/engine/normalize";
import type { FieldProfile } from "@/lib/engine/profile";
import type { SchemaField } from "@/lib/engine/schema";
import { previewValue } from "@/lib/format";
import type { RowChip } from "./MapperScreen";
import type { FieldIssueStats } from "./MappingTable";
import SourcePathPicker from "./SourcePathPicker";
import TransformEditor from "./TransformEditor";

const VIRTUAL_GRANT_PROP: Record<string, string> = {
  equity_grant_type: "type",
  equity_grant_value: "value",
  equity_vesting_months: "vesting_months",
  equity_cliff_months: "cliff_months",
  equity_granted: "granted",
  equity_strike_price: "strike_price",
};

function liveSample(field: SchemaField, record: WrappedRecord | null): string {
  if (!record) return "";
  if (field.virtual) {
    const grants = record.data.equity_grants as Array<Record<string, unknown>> | undefined;
    return previewValue(grants?.[0]?.[VIRTUAL_GRANT_PROP[field.key]] ?? null);
  }
  return previewValue(record.data[field.key]);
}

export default function MappingRow({
  field,
  rule,
  profiles,
  chip,
  stats,
  firstRecord,
  expanded,
  onToggle,
  onChange,
}: {
  field: SchemaField;
  rule: MappingRule | undefined;
  profiles: FieldProfile[];
  chip: RowChip | undefined;
  stats: FieldIssueStats | undefined;
  firstRecord: WrappedRecord | null;
  expanded: boolean;
  onToggle: () => void;
  onChange: (rule: MappingRule | null) => void;
}) {
  if (field.derived) {
    return (
      <div className="flex items-center gap-3 px-3 py-2 text-xs text-slate-400">
        <span className="w-52 shrink-0">{field.label}</span>
        <span className="italic">derived — {field.description}</span>
        <span className="ml-auto font-mono">{liveSample(field, firstRecord)}</span>
      </div>
    );
  }

  const mapped = rule !== undefined;
  const statusDot = !mapped
    ? field.required
      ? "bg-rose-400"
      : "bg-slate-200"
    : stats?.errors
      ? "bg-rose-500"
      : stats?.warnings
        ? "bg-amber-400"
        : "bg-emerald-400";

  const sourceSummary = !mapped
    ? field.required
      ? "choose a source — required"
      : "not mapped"
    : rule.const !== undefined
      ? `constant: ${previewValue(rule.const)}`
      : rule.source ?? "—";

  return (
    <div className={expanded ? "bg-slate-50/70" : undefined}>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
        title={field.description}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`} />
        <span className="w-52 shrink-0 text-xs font-medium text-slate-800">
          {field.label}
          {field.required && <span className="ml-0.5 text-rose-500">*</span>}
        </span>

        <span className="text-slate-300">←</span>
        <span
          className={`min-w-0 flex-1 truncate font-mono text-xs ${mapped ? "text-slate-700" : "italic text-slate-400"}`}
        >
          {sourceSummary}
          {(rule?.transforms?.length ?? 0) > 0 && (
            <span className="ml-2 text-violet-600">
              ⚡{rule!.transforms!.map((t) => t.fn).join(" → ")}
            </span>
          )}
        </span>

        {chip && (
          <span
            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
              chip === "suggested" ? "bg-violet-50 text-violet-700" : "bg-amber-50 text-amber-700"
            }`}
          >
            {chip === "suggested" ? "✨ suggested" : "⚠ needs review"}
          </span>
        )}
        {stats && (stats.errors > 0 || stats.warnings > 0) && (
          <span
            className={`shrink-0 rounded px-1 text-[10px] font-medium ${
              stats.errors > 0 ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"
            }`}
            title={`${stats.errors} errors, ${stats.warnings} warnings across records`}
          >
            {stats.errors > 0 ? `${stats.errors}✕` : `${stats.warnings}⚠`}
          </span>
        )}
        <span
          className="w-36 shrink-0 truncate text-right font-mono text-[11px] text-slate-500"
          title="First record through this rule"
        >
          {mapped ? liveSample(field, firstRecord) : ""}
        </span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-slate-100 px-3 py-3 pl-8">
          <SourcePathPicker
            profiles={profiles}
            rule={rule}
            onChange={(next) => onChange(next)}
          />
          {rule && (
            <TransformEditor
              field={field}
              rule={rule}
              profiles={profiles}
              onChange={onChange}
            />
          )}
          {rule && (
            <button
              onClick={() => onChange(null)}
              className="text-[11px] text-rose-500 hover:text-rose-700"
            >
              Remove this mapping
            </button>
          )}
        </div>
      )}
    </div>
  );
}
