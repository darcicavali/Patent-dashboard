"""
ingest.py — Main ingestion pipeline entry point.

Runs the full data pipeline (steps 1–6 of the build order) and writes:

    data/processed/patents.json        — master patent records
    data/processed/families.json       — family groupings
    data/processed/refresh_log.json    — run stats, row counts, timings
    data/internal/exceptions.json      — data-quality review queue
    data/internal/overrides.json       — created if missing (empty template)
    data/internal/taxonomy.json        — created if missing (seeded from XLSX)
    data/internal/assignee_rules.json  — documentation of current rules

Run:
    python3 scripts/ingest.py
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path

from ingest_xlsx import load_xlsx, summarize as xlsx_summary
from ingest_csv  import load_csv,  summarize as csv_summary
from merge       import merge
from exceptions  import build_exceptions


ROOT           = Path(__file__).resolve().parent.parent
PROCESSED_DIR  = ROOT / "data" / "processed"
INTERNAL_DIR   = ROOT / "data" / "internal"
SNAPSHOT_DIR   = ROOT / "data" / "snapshots"


def _write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False, default=str)


def _strip_internals(patent: dict) -> dict:
    """Remove pipeline bookkeeping fields before export."""
    clean = dict(patent)
    clean.pop("_sources", None)
    clean.pop("_xlsx_row_index", None)
    clean.pop("_csv_row_index", None)
    return clean


def _seed_taxonomy(patents: list[dict]) -> dict:
    """
    Build a starting taxonomy.json by collecting every product-line and model
    value observed in the XLSX. The IP manager edits this file directly to
    canonicalize the taxonomy.
    """
    product_lines: dict[str, int] = {}
    models: dict[str, int] = {}
    for p in patents:
        pl = p["product_line"]["value"]
        if pl:
            product_lines[pl] = product_lines.get(pl, 0) + 1
        m = p["model"]["value"]
        if m:
            models[m] = models.get(m, 0) + 1

    return {
        "product_lines": sorted(
            [{"name": k, "count": v, "aliases": []} for k, v in product_lines.items()],
            key=lambda x: -x["count"],
        ),
        "models": sorted(
            [{"name": k, "count": v, "product_line": None} for k, v in models.items()],
            key=lambda x: -x["count"],
        ),
        "technology_clusters": [],
    }


def _seed_overrides() -> dict:
    return {
        "overrides": [],
        "schema": {
            "id":               "UUID of the patent being overridden",
            "field":            "status | product_line | technology_cluster | assignee_confirmed | exclude | notes",
            "value":            "new value (type depends on field)",
            "reason":           "why the override was applied",
            "applied_by":       "username",
            "applied_at":       "ISO timestamp",
        },
    }


def _assignee_rules_doc() -> dict:
    """Snapshot of the current assignee rules for audit/tuning."""
    from normalize import _ASSIGNEE_RULES, _KNOWN_NON_SLOAN
    return {
        "sloan_rules": [
            {"pattern": p.pattern, "normalized": canonical, "is_confirmed_sloan": is_sloan}
            for (p, canonical, is_sloan) in _ASSIGNEE_RULES
        ],
        "known_non_sloan": sorted(_KNOWN_NON_SLOAN),
        "note": (
            "Edit scripts/normalize.py to adjust these rules. After editing, "
            "re-run `python3 scripts/ingest.py` to regenerate all outputs."
        ),
    }


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #


def main() -> None:
    started = time.time()
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    print("Step 1/2: loading XLSX...")
    t0 = time.time()
    xlsx_records = load_xlsx()
    xlsx_stats = xlsx_summary(xlsx_records)
    print(f"  {xlsx_stats['total_rows']} rows "
          f"({xlsx_stats['us_rows']} US, {xlsx_stats['foreign_rows']} foreign, "
          f"{xlsx_stats['placeholder_rows']} placeholders) "
          f"in {time.time()-t0:.1f}s")

    print("Step 2/2: loading CSV...")
    t0 = time.time()
    csv_records = load_csv()
    csv_stats = csv_summary(csv_records)
    print(f"  {csv_stats['total_rows']} rows "
          f"({csv_stats['unique_normalized']} unique numbers, "
          f"{csv_stats['confirmed_sloan']} confirmed Sloan, "
          f"{csv_stats['needs_assignee_review']} flagged) "
          f"in {time.time()-t0:.1f}s")

    print("Step 3: merging...")
    t0 = time.time()
    merged = merge(xlsx_records, csv_records)
    print(f"  {merged['stats']['total_patents']} unified records "
          f"({merged['stats']['matched_xlsx_and_csv']} matched, "
          f"{merged['stats']['xlsx_only']} xlsx-only, "
          f"{merged['stats']['csv_only']} csv-only) "
          f"across {merged['stats']['families']} families "
          f"in {time.time()-t0:.1f}s")

    print("Step 4: building exception report...")
    t0 = time.time()
    exceptions_payload = build_exceptions(merged["patents"], merged["families"])
    summary = exceptions_payload["summary"]
    print(f"  assignee_review={summary['assignee_review']}  "
          f"missing_expiry={summary['missing_expiration']}  "
          f"unknown_status={summary['unknown_status']}  "
          f"csv_only_non_sloan={summary['csv_only_non_sloan']}  "
          f"in {time.time()-t0:.1f}s")

    print("Step 5: writing JSON outputs...")
    patents_export = [_strip_internals(p) for p in merged["patents"]]
    _write_json(PROCESSED_DIR / "patents.json",  patents_export)
    _write_json(PROCESSED_DIR / "families.json", merged["families"])
    _write_json(INTERNAL_DIR  / "exceptions.json", exceptions_payload)

    # Seed files that must exist for the UI but should not be overwritten
    # once the user has added content to them.
    taxonomy_path  = INTERNAL_DIR / "taxonomy.json"
    overrides_path = INTERNAL_DIR / "overrides.json"
    if not taxonomy_path.exists():
        _write_json(taxonomy_path, _seed_taxonomy(merged["patents"]))
        print(f"  seeded {taxonomy_path.relative_to(ROOT)}")
    if not overrides_path.exists():
        _write_json(overrides_path, _seed_overrides())
        print(f"  seeded {overrides_path.relative_to(ROOT)}")
    _write_json(INTERNAL_DIR / "assignee_rules.json", _assignee_rules_doc())

    # Refresh log is always overwritten with the latest run
    refresh_log = {
        "last_run": now_iso,
        "duration_seconds": round(time.time() - started, 2),
        "xlsx": xlsx_stats,
        "csv":  csv_stats,
        "merge": merged["stats"],
        "exceptions_summary": summary,
        "errors": [],
    }
    _write_json(PROCESSED_DIR / "refresh_log.json", refresh_log)

    print(f"\nDone in {time.time()-started:.1f}s")
    print(f"Wrote: {PROCESSED_DIR / 'patents.json'}")
    print(f"Wrote: {PROCESSED_DIR / 'families.json'}")
    print(f"Wrote: {PROCESSED_DIR / 'refresh_log.json'}")
    print(f"Wrote: {INTERNAL_DIR / 'exceptions.json'}")
    print(f"Wrote: {INTERNAL_DIR / 'taxonomy.json'}")
    print(f"Wrote: {INTERNAL_DIR / 'overrides.json'}")
    print(f"Wrote: {INTERNAL_DIR / 'assignee_rules.json'}")


if __name__ == "__main__":
    main()
