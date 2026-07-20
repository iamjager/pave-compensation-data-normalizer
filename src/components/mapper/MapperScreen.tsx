"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CompanyConfig, MappingRule, SourceSpec } from "@/lib/engine/config";
import type { ListInfo } from "@/lib/engine/loaders";
import type { RunResult } from "@/lib/engine/normalize";
import type { FieldProfile } from "@/lib/engine/profile";
import { SCHEMA } from "@/lib/engine/schema";
import { titleCase } from "@/lib/format";
import DriftPanel from "./DriftPanel";
import HeaderBar from "./HeaderBar";
import MappingTable from "./MappingTable";
import PreviewPanel from "./PreviewPanel";
import SourcePanel from "./SourcePanel";

export type ListWithKeys = ListInfo & { keyCandidates?: string[] };

export interface SourceDetail {
  info: { id: string; fileName: string; format: "json" | "csv" };
  recordsPath: string | null;
  recordCount: number;
  sourceGeneratedAt: string | null;
  profiles: FieldProfile[];
  sampleRecords: Record<string, unknown>[];
  lists?: ListWithKeys[];
}

export type RowChip = "suggested" | "needs-review";

const buildDraftConfig = (companyId: string, detail: SourceDetail): CompanyConfig => ({
  config_version: 0,
  company_id: companyId,
  company_name: titleCase(companyId),
  updated_at: "",
  source: {
    format: detail.info.format,
    ...(detail.recordsPath ? { records_path: detail.recordsPath } : {}),
  },
  mappings: {},
});

