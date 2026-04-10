import type { StatusValue, TableRow } from "./types";

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function yearOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const y = parseInt(iso.slice(0, 4), 10);
  return Number.isNaN(y) ? null : y;
}

export function statusLabel(v: StatusValue): string {
  switch (v) {
    case "active":
      return "Active";
    case "pending":
      return "Pending";
    case "expired":
      return "Expired";
    case "dead":
      return "Dead";
    default:
      return "Unknown";
  }
}

export function statusPillClass(v: StatusValue): string {
  return `status-pill status-${v}`;
}

export function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/**
 * Build a CSV string from table rows. Values containing commas, quotes, or
 * newlines are quoted and internal quotes doubled. Triggers a browser
 * download via a temporary <a> tag.
 */
export function downloadCsv(filename: string, rows: TableRow[]): void {
  const headers = [
    "id",
    "patent_number",
    "title",
    "status",
    "sub_status",
    "country",
    "type",
    "product_line",
    "model",
    "filing_date",
    "grant_date",
    "expiration_date",
    "inventors",
    "assignee",
    "confirmed_sloan",
    "family_id",
    "flags",
  ];

  const esc = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = Array.isArray(v) ? v.join("; ") : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.normalized_number,
        r.title,
        r.status,
        r.status_sub_tag,
        r.country,
        r.patent_type,
        r.product_line,
        r.model,
        r.filing_date,
        r.grant_date,
        r.expiration_date,
        r.inventors,
        r.assignee,
        r.is_confirmed_sloan,
        r.family_id,
        r.flags,
      ]
        .map(esc)
        .join(","),
    );
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
