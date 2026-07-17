import Link from "next/link";
import DeleteCompanyButton from "@/components/DeleteCompanyButton";
import UploadCard from "@/components/UploadCard";
import { loadRecords } from "@/lib/engine/loaders";
import { listSourceFiles, readConfig, readRawFile } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export default async function Home() {
  const companies = listSourceFiles().map((info) => {
    const config = readConfig(info.id);
    let recordCount: number | null = null;
    if (config) {
      try {
        recordCount = loadRecords(readRawFile(info.id).text, config.source).records.length;
      } catch {
        recordCount = null;
      }
    }
    return { info, config, recordCount };
  });

  return (
    <main className="mx-auto max-w-4xl p-10">
      <h1 className="text-2xl font-semibold tracking-tight">Pave Integration Mapper</h1>
      <p className="mt-1 text-sm text-slate-500">
        Pick a company to inspect its raw HR export, define mappings to the standard schema, and
        preview the normalized output — or upload a new export to onboard a new company.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {companies.map(({ info, config, recordCount }) => (
          <Link
            key={info.id}
            href={`/mapper/${info.id}`}
            className="group relative rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-400 hover:shadow"
          >
            <DeleteCompanyButton
              companyId={info.id}
              companyName={config?.company_name ?? info.id}
            />
            <div className="text-base font-semibold group-hover:text-slate-900">
              {config?.company_name ?? info.id}
            </div>
            <div className="mt-1 font-mono text-xs text-slate-500">{info.fileName}</div>
            <div className="mt-4 flex items-center gap-2 text-xs">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono uppercase text-slate-600">
                {info.format}
              </span>
              {recordCount !== null && (
                <span className="text-slate-500">{recordCount} records</span>
              )}
              {config ? (
                <span className="ml-auto rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700">
                  config v{config.config_version}
                </span>
              ) : (
                <span className="ml-auto rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700">
                  not mapped yet
                </span>
              )}
            </div>
          </Link>
        ))}
        <UploadCard />
      </div>
    </main>
  );
}
