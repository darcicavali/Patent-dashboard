import Link from "next/link";

import { getExceptions } from "@/lib/data";
import type { ThinPatent } from "@/lib/types";
import { statusLabel, statusPillClass } from "@/lib/utils";

export const metadata = {
  title: "Exception Report — Sloan Patent Dashboard",
};

export default function ExceptionsPage() {
  const report = getExceptions();
  const s = report.summary;

  const sections: Array<{
    id: string;
    title: string;
    description: string;
    count: number;
    rows: ThinPatent[];
  }> = [
    {
      id: "assignee-review",
      title: "Assignee review queue",
      description:
        "Records whose assignee normalization is ambiguous or unconfirmed.",
      count: s.assignee_review,
      rows: report.assignee_review_queue,
    },
    {
      id: "missing-expiration",
      title: "Missing expiration date",
      description: "Active or pending patents without a computed expiration.",
      count: s.missing_expiration,
      rows: report.missing_data.missing_expiration_date,
    },
    {
      id: "missing-filing",
      title: "Missing filing date",
      description: "Records without any filing date on file.",
      count: s.missing_filing,
      rows: report.missing_data.missing_filing_date,
    },
    {
      id: "unknown-status",
      title: "Unknown status",
      description: "Records whose status could not be inferred from sources.",
      count: s.unknown_status,
      rows: report.missing_data.unknown_status,
    },
    {
      id: "placeholder",
      title: "Placeholder patent numbers",
      description:
        "Records that came in with PRO/ORD/CON or similar placeholders — need a real number.",
      count: s.placeholder_number,
      rows: report.missing_data.placeholder_number,
    },
    {
      id: "foreign-orphans",
      title: "Foreign orphans",
      description:
        "Foreign filings that could not be linked to a US parent by title or shared data.",
      count: s.foreign_orphans,
      rows: report.unmatched_orphans.foreign_without_us_parent,
    },
    {
      id: "csv-only-non-sloan",
      title: "CSV-only · non-Sloan",
      description:
        "Records present only in ranked_patents2.csv with a non-Sloan assignee — likely noise to prune.",
      count: s.csv_only_non_sloan,
      rows: report.unmatched_orphans.csv_only_non_sloan,
    },
    {
      id: "csv-only-historical",
      title: "CSV-only · historical",
      description:
        "Older CSV-only records with no XLSX counterpart. May be legitimately historical.",
      count: s.csv_only_historical,
      rows: report.unmatched_orphans.csv_only_historical,
    },
    {
      id: "xlsx-only",
      title: "XLSX-only",
      description:
        "Current-portfolio records that were not matched in the CSV extract.",
      count: s.xlsx_only,
      rows: report.unmatched_orphans.xlsx_only,
    },
    {
      id: "missing-product-line",
      title: "Missing product line",
      description: "Records with no product line assignment.",
      count: s.missing_product_line,
      rows: report.unmapped_taxonomy.missing_product_line,
    },
    {
      id: "missing-tech-cluster",
      title: "Missing technology cluster",
      description: "Records with no technology cluster tag.",
      count: s.missing_tech_cluster,
      rows: report.unmapped_taxonomy.missing_technology_cluster,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Exception Report
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Generated {new Date(report.generated_at).toLocaleString()}
        </p>
      </div>

      {/* Jump list / summary */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-semibold text-slate-700">Summary</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {sections.map((sec) => (
            <a
              key={sec.id}
              href={`#${sec.id}`}
              className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm hover:border-sloan-500 hover:bg-sloan-50"
            >
              <span className="text-slate-700">{sec.title}</span>
              <span
                className={
                  sec.count > 0
                    ? "font-semibold text-amber-700"
                    : "font-semibold text-green-700"
                }
              >
                {sec.count.toLocaleString()}
              </span>
            </a>
          ))}
          <a
            href="#oversized-families"
            className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm hover:border-sloan-500 hover:bg-sloan-50"
          >
            <span className="text-slate-700">Oversized families</span>
            <span
              className={
                s.oversized_families > 0
                  ? "font-semibold text-amber-700"
                  : "font-semibold text-green-700"
              }
            >
              {s.oversized_families.toLocaleString()}
            </span>
          </a>
        </div>
      </div>

      {/* Data freshness */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-semibold text-slate-700">
          Data freshness
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <FreshnessItem
            label="XLSX source"
            iso={report.data_freshness.last_refresh_xlsx}
          />
          <FreshnessItem
            label="CSV source"
            iso={report.data_freshness.last_refresh_csv}
          />
          <FreshnessItem
            label="EPO"
            iso={report.data_freshness.last_refresh_epo}
          />
          <FreshnessItem
            label="USPTO"
            iso={report.data_freshness.last_refresh_uspto}
          />
        </div>
        {report.data_freshness.stale_sources.length > 0 && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Stale:{" "}
            <span className="font-semibold">
              {report.data_freshness.stale_sources.join(", ")}
            </span>
          </div>
        )}
      </div>

      {/* Exception sections */}
      {sections.map((sec) => (
        <ExceptionSection key={sec.id} {...sec} />
      ))}

      {/* Oversized families */}
      <section
        id="oversized-families"
        className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">
            Oversized families
          </h2>
          <span className="text-sm text-slate-500">
            {report.oversized_families.length.toLocaleString()} entries
          </span>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Title-linked families with more than 20 members — usually a signal
          that the title is too generic and needs manual splitting.
        </p>
        {report.oversized_families.length === 0 ? (
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            None — no families need manual splitting.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Family</th>
                  <th className="px-3 py-2 text-left font-medium">
                    Parent title
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Members</th>
                  <th className="px-3 py-2 text-left font-medium">Countries</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.oversized_families.map((f) => (
                  <tr key={f.family_id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-700">
                      {f.family_id}
                    </td>
                    <td className="px-3 py-2 text-slate-800">
                      {f.parent_title ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {f.member_count}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {f.countries.join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// --------------------------------------------------------------------------- //

function ExceptionSection({
  id,
  title,
  description,
  count,
  rows,
}: {
  id: string;
  title: string;
  description: string;
  count: number;
  rows: ThinPatent[];
}) {
  const PREVIEW = 100;
  const truncated = rows.length > PREVIEW;
  const preview = rows.slice(0, PREVIEW);

  return (
    <section
      id={id}
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-800">{title}</h2>
        <span
          className={
            count > 0
              ? "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800"
              : "rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800"
          }
        >
          {count.toLocaleString()}
        </span>
      </div>
      <p className="mb-3 text-xs text-slate-500">{description}</p>

      {rows.length === 0 ? (
        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          No items in this category — all clear.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Number</th>
                  <th className="px-3 py-2 text-left font-medium">Title</th>
                  <th className="px-3 py-2 text-left font-medium">Country</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Assignee</th>
                  <th className="px-3 py-2 text-left font-medium">
                    Product line
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                      <Link
                        href={`/patents/${r.id}`}
                        className="text-sloan-600 hover:underline"
                      >
                        {r.normalized_number ?? r.raw_number ?? "—"}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-800">
                      <Link
                        href={`/patents/${r.id}`}
                        className="hover:underline"
                      >
                        {r.title ?? "—"}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {r.country ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span className={statusPillClass(r.status)}>
                        {statusLabel(r.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {r.assignee ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {r.product_line ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {r.flags.length > 0 ? (
                        <span className="font-mono text-xs text-slate-500">
                          {r.flags.slice(0, 3).join(", ")}
                          {r.flags.length > 3 && ` +${r.flags.length - 3}`}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {truncated && (
            <div className="mt-2 text-xs text-slate-500">
              Showing first {PREVIEW} of {rows.length.toLocaleString()}.
            </div>
          )}
        </>
      )}
    </section>
  );
}

function FreshnessItem({
  label,
  iso,
}: {
  label: string;
  iso: string | null;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-sm text-slate-800">
        {iso ? new Date(iso).toLocaleDateString() : "never"}
      </div>
    </div>
  );
}
