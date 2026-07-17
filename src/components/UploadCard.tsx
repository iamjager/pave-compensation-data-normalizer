"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { titleCase } from "@/lib/format";

/**
 * Self-serve onboarding: drop (or browse) a raw HR export and land straight
 * in the mapper. Uploading a file for an already-mapped company offers to
 * replace it — deliberately the drift-repair flow: the saved config is kept
 * and the next preview reports whatever changed.
 */
export default function UploadCard() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const upload = async (file: File, overwrite = false): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/sources${overwrite ? "?overwrite=1" : ""}`, {
        method: "POST",
        body,
      });
      const json = await res.json();
      if (res.status === 409 && json.conflict) {
        const replace = window.confirm(
          `${titleCase(json.id)} already exists.\n\nReplace its raw file? The saved mapping is kept — the preview will show anything that changed in the new export.`,
        );
        if (replace) return upload(file, true);
        return;
      }
      if (!res.ok) {
        setError(json.error ?? "Upload failed");
        return;
      }
      router.push(`/mapper/${json.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file && !busy) void upload(file);
  };

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onFiles(e.dataTransfer.files);
      }}
      className={`flex min-h-32 flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 text-center transition ${
        dragOver
          ? "border-slate-500 bg-slate-100"
          : "border-slate-300 bg-white/60 hover:border-slate-400 hover:bg-white"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".json,.csv"
        className="hidden"
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = ""; // allow re-selecting the same file
        }}
      />
      <div className="text-base font-semibold text-slate-700">＋ Onboard a new company</div>
      <div className="mt-1 text-xs text-slate-500">
        {busy ? "Uploading…" : "Drop a .json or .csv export here, or click to browse"}
      </div>
      {error && <div className="mt-2 text-xs font-medium text-rose-600">{error}</div>}
    </button>
  );
}
