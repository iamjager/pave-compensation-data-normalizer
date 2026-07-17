"use client";

import { useMemo, useState } from "react";
import type { MappingRule } from "@/lib/engine/config";
import type { FieldProfile } from "@/lib/engine/profile";
import { pctLabel, previewValue } from "@/lib/format";

/**
 * Where does this field come from? A searchable source-path list with the
 * evidence inline (type, fill, samples), or a constant value.
 */
export default function SourcePathPicker({
  profiles,
  rule,
  onChange,
}: {
  profiles: FieldProfile[];
  rule: MappingRule | undefined;
  onChange: (rule: MappingRule) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [constDraft, setConstDraft] = useState(
    rule?.const !== undefined ? String(rule.const) : "",
  );

  const visible = useMemo(
    () => profiles.filter((p) => p.path.toLowerCase().includes(search.toLowerCase())),
    [profiles, search],
  );

  const pick = (path: string) => {
    onChange({ ...rule, source: path, const: undefined });
    setOpen(false);
  };

  const applyConst = () => {
    const numeric = constDraft.trim() !== "" && !Number.isNaN(Number(constDraft));
    onChange({
      transforms: rule?.transforms,
      const: numeric ? Number(constDraft) : constDraft,
    });
    setOpen(false);
  };

  return (
    <div className="relative text-xs">
      <div className="flex items-center gap-2">
        <span className="text-slate-500">Source:</span>
        <button
          onClick={() => setOpen((o) => !o)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 font-mono hover:border-slate-500"
        >
          {rule?.const !== undefined
            ? `constant: ${previewValue(rule.const)}`
            : rule?.source ?? "choose source…"}
        </button>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute z-30 mt-1 w-[26rem] rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-100 p-2">
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search source fields…"
                className="w-full rounded border border-slate-200 px-2 py-1 outline-none focus:border-slate-400"
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {visible.map((profile) => (
                <button
                  key={profile.path}
                  onClick={() => pick(profile.path)}
                  className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left hover:bg-slate-50"
                >
                  <span className="font-mono text-slate-800">{profile.path}</span>
                  <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-500">
                    {profile.inferredType} · {pctLabel(profile.fillRate)}
                  </span>
                  <span className="ml-auto max-w-[10rem] truncate text-[10px] text-slate-400">
                    {profile.samples.slice(0, 2).map(previewValue).join(" · ")}
                  </span>
                </button>
              ))}
              {visible.length === 0 && (
                <div className="px-3 py-2 text-slate-400">No matching fields.</div>
              )}
            </div>
            <div className="flex items-center gap-2 border-t border-slate-100 p-2">
              <span className="text-slate-500">or constant:</span>
              <input
                value={constDraft}
                onChange={(e) => setConstDraft(e.target.value)}
                placeholder='e.g. "USD"'
                className="flex-1 rounded border border-slate-200 px-2 py-1 font-mono outline-none focus:border-slate-400"
              />
              <button
                onClick={applyConst}
                className="rounded bg-slate-900 px-2 py-1 text-white hover:bg-slate-700"
              >
                Use
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
