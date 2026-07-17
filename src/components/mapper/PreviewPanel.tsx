"use client";

import { useMemo, useState } from "react";
import type { CompanyConfig } from "@/lib/engine/config";
import type { RunResult, WrappedRecord } from "@/lib/engine/normalize";
import { money, previewValue } from "@/lib/format";

type Tab = "records" | "issues" | "drift" | "config";

const recordStatus = (record: WrappedRecord): "clean" | "warning" | "quarantined" => {
  if (record.issues.some((i) => i.severity === "error")) return "quarantined";
  return record.issues.length > 0 ? "warning" : "clean";
};

const STATUS_STYLE = {
  clean: { icon: "✓", className: "text-emerald-600" },
  warning: { icon: "⚠", className: "text-amber-600" },
  quarantined: { icon: "✕", className: "text-rose-600" },
} as const;

export default function PreviewPanel({
  preview,
  config,
  driftPanel,
}: {
  preview: RunResult | null;
  config: CompanyConfig;
  driftPanel: React.ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("records");
  const [selected, setSelected] = useState<WrappedRecord | null>(null);

  const issueCount = useMemo(
    () => preview?.records.reduce((n, r) => n + r.issues.length, 0) ?? 0,
    [preview],
  );
  const driftCount = preview
    ? preview.drift.missingSources.length +
      preview.drift.unknownEnumValues.length +
      preview.drift.unmappedSourceFields.length
    : 0;

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "records", label: `Records${preview ? ` (${preview.envelope.summary.total})` : ""}` },
    { id: "issues", label: `Issues${issueCount > 0 ? ` (${issueCount})` : ""}` },
    { id: "drift", label: `Drift${driftCount > 0 ? ` (${driftCount})` : ""}` },
    { id: "config", label: "Config JSON" },
  ];

  return (
    <div className="flex h-80 shrink-0 flex-col border-t border-slate-200 bg-white">
      <div className="flex items-center gap-1 border-b border-slate-100 px-3 pt-1.5">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded-t-md px-3 py-1.5 text-xs font-medium ${
              tab === id
                ? "border border-b-white border-slate-200 bg-white text-slate-900"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {label}
          </button>
        ))}
        {preview?.envelope.source_generated_at && (
          <span className="ml-auto pb-1 text-[11px] text-slate-400">
            source snapshot: {preview.envelope.source_generated_at}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!preview && (
          <div className="p-4 text-xs text-slate-400">
            The live preview appears here as soon as a mapping produces output.
          </div>
        )}

        {preview && tab === "records" && (
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400">
              <tr>
                {["", "ID", "Name", "Title", "Department", "Status", "Base salary", "Bonus", "Equity total", ""].map(
                  (h, i) => (
                    <th key={i} className="px-3 py-1.5 font-semibold">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {preview.records.map((record) => {
                const status = recordStatus(record);
                const d = record.data;
                const annualizedFrom = record.annotations["base_salary_annual.annualized_from"];
                return (
                  <tr
                    key={record.raw_index}
                    onClick={() => setSelected(record)}
                    className={`cursor-pointer hover:bg-slate-50 ${status === "quarantined" ? "bg-rose-50/40" : ""}`}
                  >
                    <td className={`px-3 py-1.5 font-bold ${STATUS_STYLE[status].className}`}>
                      {STATUS_STYLE[status].icon}
                    </td>
                    <td className="px-3 py-1.5 font-mono">{previewValue(d.employee_id)}</td>
                    <td className="px-3 py-1.5">
                      {previewValue(d.first_name)} {previewValue(d.last_name)}
                    </td>
                    <td className="px-3 py-1.5">{previewValue(d.job_title)}</td>
                    <td className="px-3 py-1.5">{previewValue(d.department)}</td>
                    <td className="px-3 py-1.5">{previewValue(d.employment_status)}</td>
                    <td className="px-3 py-1.5 font-mono">
                      {money(d.base_salary_annual, d.currency)}
                      {typeof annualizedFrom === "string" && (
                        <span
                          className="ml-1 rounded bg-sky-50 px-1 text-[10px] text-sky-700"
                          title={`Annualized from ${annualizedFrom.toLowerCase()} pay`}
                        >
                          ⚡×12
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 font-mono">
                      {typeof d.bonus_target_pct === "number"
                        ? `${d.bonus_target_pct}%`
                        : money(d.bonus_target_amount)}
                    </td>
                    <td className="px-3 py-1.5 font-mono">
                      {money(d.equity_total_value)}
                      {record.annotations["equity_grants.llm_inferred"] === true && (
                        <span
                          className="ml-1 rounded bg-violet-50 px-1 text-[10px] text-violet-700"
                          title="Grants extracted from free text by the LLM — flagged as inferred"
                        >
                          ✨inferred
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-[10px] text-slate-400">
                      {record.issues.length > 0 ? `${record.issues.length} issue${record.issues.length === 1 ? "" : "s"}` : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {preview && tab === "issues" && (
          <div className="divide-y divide-slate-50">
            {issueCount === 0 && (
              <div className="p-4 text-xs text-slate-400">No issues — every record is clean.</div>
            )}
            {preview.records
              .filter((r) => r.issues.length > 0)
              .map((record) => (
                <div key={record.raw_index} className="px-4 py-2">
                  <button
                    onClick={() => setSelected(record)}
                    className="font-mono text-xs font-semibold text-slate-700 hover:underline"
                  >
                    {previewValue(record.data.employee_id)} · {previewValue(record.data.first_name)}{" "}
                    {previewValue(record.data.last_name)}
                  </button>
                  <ul className="mt-1 space-y-0.5">
                    {record.issues.map((issue, i) => (
                      <li key={i} className="flex items-baseline gap-2 text-xs">
                        <span
                          className={`rounded px-1 text-[10px] font-medium ${
                            issue.severity === "error"
                              ? "bg-rose-50 text-rose-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {issue.severity}
                        </span>
                        {issue.field && <span className="font-mono text-slate-500">{issue.field}</span>}
                        <span className="text-slate-700">{issue.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        )}

        {preview && tab === "drift" && <div className="p-4">{driftPanel}</div>}

        {tab === "config" && (
          <div className="p-4">
            <div className="mb-2 flex items-center gap-3">
              <span className="text-xs text-slate-500">
                The exact artifact the pipeline runs — produced by this UI, never edited by hand.
              </span>
              <a
                href={`data:application/json,${encodeURIComponent(JSON.stringify(config, null, 2))}`}
                download={`${config.company_id}.json`}
                className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
              >
                Download
              </a>
            </div>
            <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
              {JSON.stringify(config, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {selected && <RecordDetail record={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function RecordDetail({ record, onClose }: { record: WrappedRecord; onClose: () => void }) {
  const status = recordStatus(record);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-8" onClick={onClose}>
      <div
        className="flex max-h-full w-full max-w-5xl flex-col rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3">
          <span className={`font-bold ${STATUS_STYLE[status].className}`}>{STATUS_STYLE[status].icon}</span>
          <span className="text-sm font-semibold">
            Record #{record.raw_index} — {previewValue(record.data.first_name)}{" "}
            {previewValue(record.data.last_name)}
          </span>
          <span className="text-xs text-slate-400">{status}</span>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-700">
            ✕ close
          </button>
        </div>

        {(record.issues.length > 0 || Object.keys(record.annotations).length > 0) && (
          <div className="space-y-1 border-b border-slate-100 bg-slate-50 px-5 py-2 text-xs">
            {record.issues.map((issue, i) => (
              <div key={i} className="flex items-baseline gap-2">
                <span
                  className={`rounded px-1 text-[10px] font-medium ${
                    issue.severity === "error" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {issue.severity}
                </span>
                <span>{issue.message}</span>
              </div>
            ))}
            {Object.entries(record.annotations).map(([key, value]) => (
              <div key={key} className="text-slate-500">
                <span className="rounded bg-sky-50 px-1 text-[10px] font-medium text-sky-700">note</span>{" "}
                <span className="font-mono">{key}</span>: {String(value)}
              </div>
            ))}
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-2 gap-0 divide-x divide-slate-100">
          {(["raw", "data"] as const).map((side) => (
            <div key={side} className="min-h-0 overflow-auto p-4">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {side === "raw" ? "Raw source record" : "Normalized record"}
              </div>
              <pre className="text-[11px] leading-relaxed text-slate-800">
                {JSON.stringify(record[side], null, 2)}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
