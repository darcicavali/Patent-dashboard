# Sloan Patent Portfolio Dashboard — Build Specification

## Project Overview

Internal patent portfolio dashboard for Sloan Valve Company. Displays ~2,500 patents (active, pending, expired, abandoned) across US and 30+ foreign jurisdictions spanning 1906–present. Deployed on Vercel, used by 3–5 people (IP manager + engineering team).

---

## Data Sources (Priority Order)

### 1. Curated XLSX (`patent-list.xlsx`) — HIGHEST AUTHORITY
- **Rows 1–135:** Active/pending US patents (102 granted, 30 pending, 3 with lowercase "granted")
- **Rows 138+:** Foreign counterparts (~307 entries, 31 jurisdictions) — NOT updated in 2+ years
- **Columns:** IP Status, Country, Title, Filing Date, Patent/Publication No., Issue Date, Expiration Date, Model, Product Line, Google Patents link
- **This file is the authority** for: product line, model, technology mapping, and status of active/pending US patents
- **Product Lines in XLSX:** Flushometer (45), Faucet (15), Fixture (15), IOT (11), Sink (9), Sloan Water Technology (7), Others (4), Foundry (3), Sink/IOT (1), Hand dryer (1)
- **36 unique Model values** including specific product codes (EBF815, EFX-2xx), product families (Crown, Uppercut, TRF), and "No product"

### 2. Google Patents CSV (`ranked_patents2.csv`) — BULK HISTORICAL DATA
- **2,488 rows / 2,453 unique patent numbers** including US grants, US publications, US designs, CA, CN, EP, AU, JP, WO, and others
- **Columns:** Patent Number, Title, Abstract, Main Text, Filing Date, Granted Date, Status, Current Assignee, Inventors, Claims, Figure URLs
- **Contains full claims text and abstracts** — eliminates need for API enrichment for initial load
- **Status values:** Active (167), Granted (406), Expired-Lifetime (399), Expired (186), Expired-Fee Related (124), Pending (91), Withdrawn (48), Ceased (36), Abandoned (36), NaN (992), Not-in-force (2), Active-Reinstated (1)
- **Assignee variations:** "Sloan Valve Co" (1472), "Sloan Valve Company" (290), "SOLAN VALVE Co" (88 — typo), plus Sloan Water Technology, Stone And Steel Systems, Arichell Technologies, Recurrent Solutions, individual inventors, and ~521 rows with non-standard/unknown assignees
- **May contain non-Sloan patents** that were pulled in from Google Patents search — must be reviewed and flagged

### 3. EPO Open Patent Services (OPS) API — FAMILY LINKING & FOREIGN STATUS
- Free, rate-limited, best-in-class for INPADOC family data
- Use for: validating family links, getting foreign counterpart statuses, legal status events
- Register at: https://developers.epo.org/

### 4. USPTO PEDS API — PROSECUTION STATUS
- Free, for pending US application tracking
- Use for: office action status, response deadlines, allowances
- Endpoint: https://ped.uspto.gov/api/

### 5. Lens.org / PatentsView — GAP FILLING (if needed)
- Citation data, CPC code enrichment, anything missing from above sources
- Free tier with API token

---

## Patent Number Normalization (CRITICAL)

Patent numbers appear in many formats across both files. A normalization function must run BEFORE any matching or deduplication.

### Observed formats in the data:
```
US grants:       "7320146", "11577284", "US 11828449 B2", "US11907242B2"
US designs:      "D644719", "D1105354", "USD844750S1"
US publications: "US20240328133A1", "US20250103607A1"
US reissues:     "RE45373"
Placeholders:    "PRO" (provisional), "ORD" (non-provisional filed), "CON" (continuation), "D" (design not yet published)
Foreign:         "AR11160881", "AU2007217354", "CN...", "EP...", "WO2024049848A1", "CA..."
```