export default function MapperScreen({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<SourceDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [config, setConfig] = useState<CompanyConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState<RunResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [rowStatus, setRowStatus] = useState<Record<string, RowChip>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 5000);
  }, []);

  // Initial load: source profile + saved config (or a fresh draft).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const detailRes = await fetch(`/api/sources/${companyId}`);
      const detailJson = await detailRes.json();
      if (cancelled) return;
      if (!detailRes.ok) {
        setLoadError(detailJson.error ?? "Could not read the source file");
        return;
      }
      setDetail(detailJson);

      const configRes = await fetch(`/api/configs/${companyId}`);
      if (cancelled) return;
      if (configRes.ok) {
        setConfig((await configRes.json()).config);
      } else {
        setConfig(buildDraftConfig(companyId, detailJson));
        setDirty(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  // THE loop: any config change → debounced normalize with the inline draft.
  // A monotonic sequence discards out-of-order responses — the debounce only
  // cancels pending timers, not in-flight fetches.
  const previewSeq = useRef(0);
  useEffect(() => {
    if (!config) return;
    const timer = setTimeout(async () => {
      const seq = ++previewSeq.current;
      try {
        const res = await fetch("/api/normalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceId: companyId, config }),
        });
        const json = await res.json();
        if (seq !== previewSeq.current) return; // stale response
        if (res.ok) {
          setPreview(json);
          setPreviewError(null);
        } else {
          setPreviewError(json.error ?? "Preview failed");
        }
      } catch (e) {
        if (seq !== previewSeq.current) return;
        setPreviewError(e instanceof Error ? e.message : String(e));
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [config, companyId]);

  const updateSource = useCallback((next: SourceSpec) => {
    setConfig((current) => (current ? { ...current, source: next } : current));
    setDirty(true);
  }, []);

  const updateRule = useCallback((fieldKey: string, rule: MappingRule | null) => {
    setConfig((current) => {
      if (!current) return current;
      const mappings = { ...current.mappings };
      if (rule === null) delete mappings[fieldKey];
      else mappings[fieldKey] = rule;
      return { ...current, mappings };
    });
    setRowStatus((current) => {
      if (!(fieldKey in current)) return current;
      const next = { ...current };
      delete next[fieldKey];
      return next;
    });
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    if (!config) return;
    setBusy("save");
    try {
      const res = await fetch(`/api/configs/${companyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const json = await res.json();
      if (res.ok) {
        setConfig(json.config);
        setDirty(false);
        setRowStatus({}); // Save confirms all suggestions
        showNotice(`Saved as v${json.config.config_version}`);
      } else {
        showNotice(`Save failed: ${json.error}`);
      }
    } finally {
      setBusy(null);
    }
  }, [config, companyId, showNotice]);

  const exportRun = useCallback(async () => {
    setBusy("export");
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, sourceId: companyId }),
      });
      const json = await res.json();
      if (res.ok) {
        const s = json.summary;
        showNotice(`Exported ${s.total} records (${s.clean} clean) → ${json.outputPath}`);
      } else {
        showNotice(`Export failed: ${json.error}`);
      }
    } finally {
      setBusy(null);
    }
  }, [companyId, showNotice]);

  const suggest = useCallback(async () => {
    if (!config) return;
    setBusy("suggest");
    try {
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Full draft source spec, so suggestions see merged/concat'd lists.
        body: JSON.stringify({ sourceId: companyId, source: config.source }),
      });
      const json = await res.json();
      if (!res.ok) {
        showNotice(`Suggest failed: ${json.error ?? res.statusText}`);
        return;
      }
      const suggested = json.mappings as Record<string, MappingRule>;
      const confidence = (json.confidence ?? {}) as Record<string, "high" | "low">;
      const added: Record<string, RowChip> = {};
      setConfig((current) => {
        if (!current) return current;
        const mappings = { ...current.mappings };
        for (const [key, rule] of Object.entries(suggested)) {
          if (mappings[key]) continue; // never clobber the specialist's work
          mappings[key] = rule;
          added[key] = confidence[key] === "low" ? "needs-review" : "suggested";
        }
        return { ...current, mappings };
      });
      setRowStatus((current) => ({ ...added, ...current }));
      setDirty(true);
      const n = Object.keys(added).length;
      showNotice(
        n === 0
          ? "No new suggestions — every suggested field is already mapped"
          : `Drafted ${n} mapping${n === 1 ? "" : "s"} (${json.provider}) — review the highlighted rows, then Save to confirm`,
      );
    } finally {
      setBusy(null);
    }
  }, [config, companyId, showNotice]);

  const resetMapping = useCallback(async () => {
    if (!detail) return;
    if (
      !window.confirm(
        "Delete the saved mapping and start over?\n\nThe raw file and cached extractions are kept. This can't be undone.",
      )
    ) {
      return;
    }
    setBusy("reset");
    try {
      const res = await fetch(`/api/configs/${companyId}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        showNotice(`Reset failed: ${json.error ?? res.statusText}`);
        return;
      }
      setConfig(buildDraftConfig(companyId, detail));
      setRowStatus({});
      setDirty(true);
      showNotice("Mapping deleted — you're on a fresh draft");
    } finally {
      setBusy(null);
    }
  }, [companyId, detail, showNotice]);

  const removeCompany = useCallback(async () => {
    if (
      !window.confirm(
        `Delete ${config?.company_name ?? companyId} entirely?\n\nRemoves the raw file, the saved mapping, and matching cached extractions. This can't be undone.`,
      )
    ) {
      return;
    }
    setBusy("delete");
    try {
      const res = await fetch(`/api/sources/${companyId}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        showNotice(`Delete failed: ${json.error ?? res.statusText}`);
        setBusy(null);
        return;
      }
      router.push("/");
      router.refresh();
    } catch (e) {
      showNotice(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }, [companyId, config, router, showNotice]);

  const requiredProgress = useMemo(() => {
    const required = SCHEMA.filter((f) => f.required && !f.derived);
    const mapped = required.filter((f) => config?.mappings[f.key]);
    return { mapped: mapped.length, total: required.length };
  }, [config]);

  // Live profiles/lists come from the preview (they reflect the DRAFT list
  // config); the mount-time detail is the pre-preview fallback. keyCandidates
  // only exist on the detail payload, so they're grafted onto preview lists.
  const profiles = preview?.sourceProfiles ?? detail?.profiles ?? [];
  const lists: ListWithKeys[] = useMemo(() => {
    const base = preview?.lists ?? detail?.lists ?? [];
    return base.map((list) => ({
      ...list,
      keyCandidates:
        detail?.lists?.find((d) => d.path === list.path)?.keyCandidates ?? [],
    }));
  }, [preview, detail]);

  if (loadError) {
    return (
      <div className="p-10 text-sm text-rose-700">
        Could not open this source: {loadError}
      </div>
    );
  }
  if (!config || !detail) {
    return <div className="p-10 text-sm text-slate-500">Loading source and config…</div>;
  }

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <HeaderBar
        config={config}
        detail={detail}
        summary={preview?.envelope.summary ?? null}
        requiredProgress={requiredProgress}
        dirty={dirty}
        busy={busy}
        onSave={save}
        onExport={exportRun}
        onSuggest={suggest}
      />

      {notice && (
        <div className="border-b border-slate-200 bg-slate-900 px-4 py-1.5 text-xs text-slate-100">
          {notice}
        </div>
      )}
      {preview && preview.envelope.config_warnings.length > 0 && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-800">
          Config warnings: {preview.envelope.config_warnings.join(" · ")}
        </div>
      )}
      {previewError && (
        <div className="border-b border-rose-200 bg-rose-50 px-4 py-1.5 text-xs text-rose-800">
          Preview failed: {previewError}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <SourcePanel
          profiles={profiles}
          recordCount={preview?.envelope.summary.total ?? detail.recordCount}
          lists={lists}
          source={config.source}
          onUpdateSource={updateSource}
        />
        <div className="min-w-0 flex-1 overflow-y-auto">
          <MappingTable
            config={config}
            profiles={profiles}
            preview={preview}
            rowStatus={rowStatus}
            onUpdateRule={updateRule}
          />
        </div>
      </div>

      <PreviewPanel
        preview={preview}
        config={config}
        driftPanel={preview ? <DriftPanel drift={preview.drift} /> : null}
        onResetMapping={resetMapping}
        onDeleteCompany={removeCompany}
      />
    </div>
  );
}
