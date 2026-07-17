"use client";

import { useMemo, useState } from "react";
import type { FieldProfile } from "@/lib/engine/profile";
import { pctLabel, previewValue } from "@/lib/format";

export default function SourcePanel({
  profiles,
  recordCount,
}: {
  profiles: FieldProfile[];
  recordCount: number;
}) {
  const [filter, setFilter] = useState("");
  const visible = useMemo(
    () => profiles.filter((p) => p.path.toLowerCase().includes(filter.toLowerCase())),
    [profiles, filter],
  );

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-100 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Source fields
        </div>
        <div className="mt-0.5 text-[11px] text-slate-400">
          {profiles.length} fields · {recordCount} records
        </div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter fields…"
          className="mt-2 w-full rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-slate-400"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {visible.map((profile) => (
          <div key={profile.path} className="border-b border-slate-50 px-3 py-2">
            <div className="flex items-baseline gap-2">
              <span className="truncate font-mono text-xs text-slate-800" title={profile.path}>
                {profile.path}
              </span>
              <span className="ml-auto shrink-0 rounded bg-slate-100 px-1 text-[10px] text-slate-500">
                {profile.inferredType}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-1.5" title={`${pctLabel(profile.fillRate)} of records have a value`}>
              <div className="h-1 w-16 overflow-hidden rounded bg-slate-100">
                <div
                  className={`h-full ${profile.fillRate < 1 ? "bg-amber-400" : "bg-emerald-400"}`}
                  style={{ width: `${Math.max(4, profile.fillRate * 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-400">{pctLabel(profile.fillRate)}</span>
            </div>
            <div className="mt-1 truncate text-[11px] text-slate-500" title={profile.samples.map(previewValue).join("  ·  ")}>
              {profile.samples.slice(0, 3).map(previewValue).join("  ·  ")}
            </div>
          </div>
        ))}
        {visible.length === 0 && (
          <div className="p-3 text-xs text-slate-400">No fields match “{filter}”.</div>
        )}
      </div>
    </aside>
  );
}
