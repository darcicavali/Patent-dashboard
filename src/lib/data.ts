import "server-only";

import patentsJson from "@data/processed/patents.json";
import familiesJson from "@data/processed/families.json";
import refreshLogJson from "@data/processed/refresh_log.json";
import exceptionsJson from "@data/internal/exceptions.json";
import taxonomyJson from "@data/internal/taxonomy.json";

import type {
  ExceptionReport,
  Family,
  Patent,
  RefreshLog,
  TableRow,
} from "./types";

// Module-level caches (Next.js re-uses imported JSON across requests).
const patents = patentsJson as unknown as Patent[];
const families = familiesJson as unknown as Record<string, Family>;
const refreshLog = refreshLogJson as unknown as RefreshLog;
const exceptions = exceptionsJson as unknown as ExceptionReport;
const taxonomy = taxonomyJson as unknown as {
  product_lines: Array<{ name: string; count: number; aliases: string[] }>;
  models: Array<{ name: string; count: number; product_line: string | null }>;
  technology_clusters: unknown[];
};

export function getAllPatents(): Patent[] {
  return patents;
}

export function getFamilies(): Record<string, Family> {
  return families;
}

export function getRefreshLog(): RefreshLog {
  return refreshLog;
}

export function getExceptions(): ExceptionReport {
  return exceptions;
}

export function getTaxonomy() {
  return taxonomy;
}

export function getPatentById(id: string): Patent | null {
  return patents.find((p) => p.id === id) ?? null;
}

/**
 * Trimmed rows the client table needs. Dropping abstract / claims_text /
 * main_text keeps this payload to a few MB instead of ~10 MB.
 */
export function getTableRows(): TableRow[] {
  return patents.map<TableRow>((p) => ({
    id: p.id,
    normalized_number: p.normalized_number,
    raw_number: p.raw_number,
    title: p.title.value,
    status: p.status.value,
    status_sub_tag: p.status.sub_tag,
    country: p.country,
    patent_type: p.patent_type,
    product_line: p.product_line.value,
    model: p.model.value,
    filing_date: p.filing_date.value,
    grant_date: p.grant_date.value,
    expiration_date: p.expiration_date.value,
    inventors: p.inventors.value ?? [],
    assignee: p.assignee.normalized,
    is_confirmed_sloan: p.assignee.is_confirmed_sloan,
    is_placeholder: p.is_placeholder,
    family_id: p.family_id,
    flags: p.data_quality_flags,
  }));
}

// ---------- Overview stats (Portfolio home page) -------------------------- //

export interface OverviewStats {
  total: number;
  byStatus: Record<string, number>;
  byProductLine: Array<{ name: string; count: number }>;
  byDecade: Array<{ decade: string; count: number }>;
  byCountry: Array<{ country: string; count: number }>;
  familyCount: number;
  jurisdictionCount: number;
  exceptionCount: number;
  lastRefresh: string;
  confirmedSloan: number;
  matchRate: {
    matched: number;
    xlsxOnly: number;
    csvOnly: number;
  };
}

export function getOverviewStats(): OverviewStats {
  const byStatus: Record<string, number> = {};
  const byProductLine = new Map<string, number>();
  const byDecade = new Map<string, number>();
  const byCountry = new Map<string, number>();
  let confirmedSloan = 0;

  for (const p of patents) {
    byStatus[p.status.value] = (byStatus[p.status.value] ?? 0) + 1;

    const pl = p.product_line.value ?? "(unmapped)";
    byProductLine.set(pl, (byProductLine.get(pl) ?? 0) + 1);

    const c = p.country ?? "(unknown)";
    byCountry.set(c, (byCountry.get(c) ?? 0) + 1);

    if (p.assignee.is_confirmed_sloan) confirmedSloan++;

    const fd = p.filing_date.value;
    if (fd) {
      const year = parseInt(fd.slice(0, 4), 10);
      if (!Number.isNaN(year)) {
        const decade = `${Math.floor(year / 10) * 10}s`;
        byDecade.set(decade, (byDecade.get(decade) ?? 0) + 1);
      }
    }
  }

  // A rough sense of the merge shape; more detail in refresh_log.json.
  const mergeStats = refreshLog.merge as Record<string, number>;

  const exSummary = exceptions.summary;
  const exceptionCount =
    exSummary.assignee_review +
    exSummary.missing_expiration +
    exSummary.unknown_status +
    exSummary.foreign_orphans +
    exSummary.csv_only_non_sloan +
    exSummary.oversized_families;

  return {
    total: patents.length,
    byStatus,
    byProductLine: Array.from(byProductLine.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    byDecade: Array.from(byDecade.entries())
      .map(([decade, count]) => ({ decade, count }))
      .sort((a, b) => a.decade.localeCompare(b.decade)),
    byCountry: Array.from(byCountry.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count),
    familyCount: Object.keys(families).length,
    jurisdictionCount: new Set(
      patents.map((p) => p.country).filter(Boolean) as string[],
    ).size,
    exceptionCount,
    lastRefresh: refreshLog.last_run,
    confirmedSloan,
    matchRate: {
      matched: Number(mergeStats?.matched_xlsx_and_csv ?? 0),
      xlsxOnly: Number(mergeStats?.xlsx_only ?? 0),
      csvOnly: Number(mergeStats?.csv_only ?? 0),
    },
  };
}
