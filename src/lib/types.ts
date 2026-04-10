// Shape of records produced by scripts/ingest.py.
// Every displayable field is wrapped in an Attributed<T> so the UI can show
// "source: xlsx" / "source: csv" / "source: manual" / etc.

export type FieldSource = "xlsx" | "csv" | "api" | "manual";

export interface Attributed<T> {
  value: T;
  source: FieldSource;
  was_overridden: boolean;
}

export type StatusValue = "active" | "pending" | "expired" | "dead" | "unknown";

export interface PatentStatus {
  value: StatusValue;
  sub_tag: string | null;
  source: FieldSource;
  raw_xlsx: string | null;
  raw_csv: string | null;
  last_refreshed: string;
  override: string | null;
}

export interface Assignee {
  raw: string | null;
  normalized: string | null;
  is_confirmed_sloan: boolean;
  needs_review: boolean;
  source: FieldSource;
}

export interface FamilyMemberSummary {
  normalized_number: string | null;
  country: string | null;
  status: StatusValue;
  filing_date: string | null;
  grant_date: string | null;
}

export interface Patent {
  id: string;
  raw_number: string | null;
  normalized_number: string | null;
  patent_type: string;
  country: string | null;
  is_placeholder: boolean;
  title: Attributed<string | null>;
  abstract: Attributed<string | null>;
  claims_text: Attributed<string | null>;
  filing_date: Attributed<string | null>;
  grant_date: Attributed<string | null>;
  publication_date: Attributed<string | null>;
  expiration_date: Attributed<string | null>;
  status: PatentStatus;
  assignee: Assignee;
  inventors: Attributed<string[]>;
  product_line: Attributed<string | null>;
  model: Attributed<string | null>;
  technology_cluster: Attributed<string[]>;
  cpc_codes: Attributed<string[]>;
  family_id: string | null;
  family_members: FamilyMemberSummary[];
  google_patents_url: Attributed<string | null>;
  forward_citations: Attributed<unknown>;
  notes: Attributed<string>;
  data_quality_flags: string[];
  last_refreshed: string;
}

export interface Family {
  family_id: string;
  parent_id: string;
  parent_number: string | null;
  parent_title: string | null;
  member_ids: string[];
  countries: string[];
  orphan?: boolean;
  oversized?: boolean;
}

export interface RefreshLog {
  last_run: string;
  duration_seconds: number;
  xlsx: Record<string, unknown>;
  csv: Record<string, unknown>;
  merge: Record<string, unknown>;
  exceptions_summary: Record<string, number>;
  errors: string[];
}

export interface ExceptionSummary {
  assignee_review: number;
  missing_expiration: number;
  missing_filing: number;
  unknown_status: number;
  placeholder_number: number;
  foreign_orphans: number;
  csv_only_non_sloan: number;
  csv_only_historical: number;
  xlsx_only: number;
  missing_product_line: number;
  missing_tech_cluster: number;
  oversized_families: number;
}

export interface ThinPatent {
  id: string;
  normalized_number: string | null;
  raw_number: string | null;
  title: string | null;
  country: string | null;
  status: StatusValue;
  status_sub_tag: string | null;
  assignee: string | null;
  product_line: string | null;
  family_id: string | null;
  flags: string[];
}

export interface ExceptionReport {
  generated_at: string;
  summary: ExceptionSummary;
  assignee_review_queue: ThinPatent[];
  missing_data: {
    missing_expiration_date: ThinPatent[];
    missing_filing_date: ThinPatent[];
    unknown_status: ThinPatent[];
    placeholder_number: ThinPatent[];
  };
  unmatched_orphans: {
    foreign_without_us_parent: ThinPatent[];
    csv_only_non_sloan: ThinPatent[];
    csv_only_historical: ThinPatent[];
    xlsx_only: ThinPatent[];
  };
  unmapped_taxonomy: {
    missing_product_line: ThinPatent[];
    missing_technology_cluster: ThinPatent[];
  };
  oversized_families: Array<{
    family_id: string;
    parent_title: string | null;
    member_count: number;
    countries: string[];
  }>;
  data_freshness: {
    last_refresh_xlsx: string | null;
    last_refresh_csv: string | null;
    last_refresh_epo: string | null;
    last_refresh_uspto: string | null;
    stale_sources: string[];
  };
}

// Compact row shape sent to the client table — omits abstract/claims/main_text
// to keep the client bundle reasonable.
export interface TableRow {
  id: string;
  normalized_number: string | null;
  raw_number: string | null;
  title: string | null;
  status: StatusValue;
  status_sub_tag: string | null;
  country: string | null;
  patent_type: string;
  product_line: string | null;
  model: string | null;
  filing_date: string | null;
  grant_date: string | null;
  expiration_date: string | null;
  inventors: string[];
  assignee: string | null;
  is_confirmed_sloan: boolean;
  is_placeholder: boolean;
  family_id: string | null;
  flags: string[];
}
