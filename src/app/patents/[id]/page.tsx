import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getFamilies,
  getPatentById,
  getAllPatents,
} from "@/lib/data";
import { formatDate, statusLabel, statusPillClass } from "@/lib/utils";
import type { Attributed, Patent } from "@/lib/types";

interface Props {
  params: { id: string };
}

export default function PatentDetailPage({ params }: Props) {
  const patent = getPatentById(params.id);
  if (!patent) return notFound();

  const families = getFamilies();
  const family = patent.family_id ? families[patent.family_id] : null;

  // Pull full records for family siblings so we can link + show status.
  const allPatents = getAllPatents();
  const siblings: Patent[] = family
    ? family.member_ids
        .filter((mid) => mid !== patent.id)
        .map((mid) => allPatents.find((p) => p.id === mid))
        .filter((p): p is Patent => Boolean(p))
    : [];

  const googleUrl =
    patent.google_patents_url.value ??
    (patent.normalized_number
      ? `https://patents.google.com/patent/${encodeURIComponent(
          patent.normalized_number,
        )}`
      : null);

  return (
    <div className="space-y-6">
      {/* --- Header --- */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Link href="/patents" className="hover:underline">
              ← All patents
            </Link>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            {patent.title.value ?? "(untitled)"}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span className="font-mono">
              {patent.normalized_number ?? patent.raw_number ?? "—"}
            </span>
            <span className={statusPillClass(patent.status.value)}>
              {statusLabel(patent.status.value)}
              {patent.status.sub_tag ? ` · ${patent.status.sub_tag}` : ""}
            </span>
            {patent.is_placeholder && (
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                placeholder
              </span>
            )}
          </div>
        </div>
        {googleUrl && (
          <a
            href={googleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="self-start rounded-md border border-sloan-600 bg-white px-3 py-1.5 text-sm font-medium text-sloan-700 hover:bg-sloan-50"
          >
            View on Google Patents ↗
          </a>
        )}
      </div>

      {/* --- Metadata grid --- */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card title="Dates">
          <Field
            label="Filing date"
            attr={patent.filing_date}
            format={formatDate}
          />
          <Field
            label="Grant date"
            attr={patent.grant_date}
            format={formatDate}
          />
          <Field
            label="Publication date"
            attr={patent.publication_date}
            format={formatDate}
          />
          <Field
            label="Expiration date"
            attr={patent.expiration_date}
            format={formatDate}
          />
        </Card>

        <Card title="Classification">
          <Field label="Country" value={patent.country} />
          <Field label="Type" value={patent.patent_type} />
          <Field
            label="Product line"
            attr={patent.product_line}
            value={patent.product_line.value}
          />
          <Field label="Model" attr={patent.model} value={patent.model.value} />
          {patent.technology_cluster.value.length > 0 && (
            <Field
              label="Technology cluster"
              value={patent.technology_cluster.value.join(", ")}
              source={patent.technology_cluster.source}
            />
          )}
          {patent.cpc_codes.value.length > 0 && (
            <Field
              label="CPC codes"
              value={patent.cpc_codes.value.join(", ")}
              source={patent.cpc_codes.source}
            />
          )}
        </Card>

        <Card title="Assignee">
          <Field
            label="Normalized"
            value={patent.assignee.normalized ?? "—"}
            source={patent.assignee.source}
          />
          <Field label="Raw value" value={patent.assignee.raw ?? "—"} />
          <div className="flex flex-wrap gap-2 pt-2">
            {patent.assignee.is_confirmed_sloan && (
              <span className="rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-xs text-green-800">
                confirmed Sloan
              </span>
            )}
            {patent.assignee.needs_review && (
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                needs review
              </span>
            )}
          </div>
        </Card>

        <Card title="Inventors">
          {patent.inventors.value.length > 0 ? (
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-700">
              {patent.inventors.value.map((inv, i) => (
                <li key={i}>{inv}</li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-slate-500">None recorded.</div>
          )}
          <div className="mt-2 text-xs text-slate-400">
            source: {patent.inventors.source}
          </div>
        </Card>
      </div>

      {/* --- Abstract --- */}
      {patent.abstract.value && (
        <Card title="Abstract">
          <details>
            <summary className="cursor-pointer text-sm text-sloan-700 hover:underline">
              Show / hide
            </summary>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {patent.abstract.value}
            </p>
            <div className="mt-2 text-xs text-slate-400">
              source: {patent.abstract.source}
            </div>
          </details>
        </Card>
      )}

      {/* --- Claims --- */}
      {patent.claims_text.value && (
        <Card title="Claims">
          <details>
            <summary className="cursor-pointer text-sm text-sloan-700 hover:underline">
              Show / hide
            </summary>
            <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">
              {patent.claims_text.value}
            </pre>
            <div className="mt-2 text-xs text-slate-400">
              source: {patent.claims_text.source}
            </div>
          </details>
        </Card>
      )}

      {/* --- Family --- */}
      {family && (
        <Card
          title={`Family (${family.member_ids.length} member${
            family.member_ids.length === 1 ? "" : "s"
          })`}
        >
          <div className="mb-2 text-xs text-slate-500">
            Family ID <span className="font-mono">{family.family_id}</span>
            {family.oversized && (
              <span className="ml-2 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-800">
                oversized — needs manual review
              </span>
            )}
          </div>
          {siblings.length === 0 ? (
            <div className="text-sm text-slate-500">
              This patent is the only member of its family.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Number</th>
                    <th className="px-3 py-2 text-left font-medium">Title</th>
                    <th className="px-3 py-2 text-left font-medium">Country</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium">Filed</th>
                    <th className="px-3 py-2 text-left font-medium">Granted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {siblings.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                        <Link
                          href={`/patents/${s.id}`}
                          className="text-sloan-600 hover:underline"
                        >
                          {s.normalized_number ?? s.raw_number ?? "—"}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        <Link
                          href={`/patents/${s.id}`}
                          className="hover:underline"
                        >
                          {s.title.value ?? "—"}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {s.country ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span className={statusPillClass(s.status.value)}>
                          {statusLabel(s.status.value)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                        {formatDate(s.filing_date.value)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                        {formatDate(s.grant_date.value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* --- Flags --- */}
      {patent.data_quality_flags.length > 0 && (
        <Card title="Data quality flags">
          <div className="flex flex-wrap gap-2">
            {patent.data_quality_flags.map((f) => (
              <span
                key={f}
                className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 font-mono text-xs text-slate-700"
              >
                {f}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* --- Raw sources footer --- */}
      <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        Last refreshed {formatDate(patent.last_refreshed.slice(0, 10))} · Status
        last checked{" "}
        {formatDate(patent.status.last_refreshed.slice(0, 10))}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- //

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">{title}</h2>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  attr,
  source,
  format,
}: {
  label: string;
  value?: string | null;
  attr?: Attributed<string | null>;
  source?: string;
  format?: (v: string | null | undefined) => string;
}) {
  const raw = value !== undefined ? value : attr ? attr.value : null;
  const display = format ? format(raw) : raw ?? "—";
  const src = source ?? attr?.source;
  const overridden = attr?.was_overridden;
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-right text-slate-800">
        {display}
        {src && (
          <span className="ml-2 text-xs text-slate-400">({src})</span>
        )}
        {overridden && (
          <span className="ml-1 text-xs text-amber-600">override</span>
        )}
      </span>
    </div>
  );
}
