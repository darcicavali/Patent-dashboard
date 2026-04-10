# Sloan Patent Portfolio Dashboard

Internal patent portfolio dashboard for Sloan Valve Company. This repository
holds the data pipeline that turns `patent-list.xlsx` and `ranked_patents2.csv`
into the JSON files the dashboard reads.

Phase 1 of the build is currently only the **data pipeline** (steps 1–6 of
the spec). The Next.js dashboard (steps 7+) comes next.

---

## What's in this folder

```
Patent-dashboard/
├── data/
│   ├── raw/                       <- the two source files live here
│   │   ├── patent-list.xlsx
│   │   └── ranked_patents2.csv
│   ├── processed/                 <- generated output (safe to commit)
│   │   ├── patents.json             master patent records
│   │   ├── families.json            family groupings
│   │   └── refresh_log.json         stats + timestamps for each run
│   ├── internal/                  <- confidential business metadata
│   │   ├── exceptions.json          data-quality review queue
│   │   ├── overrides.json           manual corrections (starts empty)
│   │   ├── taxonomy.json            product-line / model catalog
│   │   └── assignee_rules.json      documentation of current rules
│   └── snapshots/                 <- reserved for weekly backups
├── scripts/
│   ├── normalize.py    — patent number / status / assignee normalization
│   ├── ingest_xlsx.py  — reads patent-list.xlsx
│   ├── ingest_csv.py   — reads ranked_patents2.csv
│   ├── merge.py        — combines both sources + links families
│   ├── exceptions.py   — builds the data-quality review queue
│   └── ingest.py       — main entry point (runs everything)
├── requirements.txt
├── sloan-patent-dashboard-spec.md   <- the full build spec
└── README.md                        <- this file
```

---

## How to run the pipeline (first time)

You need Python 3.10+ installed. That is the only requirement.

### 1. Install the two libraries the pipeline uses

Open a terminal in this folder and run:

```
pip install -r requirements.txt
```

This installs `pandas` (reads tabular data) and `openpyxl` (reads .xlsx
files). It's a one-time step.

### 2. Run the pipeline

```
python3 scripts/ingest.py
```

You will see progress printed to the screen, ending with a list of the JSON
files that were written. The whole run takes about 4 seconds.

### 3. That's it

Every file in `data/processed/` and `data/internal/` has been refreshed.
The Next.js dashboard will read them directly.

---

## How to re-run after you edit the XLSX

When you add, remove, or change patents in `patent-list.xlsx`:

1. Save the file into `data/raw/patent-list.xlsx` (overwrite the old one).
2. Run `python3 scripts/ingest.py` again.
3. Commit the updated JSON files to git.

The pipeline is fully deterministic — running it twice on the same input
produces the same output, and every patent keeps the same stable `id` across
runs so any manual overrides in `overrides.json` stay attached.

---

## What each output file is for

### `data/processed/patents.json`
The master list. Every row from either source file becomes one record here
(deduplicated). Each field carries its source:

```json
{
  "id": "c2a2f280-2271-5a8a-bd77-b524a169c645",
  "normalized_number": "US7320146",
  "title":        { "value": "Sensor Plate...", "source": "xlsx" },
  "abstract":     { "value": "An manual activation...", "source": "csv" },
  "status":       { "value": "active", "source": "xlsx" },
  "product_line": { "value": "Flushometer", "source": "xlsx" },
  ...
}
```

### `data/processed/families.json`
Grouping of patents into families (a US parent + its foreign counterparts).
US patents get family IDs `FAM-00001`, `FAM-00002`, … and XLSX-curated
foreign rows are linked to their US parent by title match.

### `data/processed/refresh_log.json`
Stats from the last pipeline run: total rows, match rates, timings, and a
list of any errors. This is what powers the "last refreshed" banner on the
dashboard.

### `data/internal/exceptions.json`
The Exception Report for the dashboard's review queue. Categories:

- **assignee_review** — CSV rows whose assignee doesn't match a known Sloan
  pattern (confirm or exclude each one).
- **missing_expiration / missing_filing / unknown_status** — records that
  need a date or status filled in.
- **placeholder_number** — pre-publication entries (PRO/ORD/CON/D) that
  still need their real number once they publish.
- **foreign_orphans** — foreign records that couldn't be linked to a US
  parent.
- **csv_only_non_sloan** — non-Sloan patents the CSV pulled in by accident.
- **csv_only_historical** — historical Sloan patents in CSV that aren't in
  the XLSX (mostly expired).
- **xlsx_only** — newer XLSX patents the CSV snapshot doesn't have yet.
- **missing_product_line / missing_technology_cluster** — records that need
  taxonomy tags.
- **oversized_families** — families with too many members, usually because
  a generic title ("Faucet", "Flush Valve") over-collected. Should be
  reviewed by hand.

### `data/internal/overrides.json`
Manual corrections. Starts empty. Once the dashboard UI is built, the
override form on each patent's detail page will append to this file.

### `data/internal/taxonomy.json`
Auto-seeded from the XLSX Product Line and Model columns. This is the
canonical list of product lines, models, and technology clusters. Edit by
hand to rename, merge, or add aliases — the dashboard reads it directly.

### `data/internal/assignee_rules.json`
A human-readable snapshot of which assignee strings the pipeline currently
treats as Sloan-related. For reference only — to change the rules, edit
`scripts/normalize.py` and re-run the pipeline.

---

## What the current run produces

As of the latest run against `patent-list.xlsx` (442 rows) and
`ranked_patents2.csv` (2,488 rows):

- **1,920 unified patent records**
- **180** matched between XLSX and CSV (fully enriched with abstract / claims / inventors)
- **261** XLSX-only (newer patents not yet in the CSV snapshot)
- **1,479** CSV-only (mostly historical / expired)
- **1,640 families**, 58 with more than one member
- **91 placeholder numbers** (PRO/ORD/CON/D) awaiting publication
- **254 assignees** flagged for Sloan/non-Sloan review

All of these counts are also written to `data/processed/refresh_log.json`.

---

## Running the normalizer self-test

If you ever need to sanity-check the patent number normalization logic
against known formats:

```
python3 scripts/normalize.py
```

This runs a built-in suite of 57 test cases covering every format observed
in both source files (US grants, designs, reissues, publications, placeholders,
foreign numbers with and without kind codes, etc.).

---

## Next steps (still to come)

Steps 7–14 of the build order, per the spec:

7. Next.js scaffold
8. Patent Table page
9. Portfolio Overview page
10. Exception Report page
11. Patent Detail page
12. CSV/XLSX export
13. Deploy to Vercel
14. Weekly refresh GitHub Action
