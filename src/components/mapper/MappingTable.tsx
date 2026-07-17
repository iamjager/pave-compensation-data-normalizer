"use client";

import { useMemo, useState } from "react";
import type { CompanyConfig, MappingRule } from "@/lib/engine/config";
import type { RunResult } from "@/lib/engine/normalize";
import type { FieldProfile } from "@/lib/engine/profile";
import { FIELD_GROUPS, SCHEMA } from "@/lib/engine/schema";
import type { RowChip } from "./MapperScreen";
import MappingRow from "./MappingRow";

export interface FieldIssueStats {
  errors: number;
  warnings: number;
}

export default function MappingTable({
  config,
  profiles,
  preview,
  rowStatus,
  onUpdateRule,
}: {
  config: CompanyConfig;
  profiles: FieldProfile[];
  preview: RunResult | null;
  rowStatus: Record<string, RowChip>;
  onUpdateRule: (fieldKey: string, rule: MappingRule | null) => void;
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const issueStats = useMemo(() => {
    const stats = new Map<string, FieldIssueStats>();
    for (const record of preview?.records ?? []) {
      for (const issue of record.issues) {
        if (!issue.field) continue;
        const entry = stats.get(issue.field) ?? { errors: 0, warnings: 0 };
        if (issue.severity === "error") entry.errors += 1;
        else entry.warnings += 1;
        stats.set(issue.field, entry);
      }
    }
    return stats;
  }, [preview]);

  const firstRecord = preview?.records[0] ?? null;

  return (
    <div className="px-4 pb-6">
      {FIELD_GROUPS.map((group) => (
        <section key={group}>
          <h2 className="sticky top-0 z-10 -mx-4 border-b border-slate-200 bg-slate-50/95 px-4 pb-1.5 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur">
            {group}
          </h2>
          <div className="divide-y divide-slate-100 rounded-b-lg bg-white shadow-sm ring-1 ring-slate-200/60">
            {SCHEMA.filter((f) => f.group === group).map((field) => (
              <MappingRow
                key={field.key}
                field={field}
                rule={config.mappings[field.key]}
                profiles={profiles}
                chip={rowStatus[field.key]}
                stats={issueStats.get(field.key)}
                firstRecord={firstRecord}
                expanded={expandedKey === field.key}
                onToggle={() =>
                  setExpandedKey((k) => (k === field.key ? null : field.key))
                }
                onChange={(rule) => onUpdateRule(field.key, rule)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
