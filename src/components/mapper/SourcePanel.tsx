"use client";

import { useMemo, useState } from "react";
import type { AdditionalList, ListMode, SourceSpec } from "@/lib/engine/config";
import type { FieldProfile } from "@/lib/engine/profile";
import { pctLabel, previewValue } from "@/lib/format";
import type { ListWithKeys } from "./MapperScreen";

export default function SourcePanel({
  profiles,
  recordCount,
  lists,
  source,
  onUpdateSource,
}: {
  profiles: FieldProfile[];
  recordCount: number;
  lists: ListWithKeys[];
  source: SourceSpec;
  onUpdateSource: (next: SourceSpec) => void;
}) {
  const [filter, setFilter] = useState("");
  const visible = useMemo(
    () => profiles.filter((p) => p.path.toLowerCase().includes(filter.toLowerCase())),
    [profiles, filter],
  );
  // Join keys are near-always top-level primary fields; embedded objects
  // never appear as leaves, so this is primary-only by construction.
  const primaryKeyCandidates = useMemo(
    () => profiles.filter((p) => !p.path.includes(".")).map((p) => p.path),
    [profiles],
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

      {lists.length > 1 && (
        <div className="border-b border-slate-100 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Lists in this file
          </div>
          <div className="mt-2 space-y-2">
            {lists.map((list) =>
              list.mode === "primary" ? (
                <div key={list.path} className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 truncate font-mono text-slate-800" title={list.path}>
                    {list.path}
                  </span>
                  <span className="shrink-0 text-slate-400">({list.recordCount})</span>
                  <span className="ml-auto shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                    primary
                  </span>
                </div>
              ) : (
                <ListRow
                  key={list.path}
                  list={list}
                  source={source}
                  primaryKeyCandidates={primaryKeyCandidates}
                  onUpdateSource={onUpdateSource}
                />
              ),
            )}
          </div>
        </div>
      )}

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

/** One status chip, highest-priority problem first. */
function listStatus(list: ListWithKeys, configured: boolean) {
  if (list.missing) return { text: "missing from file", className: "bg-rose-50 text-rose-700" };
  if (list.collision) return { text: "name clash — not merged", className: "bg-rose-50 text-rose-700" };
  if (!configured) return { text: "not handled", className: "bg-amber-50 text-amber-700" };
  if (list.mode === "merge" && list.matchedCount !== undefined) {
    return { text: `${list.matchedCount} matched`, className: "bg-emerald-50 text-emerald-700" };
  }
  return null;
}

function ListRow({
  list,
  source,
  primaryKeyCandidates,
  onUpdateSource,
}: {
  list: ListWithKeys;
  source: SourceSpec;
  primaryKeyCandidates: string[];
  onUpdateSource: (next: SourceSpec) => void;
}) {
  const entry = source.additional_lists?.find((l) => l.path === list.path);
  const status = listStatus(list, entry !== undefined);

  const setEntry = (patch: Partial<AdditionalList>) => {
    const others = (source.additional_lists ?? []).filter((l) => l.path !== list.path);
    const next: AdditionalList = { path: list.path, mode: "ignore", ...entry, ...patch };
    onUpdateSource({ ...source, additional_lists: [...others, next] });
  };

  return (
    <div className="rounded-md bg-slate-50/60 p-1.5 text-xs ring-1 ring-slate-100">
      <div className="flex items-center gap-2">
        <span className="min-w-0 truncate font-mono text-slate-800" title={list.path}>
          {list.path}
        </span>
        <span className="shrink-0 text-slate-400">({list.recordCount})</span>
        {status && (
          <span className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${status.className}`}>
            {status.text}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <select
          value={entry?.mode ?? ""}
          onChange={(e) => {
            const mode = e.target.value as ListMode | "";
            if (mode) setEntry({ mode });
          }}
          className="rounded border border-slate-200 bg-white px-1 py-0.5"
        >
          <option value="" disabled>
            choose…
          </option>
          <option value="merge">Merge into records</option>
          <option value="concat">Append as records</option>
          <option value="ignore">Ignore</option>
        </select>
        {entry?.mode === "merge" && (
          <>
            <span className="text-slate-400">on</span>
            <select
              value={entry.primary_key ?? ""}
              onChange={(e) => setEntry({ primary_key: e.target.value || undefined })}
              className="max-w-[7rem] rounded border border-slate-200 bg-white px-1 py-0.5 font-mono"
              title="Record ID in the primary list"
            >
              <option value="">record ID…</option>
              {primaryKeyCandidates.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
            <span className="text-slate-400">↔</span>
            <select
              value={entry.list_key ?? entry.primary_key ?? ""}
              onChange={(e) => setEntry({ list_key: e.target.value || undefined })}
              className="max-w-[7rem] rounded border border-slate-200 bg-white px-1 py-0.5 font-mono"
              title="Record ID in this list (defaults to the same field)"
            >
              <option value="">same ID…</option>
              {(list.keyCandidates ?? []).map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </>
        )}
      </div>
    </div>
  );
}
