"use client";

import Link from "next/link";
import type { CompanyConfig } from "@/lib/engine/config";
import type { RunSummary } from "@/lib/engine/normalize";
import type { SourceDetail } from "./MapperScreen";

export default function HeaderBar({
  config,
  detail,
  summary,
  requiredProgress,
  dirty,
  busy,
  onSave,
  onExport,
  onSuggest,
}: {
  config: CompanyConfig;
  detail: SourceDetail;
  summary: RunSummary | null;
  requiredProgress: { mapped: number; total: number };
  dirty: boolean;
  busy: string | null;
  onSave: () => void;
  onExport: () => void;
  onSuggest: () => void;
}) {
  const exportBlocked = dirty || config.config_version === 0;
  return (
    <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-2.5">
      <Link href="/" className="text-sm text-slate-400 hover:text-slate-700" title="All companies">
        ←
      </Link>
      <div>
        <div className="text-sm font-semibold leading-tight">{config.company_name}</div>
        <div className="font-mono text-[11px] leading-tight text-slate-400">
          {detail.info.fileName}
          {config.config_version > 0 ? ` · config v${config.config_version}` : " · unsaved draft"}
          {dirty && config.config_version > 0 ? " · edited" : ""}
        </div>
      </div>

      {summary && (
        <div className="ml-4 flex items-center gap-2 text-xs">
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
            {summary.clean} clean
          </span>
          <span className={`rounded-full px-2 py-0.5 font-medium ${summary.warnings > 0 ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-400"}`}>
            {summary.warnings} warnings
          </span>
          <span className={`rounded-full px-2 py-0.5 font-medium ${summary.quarantined > 0 ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-400"}`}>
            {summary.quarantined} quarantined
          </span>
          <span className="text-slate-400">of {summary.total}</span>
        </div>
      )}

      <div className="ml-auto flex items-center gap-3">
        <span
          className={`text-xs font-medium ${requiredProgress.mapped === requiredProgress.total ? "text-emerald-600" : "text-amber-600"}`}
        >
          {requiredProgress.mapped}/{requiredProgress.total} required mapped
        </span>
        <button
          onClick={onSuggest}
          disabled={busy !== null}
          className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50"
        >
          {busy === "suggest" ? "Suggesting…" : "✨ Suggest mappings"}
        </button>
        <button
          onClick={onSave}
          disabled={busy !== null || !dirty}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-40"
          title={dirty ? "Save the config (bumps the version and confirms suggestions)" : "No unsaved changes"}
        >
          {busy === "save" ? "Saving…" : "Save"}
        </button>
        <button
          onClick={onExport}
          disabled={busy !== null || exportBlocked}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
          title={exportBlocked ? "Save the config first — exports always run a saved version" : "Run the saved config and write the normalized dataset"}
        >
          {busy === "export" ? "Exporting…" : "Export"}
        </button>
      </div>
    </header>
  );
}