### Normalization rules:
1. Strip all spaces, hyphens, commas
2. Uppercase everything
3. For US patents: extract the canonical number (e.g., "US11907242B2" → "US11907242", "US 11828449 B2" → "US11828449")
4. For US designs: normalize to "USD######" format (e.g., "D644719" → "USD644719", "USD844750S1" → "USD844750")
5. For US publications: keep full format "US########A1"
6. For placeholder codes (PRO, ORD, CON, D): keep as-is, flag as "number_pending" in the data model
7. For foreign patents: keep country prefix + number, strip kind codes for matching
8. Store both `raw_number` (as provided) and `normalized_number` (for matching)

### Matching logic:
- Primary match key: `normalized_number`
- Secondary match: title similarity (for linking foreign family members to US parents when no explicit link exists)
- XLSX data wins on any field conflict with CSV data

---

## Data Model

### Three-layer architecture (raw → derived → override)

```
Layer 1: RAW
  raw_xlsx_data      — original fields from patent-list.xlsx
  raw_csv_data       — original fields from ranked_patents2.csv
  raw_api_responses  — cached API responses (EPO OPS, USPTO PEDS)

Layer 2: DERIVED (computed from raw)
  normalized_number
  normalized_status
  normalized_assignee
  family_id (linking US parent to foreign members)
  expiration_date (calculated if missing)
  is_sloan_confirmed (boolean)

Layer 3: MANUAL OVERRIDES (user corrections — always win at display time)
  status_override
  product_line_override
  technology_cluster_override
  notes
  assignee_confirmed (boolean — for flagged non-standard assignees)
  exclude (boolean — for non-Sloan patents to hide)
```

### Every displayed field must be traceable:
```json
{
  "field_name": "status",
  "displayed_value": "Active",
  "source": "xlsx",
  "last_refreshed": "2026-04-10T00:00:00Z",
  "was_overridden": false
}
```

### Core patent record schema:
```json
{
  "id": "auto-generated-uuid",
  "raw_number": "US 11828449 B2",
  "normalized_number": "US11828449",
  "patent_type": "utility|design|plant|reissue|provisional|publication",
  "country": "US",
  "title": "...",
  "abstract": "...",
  "claims_text": "...",
  "filing_date": "2023-03-06",
  "grant_date": "2024-02-20",
  "publication_date": null,
  "expiration_date": "2043-03-06",
  "status": {
    "value": "active",
    "source": "xlsx",
    "last_refreshed": "2026-04-10",
    "override": null
  },
  "assignee": {
    "raw": "Sloan Valve Co",
    "normalized": "Sloan Valve Company",
    "is_confirmed_sloan": true
  },
  "inventors": ["Parthiv Amin", "Panagiotis Zosimadis"],
  "product_line": "IOT",
  "model": "No product",
  "technology_cluster": ["IoT", "Data Transmission"],
  "cpc_codes": [],
  "family_id": "FAM-00123",
  "family_members": [
    {
      "normalized_number": "EP3456789",
      "country": "EP",
      "status": "granted",
      "filing_date": "...",
      "grant_date": "..."
    }
  ],
  "google_patents_url": "...",
  "forward_citations": null,
  "notes": "",
  "data_quality_flags": []
}
```

---

## Status Normalization

| Raw value (from either source) | Normalized status | Sub-tag |
|---|---|---|
| Active, Granted, granted | **active** | — |
| Active - Reinstated | **active** | reinstated |
| Pending | **pending** | — |
| Expired | **expired** | standard |
| Expired - Lifetime | **expired** | lifetime (pre-1995 term) |
| Expired - Fee Related | **expired** | fee_lapse |
| Abandoned | **dead** | abandoned |
| Withdrawn | **dead** | withdrawn |
| Ceased | **dead** | ceased |
| Not-in-force | **dead** | not_in_force |
| NaN (no status) | **unknown** | — (flag for review) |

Placeholder patents (PRO, ORD, CON, D) → status = **pending**, sub-tag = **pre_publication**

---

## Assignee Normalization

### Known Sloan-related assignees (auto-confirm):
- "Sloan Valve Co" → "Sloan Valve Company"
- "Sloan Valve Company" → "Sloan Valve Company"
- "SOLAN VALVE Co" → "Sloan Valve Company" (typo)
- "Sloan Water Technology Ltd" → "Sloan Water Technology" (subsidiary)
- "Stone And Steel Systems LLC" (and variants) → flag as Sloan-related, confirm
- "Arichell Technologies" (and variants) → flag as Sloan-related (acquisition), confirm
- "Recurrent Solutions" (and variants) → flag as Sloan-related, confirm
- Chinese/Japanese transliterations of Sloan → flag as Sloan-related, confirm
- Individual inventor names (when patent is clearly Sloan-assigned) → flag for review

