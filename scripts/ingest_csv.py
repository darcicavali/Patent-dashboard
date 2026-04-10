"""
ingest_csv.py — Load and normalize ranked_patents2.csv.

The CSV is the bulk historical source pulled from Google Patents. It fills
in fields the XLSX doesn't carry (abstract, claims, inventors) and supplies
hundreds of expired/historical records the XLSX no longer tracks.

The CSV contains many non-Sloan rows that were pulled in by a search query,
so every record gets flagged with whether its assignee is confirmed Sloan.
"""

from __future__ import annotations

import math
from datetime import date, datetime
from pathlib import Path
from typing import Optional

import pandas as pd

from normalize import normalize_patent_number, normalize_status, normalize_assignee


CSV_PATH = Path(__file__).resolve().parent.parent / "data" / "raw" / "ranked_patents2.csv"


def _clean_str(value) -> Optional[str]:
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(value, float) and math.isnan(value):
        return None
    text = str(value).strip()
    if not text or text.lower() in ("nan", "nat", "none"):
        return None
    return text


def _to_iso_date(value) -> Optional[str]:
    """Parse the CSV's M/D/YYYY dates into ISO format."""
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(value, (datetime, date)):
        return value.strftime("%Y-%m-%d")
    try:
        parsed = pd.to_datetime(value, errors="coerce")
        if pd.isna(parsed):
            return None
        return parsed.strftime("%Y-%m-%d")
    except Exception:
        return None


def _split_inventors(raw: Optional[str]) -> list[str]:
    """CSV inventors are comma-separated; split and trim."""
    if not raw:
        return []
    return [name.strip() for name in raw.split(",") if name.strip()]


def load_csv(path: Path = CSV_PATH) -> list[dict]:
    """Return a list of normalized CSV records for the merge step."""
    df = pd.read_csv(path, low_memory=False)
    df.columns = [c.strip() for c in df.columns]

    records: list[dict] = []

    for idx, row in df.iterrows():
        raw_number = _clean_str(row.get("Patent Number"))
        if raw_number is None:
            # No identifier at all — skip; nothing downstream can match on it.
            continue

        normalized = normalize_patent_number(raw_number)
        status_raw = _clean_str(row.get("Status"))
        status = normalize_status(status_raw, is_placeholder=normalized["is_placeholder"])
        assignee = normalize_assignee(_clean_str(row.get("Current Assignee")))

        flags: list[str] = []
        if normalized["normalized_number"] is None:
            flags.append("unparseable_number")
        if assignee["needs_review"]:
            flags.append("assignee_needs_review")
        if status["value"] == "unknown":
            flags.append("unknown_status")

        records.append({
            "source": "csv",
            "row_index": int(idx),
            "raw": {
                "Patent Number":   raw_number,
                "Title":            _clean_str(row.get("Title")),
                "Abstract":         _clean_str(row.get("Abstract")),
                "Main Text":        _clean_str(row.get("Main Text")),
                "Filing Date":      _to_iso_date(row.get("Filing Date")),
                "Granted Date":     _to_iso_date(row.get("Granted Date")),
                "Status":           status_raw,
                "Current Assignee": _clean_str(row.get("Current Assignee")),
                "Inventors":        _clean_str(row.get("Inventors")),
                "Claims":           _clean_str(row.get("Claims")),
                "Figure URLs":      _clean_str(row.get("Figure URLs")),
            },
            "normalized_number": normalized["normalized_number"],
            "country":            normalized["country"],
            "patent_type":        normalized["patent_type"],
            "is_placeholder":     normalized["is_placeholder"],
            "status":             status,
            "assignee":           assignee,
            "title":              _clean_str(row.get("Title")),
            "abstract":           _clean_str(row.get("Abstract")),
            "claims_text":        _clean_str(row.get("Claims")),
            "filing_date":        _to_iso_date(row.get("Filing Date")),
            "grant_date":         _to_iso_date(row.get("Granted Date")),
            "inventors":          _split_inventors(_clean_str(row.get("Inventors"))),
            "data_quality_flags": flags,
        })

    return records


def summarize(records: list[dict]) -> dict:
    """Small summary used for the refresh log."""
    by_country: dict[str, int] = {}
    for r in records:
        c = r["country"] or "UNKNOWN"
        by_country[c] = by_country.get(c, 0) + 1

    return {
        "total_rows":              len(records),
        "unique_normalized":       len({r["normalized_number"] for r in records if r["normalized_number"]}),
        "unparseable_numbers":     sum(1 for r in records if r["normalized_number"] is None),
        "confirmed_sloan":         sum(1 for r in records if r["assignee"]["is_confirmed_sloan"]),
        "needs_assignee_review":   sum(1 for r in records if r["assignee"]["needs_review"]),
        "unknown_status":          sum(1 for r in records if r["status"]["value"] == "unknown"),
        "by_country_top10":        dict(sorted(by_country.items(), key=lambda kv: -kv[1])[:10]),
    }


if __name__ == "__main__":
    import json
    records = load_csv()
    print(json.dumps(summarize(records), indent=2))
    print("\nFirst record:")
    print(json.dumps(records[0], indent=2, default=str))
