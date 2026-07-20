"use client";

import type { DriftReport } from "@/lib/engine/drift";
import { pctLabel, previewValue } from "@/lib/format";

/**
 * The maintenance surface: three ways a new export can stop matching the
 * saved config, each rendered as an actionable list rather than silence.
 */
export default function DriftPanel({ drift }: { drift: DriftReport }) {
  const unhandledLists = drift.unhandledLists ?? [];
  const clean =
    drift.missingSources.length === 0 &&
    drift.unknownEnumValues.length === 0 &&
    drift.unmappedSourceFields.length === 0 &&
    unhandledLists.length === 0;

  if (clean) {
    return (
      <div className="text-xs text-slate-400">
        No drift: every mapped source field is present, every value map covers what the data
        contains, and no source data is being dropped.
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs">
      {unhandledLists.length > 0 && (
        <section>
          <h3 className="font-semibold text-amber-700">
            Record lists not handled ({unhandledLists.length})
          </h3>
          <p className="mb-1 text-slate-500">
            This file contains lists the config says nothing about — merge, append, or ignore
            them in the left panel.
          </p>
          <ul className="space-y-0.5">
            {unhandledLists.map((l) => (
              <li key={l.path} className="flex items-baseline gap-2">
                <span className="font-mono text-amber-700">{l.path}</span>
                <span className="text-[10px] text-slate-400">
                  {l.recordCount} record{l.recordCount === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {drift.missingSources.length > 0 && (
        <section>
          <h3 className="font-semibold text-rose-700">
            Mapped source fields missing from this file ({drift.missingSources.length})
          </h3>
          <p className="mb-1 text-slate-500">
            The config expects these, but no record has a value — renamed or removed upstream?
          </p>
          <ul className="space-y-0.5">
            {drift.missingSources.map((m) => (
              <li key={`${m.targetField}-${m.sourcePath}`} className="font-mono">
                <span className="text-rose-700">{m.sourcePath}</span>
                <span className="text-slate-400"> → {m.targetField}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {drift.unknownEnumValues.length > 0 && (
        <section>
          <h3 className="font-semibold text-amber-700">
            Values with no mapping ({drift.unknownEnumValues.length})
          </h3>
          <p className="mb-1 text-slate-500">
            These source values fell through a value map — add them to the map to resolve.
          </p>
          <ul className="space-y-0.5">
            {drift.unknownEnumValues.map((u) => (
              <li key={`${u.targetField}-${u.value}`}>
                <span className="font-mono text-amber-700">“{u.value}”</span>
                <span className="text-slate-500">
                  {" "}
                  in {u.targetField} — {u.count} record{u.count === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {drift.unmappedSourceFields.length > 0 && (
        <section>
          <h3 className="font-semibold text-slate-700">
            Source data no mapping uses ({drift.unmappedSourceFields.length})
          </h3>
          <p className="mb-1 text-slate-500">
            You are dropping these fields — fine if intentional, worth a look if not.
          </p>
          <ul className="space-y-0.5">
            {drift.unmappedSourceFields.map((f) => (
              <li key={f.path} className="flex items-baseline gap-2">
                <span className="font-mono text-slate-700">{f.path}</span>
                <span className="text-[10px] text-slate-400">{pctLabel(f.fillRate)} filled</span>
                <span className="truncate text-[10px] text-slate-400">
                  {f.samples.map(previewValue).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