### Unknown assignees → flag for manual review:
- "Bauer Industries, Inc."
- "Midland Brake Inc" / "HALDEX MIDLAND BRAKE Corp"
- "Hewlett Packard Enterprise Development LP"
- "Tooshlights, LLC"
- "Mitsubishi Electric Corp"
- Others — require case-by-case review
- These appear in the exception report with an "approve" or "exclude" action

---

## Data Quality / Exception Report (CRITICAL — must be in MVP)

The exception report is a dedicated dashboard page showing:

### 1. Assignee Review Queue
- All patents with non-standard assignees, not yet confirmed as Sloan-related
- Action buttons: "Confirm as Sloan" / "Exclude from portfolio"

### 2. Missing Data
- Patents without expiration dates
- Patents without filing dates
- Patents with status "unknown" (NaN)
- Patents with placeholder numbers (PRO, ORD, CON, D) — these are expected but tracked

### 3. Unmatched / Orphan Records
- Foreign patents from XLSX that couldn't be linked to a US parent
- CSV entries that don't appear in XLSX and vice versa
- Duplicate detection (same patent appearing with different formatting)

### 4. Unmapped Taxonomy
- Patents without product line assignment
- Patents without technology cluster assignment

### 5. Data Freshness
- Last refresh timestamp per data source
- List of patents where API refresh failed
- Stale data flags (not refreshed in >30 days)

---

## Ingestion Pipeline

### Step 1: Load and normalize XLSX
1. Read patent-list.xlsx
2. Normalize "IP Status" (fix "granted" → "Granted")
3. Normalize patent numbers
4. Separate US patents (rows 1–135) from foreign (rows 138+)
5. Assign family IDs to US patents
6. Attempt to link foreign entries to US parents by title matching + Google Patents link

### Step 2: Load and normalize CSV
1. Read ranked_patents2.csv
2. Normalize patent numbers
3. Normalize assignee names
4. Normalize status values
5. Flag non-standard assignees for review

### Step 3: Merge
1. Match CSV records to XLSX records on normalized_number
2. For matches: XLSX fields win on conflict, CSV fills gaps (abstract, claims, inventors)
3. For CSV-only records: include as supplementary (these are mostly historical/expired)
4. For XLSX-only records: include as-is (these are the pre-publication placeholders)
5. Deduplicate: same patent appearing in both files counts once

### Step 4: Enrich via APIs (Phase 2+)
1. EPO OPS: validate/expand family links, get foreign statuses
2. USPTO PEDS: get prosecution status for pending US applications
3. Auto-discover published numbers for PRO/ORD/CON/D placeholders

### Step 5: Generate output
1. Write master JSON file (`patents.json`) — all patent records
2. Write overrides JSON file (`overrides.json`) — manual corrections
3. Write exceptions JSON file (`exceptions.json`) — flagged items for review
4. Write refresh log (`refresh_log.json`) — timestamps, errors, stale flags
5. Commit to Git repo → Vercel auto-deploys

---

## Refresh Pipeline (GitHub Actions Cron)

### Weekly refresh:
1. Re-run API queries for pending patents (status changes, new publication numbers)
2. Re-run EPO OPS for family status updates
3. Compare new data to previous snapshot
4. If API call fails: keep previous data, flag as stale — NEVER overwrite good data with failed response
5. Save dated snapshot (simple: keep last 4 weekly snapshots for diffing)
6. Commit updated JSON to repo
7. Log what changed, what failed, what's stale

### Partial refresh rules:
- If one API source fails, update the rest — don't block everything
- Flag affected records as "stale" with timestamp
- Dashboard shows a banner if any data source has failed in last refresh

---

## Dashboard UI — Phase 1 (MVP)

