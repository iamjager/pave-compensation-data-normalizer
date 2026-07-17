"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Card-corner delete: removes the raw file, saved mapping, and matching cached extractions. */
export default function DeleteCompanyButton({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onDelete = async (e: React.MouseEvent) => {
    // The button lives inside the card's <Link> — don't navigate.
    e.preventDefault();
    e.stopPropagation();
    if (
      !window.confirm(
        `Delete ${companyName}?\n\nRemoves its raw file, saved mapping, and matching cached extractions. This can't be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/sources/${companyId}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        window.alert(`Delete failed: ${json.error ?? res.statusText}`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={busy}
      title={`Delete ${companyName}`}
      className="absolute right-2 top-2 hidden h-6 w-6 items-center justify-center rounded-md text-slate-300 hover:bg-rose-50 hover:text-rose-600 group-hover:flex"
    >
      ✕
    </button>
  );
}
