"""
ingest_xlsx.py — Load and normalize patent-list.xlsx.

The XLSX is the authoritative source for:
  - IP status of active/pending US patents
  - Product line assignments
  - Model assignments
  - Technology mapping context

Structure of the file:
  Rows 0–134   : 135 US patents
  Rows 135–136 : blank separator rows (dropped)
  Rows 137+    : ~307 foreign counterparts across 30+ jurisdictions

Column name quirk: the source column is "Product Line " with a trailing
space. We strip column whitespace before using it.
"""

from __future__ import annotations

import math
from datetime import date, datetime
from pathlib import Path
from typing import Optional

import pandas as pd

from normalize import normalize_patent_number, normalize_status


XLSX_PATH = Path(__file__).resolve().parent.parent / "data" / "raw" / "patent-list.xlsx"


def _to_iso_date(value) -> Optional[str]:
    """Return a YYYY-MM-DD string or None for blank/unparseable values."""
    if value is None:
        return None
    # pd.NaT registers as a datetime subclass but can't be formatted, so
    # check it explicitly before any isinstance checks.
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(value, float) and math.isnan(value):
        return None
    if isinstance(value, (datetime, date)):
        return value.strftime("%Y-%m-%d")
    try:
        parsed = pd.to_datetime(value, errors="coerce")
        if pd.isna(parsed):
            return None
        return parsed.strftime("%Y-%m-%d")
    except Exception:
        return None


def _clean_str(value) -> Optional[str]:
    """Trim whitespace and treat NaN/NaT/None/empty as None."""
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


def load_xlsx(path: Path = XLSX_PATH) -> list[dict]:
    """
    Read patent-list.xlsx and return a list of raw+normalized patent records.

    Each record has the shape consumed by merge.py:

        {
          "source": "xlsx",
          "row_index": int,
          "section": "us" | "foreign",
          "raw": {...original column values...},
          "normalized_number": str | None,
          "country": str,
          "patent_type": str,
          "is_placeholder": bool,
          "status": {"value": ..., "sub_tag": ..., "raw": ...},
          "title": str | None,
          "filing_date": str | None,
          "grant_date": str | None,
          "expiration_date": str | None,
          "model": str | None,
          "product_line": str | None,
          "google_patents_link": str | None,
          "data_quality_flags": [...],
        }
    """
    df = pd.read_excel(path, header=0)
    df.columns = [c.strip() for c in df.columns]

    records: list[dict] = []

    for idx, row in df.iterrows():
        country_raw = _clean_str(row.get("Country"))
        status_raw = _clean_str(row.get("IP Status"))
        title      = _clean_str(row.get("Title"))
        raw_number = _clean_str(row.get("Patent/Publication No."))

        # Skip the two fully-blank separator rows between US and foreign sections.
        if country_raw is None and status_raw is None and title is None and raw_number is None:
            continue

        # Pass the XLSX country column in as a hint so bare-numeric foreign
        # patents (e.g. AE "5452", MX "50429") don't fall back to "US".
        normalized = normalize_patent_number(raw_number, country_hint=country_raw)
        country = country_raw or normalized.get("country")

        if country and country != "US" and raw_number and not normalized["normalized_number"]:
            # Fallback: synthesize a key from anything alphanumeric in the raw
            # value so we never drop a foreign row silently.
            synthetic = f"{country}{''.join(ch for ch in raw_number.upper() if ch.isalnum())}"
            normalized["normalized_number"] = synthetic
            normalized["country"] = country
            normalized["patent_type"] = "foreign"

        status = normalize_status(status_raw, is_placeholder=normalized["is_placeholder"])

        flags: list[str] = []
        if normalized["is_placeholder"]:
            flags.append("placeholder_number")
        if status["value"] == "unknown":
            flags.append("unknown_status")
        if _to_iso_date(row.get("Filing Date")) is None:
            flags.append("missing_filing_date")
        if _to_iso_date(row.get("Expiration Date")) is None and status["value"] in ("active", "pending"):
            flags.append("missing_expiration_date")

        records.append({
            "source": "xlsx",
            "row_index": int(idx),
            "section": "us" if country == "US" else "foreign",
            "raw": {
                "IP Status": status_raw,
                "Country": country_raw,
                "Title": title,
                "Filing Date": _to_iso_date(row.get("Filing Date")),
                "Patent/Publication No.": raw_number,
                "Issue Date": _to_iso_date(row.get("Issue Date")),
                "Expiration Date": _to_iso_date(row.get("Expiration Date")),
                "Model": _clean_str(row.get("Model")),
                "Product Line": _clean_str(row.get("Product Line")),
                "link": _clean_str(row.get("link")),
            },
            "normalized_number": normalized["normalized_number"],
            "country": country,
            "patent_type": normalized["patent_type"],
            "is_placeholder": normalized["is_placeholder"],
            "status": status,
            "title": title,
            "filing_date":     _to_iso_date(row.get("Filing Date")),
            "grant_date":      _to_iso_date(row.get("Issue Date")),
            "expiration_date": _to_iso_date(row.get("Expiration Date")),
            "model":          _clean_str(row.get("Model")),
            "product_line":   _clean_str(row.get("Product Line")),
            "google_patents_link": _clean_str(row.get("link")),
            "data_quality_flags": flags,
        })

    return records


def summarize(records: list[dict]) -> dict:
    """Small summary used for the refresh log."""
    us = [r for r in records if r["section"] == "us"]
    foreign = [r for r in records if r["section"] == "foreign"]
    return {
        "total_rows":        len(records),
        "us_rows":           len(us),
        "foreign_rows":      len(foreign),
        "placeholder_rows":  sum(1 for r in records if r["is_placeholder"]),
        "unknown_status":    sum(1 for r in records if r["status"]["value"] == "unknown"),
        "missing_numbers":   sum(1 for r in records if r["normalized_number"] is None),
        "countries":         sorted({r["country"] for r in records if r["country"]}),
    }


if __name__ == "__main__":
    import json
    records = load_xlsx()
    print(json.dumps(summarize(records), indent=2))
    print(f"\nFirst record:")
    print(json.dumps(records[0], indent=2, default=str))