### Tech Stack
| Layer | Tool |
|---|---|
| Framework | Next.js (React) on Vercel |
| Search | Fuse.js (client-side fuzzy search) |
| Charts | Recharts |
| Data | Static JSON imported at build time |
| Auth | Vercel password protection or simple auth |

### Page 1: Portfolio Overview
- **Key stats cards:** Total patents, Active, Pending, Expired, Dead, Families, Jurisdictions
- **Donut chart:** Patents by status (active/pending/expired/dead)
- **Bar chart:** Patents by product line
- **Bar chart:** Patents by decade of filing (portfolio age distribution)
- **Alert banner:** Number of exception items needing review

### Page 2: Patent Table (main workhorse)
- **Filterable, sortable, searchable table** of all patents
- **Columns:** Patent Number, Title, Status, Product Line, Model, Country, Filing Date, Grant Date, Expiration Date, Inventors
- **Filters:** Status (multi-select), Product Line (multi-select), Country, Patent Type (utility/design/etc.), Date range
- **Search:** Fuse.js across title, abstract, inventors, patent number, notes
  - Search scope: title + abstract + inventors + patent number + notes/overrides (NOT claims by default — optional toggle)
- **Row click → detail view**
- **CSV/XLSX export** of current filtered view (in MVP)

### Page 3: Exception Report
- As described in Data Quality section above
- Actionable: approve/exclude buttons for assignee review
- Override forms for status, product line, notes
- Overrides saved to `overrides.json` (for MVP, this can be a manual JSON edit committed to repo; for Phase 2, a simple API endpoint)

### Page 4: Patent Detail
- All metadata fields with source attribution ("from XLSX" / "from CSV" / "API" / "manual override")
- Family members table (if available)
- Google Patents link (external)
- Claims text (collapsible)
- Abstract
- Override form: edit status, product line, technology cluster, notes

---

## Dashboard UI — Phase 2

### Expiration Timeline
- Gantt-style view of patent remaining life
- Color-coded by product line or cluster
- Highlights: expiring within 12 months (red), 24 months (yellow)
- Maintenance fee payment windows (parsed from EPO OPS legal status events)

### Family Detail View
- Select a US patent → see all family members in a table
- Country, status, filing date, grant date for each member
- SVG world map with colored dots for jurisdictions with coverage

### Prosecution Tracker (for pending patents)
- Last office action date and type
- Response deadline
- Current prosecution stage

---

## Dashboard UI — Phase 3

### Workflow Fields
- Owner assignment per patent
- Next action / deadline
- Priority flags
- Simple Kanban or task list view for pending items

---

## Dashboard UI — Phase 4

### Advanced Visualizations
- CPC treemap showing IP concentration areas
- Technology cluster network diagram
- Citation analysis (forward/backward)

### AI Claim Summaries
- Batch-process claims through Claude API
- Generate plain-English summaries of key claims
- Store as derived field (clearly labeled as AI-generated)
- Validate manually before trusting

### PDF Portfolio Export
- One-page portfolio summary for leadership/partners
- Filterable: by product line, by cluster, by status

---

## Security & Confidentiality

### Public data (from APIs / Google Patents):
- Patent numbers, titles, abstracts, claims, dates, statuses, assignees, CPC codes, family data

### Internal/confidential data (NEVER exposed publicly):
- Product line mappings
- Model assignments
- Technology cluster taxonomy
- Manual notes and override comments
- Strategy annotations
- Exception report contents

### Implementation:
- GitHub repo: **private**
- Vercel deployment: password-protected or behind Vercel Auth
- Data model: public patent metadata and internal business metadata stored in separate JSON files
- If repo is ever made public, `.gitignore` the internal files

---

## Taxonomy Governance Rules

### Product Line:
- Source: manually assigned, primarily from XLSX
- One patent = one primary product line (current values: Flushometer, Faucet, Fixture, IOT, Sink, Sloan Water Technology, Others, Foundry, Hand dryer)
- Edge case "Sink/IOT" should be resolved to primary + secondary tag

### Technology Cluster:
- Source: manually assigned
- One patent = one or more clusters (multi-tag allowed)
- Flat taxonomy (no hierarchy for now)
- Darci is sole authority on tagging
- Changes tracked via override layer with timestamps

### Model:
- Source: from XLSX
- One patent = one model value (can be "No product")

---

## Handling Incomplete Data

The UI must gracefully handle:
- Missing dates → show "—" not blank, not crash
- Unknown statuses → show "Unknown" with yellow flag
- Incomplete family links → show what's known, flag gaps
- Failed API lookups → show cached data with "stale" indicator
- Conflicting sources → show primary value with tooltip showing alternatives
- No claims text → show "Claims not available" (many older/design patents)
- No abstract → show "No abstract available"

---

## Success Criteria for MVP

Before considering Phase 1 complete:
- [ ] 95%+ of US patents from XLSX matched and enriched with CSV data
- [ ] All patents assigned to a family or flagged as unlinked
- [ ] Status logic applied consistently across all records
- [ ] Product line mapping complete for all XLSX patents
- [ ] Exception report is populated and actionable
- [ ] Search returns relevant results across title, abstract, inventors
- [ ] CSV/XLSX export works for any filtered view
- [ ] Dashboard loads in <3 seconds
- [ ] No crashes on missing/null data

---

## File Structure (Next.js Project)

```
sloan-patent-dashboard/
├── data/
│   ├── raw/
│   │   ├── patent-list.xlsx          (source file — gitignored)
│   │   └── ranked_patents2.csv       (source file — gitignored)
│   ├── processed/
│   │   ├── patents.json              (master patent records)
│   │   ├── families.json             (family groupings)
│   │   └── refresh_log.json          (refresh timestamps & errors)
│   ├── internal/                     (CONFIDENTIAL — gitignored if repo goes public)
│   │   ├── overrides.json            (manual corrections)
│   │   ├── exceptions.json           (flagged items for review)
│   │   ├── taxonomy.json             (product line + cluster mappings)
│   │   └── assignee_rules.json       (assignee normalization rules)
│   └── snapshots/                    (dated backups of processed data)
├── scripts/
│   ├── ingest.py                     (main ingestion pipeline)
│   ├── normalize.py                  (patent number normalization)
│   ├── merge.py                      (XLSX + CSV merge logic)
│   ├── enrich_epo.py                 (EPO OPS API calls)
│   ├── enrich_uspto.py               (USPTO PEDS API calls)
│   ├── export.py                     (generate processed JSONs)
│   └── refresh.py                    (weekly refresh pipeline)
├── src/
│   ├── app/                          (Next.js app router)
│   │   ├── page.tsx                  (Portfolio Overview)
│   │   ├── patents/page.tsx          (Patent Table)
│   │   ├── patents/[id]/page.tsx     (Patent Detail)
│   │   ├── exceptions/page.tsx       (Exception Report)
│   │   └── layout.tsx
│   ├── components/
│   │   ├── PatentTable.tsx
│   │   ├── SearchBar.tsx
│   │   ├── FilterPanel.tsx
│   │   ├── StatusChart.tsx
│   │   ├── ProductLineChart.tsx
│   │   ├── ExportButton.tsx
│   │   └── ...
│   └── lib/
│       ├── search.ts                 (Fuse.js config)
│       ├── types.ts                  (TypeScript interfaces)
│       └── utils.ts
├── .github/
│   └── workflows/
│       └── refresh.yml               (weekly cron job)
├── package.json
└── README.md
```

---

## Build Order

1. **Patent number normalization function** — test against all observed formats
2. **XLSX ingestion** — parse, normalize, structure
3. **CSV ingestion** — parse, normalize, flag assignees
4. **Merge logic** — deduplicate, resolve conflicts, link families
5. **Exception generation** — identify all data quality issues
6. **JSON export** — produce patents.json, exceptions.json, taxonomy.json
7. **Next.js scaffold** — pages, routing, layout
8. **Patent Table page** — filterable, sortable, searchable
9. **Portfolio Overview page** — charts and stats
10. **Exception Report page** — review queue with actions
11. **Patent Detail page** — full record with source attribution
12. **CSV/XLSX export** — from filtered table
13. **Deploy to Vercel**
14. **GitHub Actions refresh workflow**
