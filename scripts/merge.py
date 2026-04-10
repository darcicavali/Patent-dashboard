"""
merge.py — Merge XLSX + CSV records into unified patent records.

Rules (per the build spec):
  1. Match CSV ↔ XLSX on normalized_number.
  2. On any field conflict, XLSX wins.
  3. CSV fills gaps the XLSX doesn't carry: abstract, claims, inventors.
  4. CSV-only records are kept as supplementary (mostly historical / expired).
  5. XLSX-only records are kept as-is (includes pre-publication placeholders).
  6. Same patent in both files counts once.
  7. Every displayed field is traceable to its source.

Family logic:
  - Each US patent (utility/design/reissue/publication/placeholder) seeds a
    family with id FAM-00001, FAM-00002, …
  - Foreign XLSX rows attempt to link to a US parent by title match.
  - Any foreign row that can't be linked keeps its own orphan family.
"""

from __future__ import annotations

import hashlib
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Optional


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def _title_key(title: Optional[str]) -> Optional[str]:
    """Lowercase + strip punctuation — used for fuzzy title-based matching."""
    if not title:
        return None
    normalized = re.sub(r"[^a-z0-9 ]+", " ", title.lower())
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized or None


def _attributed(value: Any, source: str) -> dict:
    """Wrap a field value in its provenance record."""
    return {
        "value": value,
        "source": source,
        "was_overridden": False,
    }


def _pick(primary, fallback, primary_source: str, fallback_source: str) -> dict:
    """Prefer primary; fall back to secondary. Track provenance."""
    if primary not in (None, "", []):
        return _attributed(primary, primary_source)
    return _attributed(fallback, fallback_source)


def _stable_id(normalized_number: Optional[str], fallback_seed: str) -> str:
    """
    Deterministic UUID so re-running the pipeline produces stable IDs
    (important for the manual overrides layer — IDs must survive re-ingests).
    """
    seed = normalized_number or fallback_seed
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"sloan-patent://{seed}"))


def _absorb_csv_duplicate(kept: dict, dup: dict) -> None:
    """
    Merge a duplicate CSV row into an existing one.

    Two CSV rows with the same normalized_number are the same patent; the
    second is usually a different kind-code publication of the first. Fill
    any empty fields on `kept` with values from `dup`, and prefer whichever
    copy has a non-unknown status.
    """
    # Prefer non-unknown statuses
    if kept["status"]["value"] == "unknown" and dup["status"]["value"] != "unknown":
        kept["status"] = dup["status"]

    # Prefer confirmed-Sloan assignee
    if not kept["assignee"]["is_confirmed_sloan"] and dup["assignee"]["is_confirmed_sloan"]:
        kept["assignee"] = dup["assignee"]

    # Fill any None/empty textual fields
    for field in ("title", "abstract", "claims_text", "filing_date", "grant_date"):
        if not kept.get(field) and dup.get(field):
            kept[field] = dup[field]

    # Union inventors while preserving order
    for inv in dup.get("inventors") or []:
        if inv not in (kept.get("inventors") or []):
            kept.setdefault("inventors", []).append(inv)


# --------------------------------------------------------------------------- #
# Core merge
# --------------------------------------------------------------------------- #


def merge(xlsx_records: list[dict], csv_records: list[dict]) -> dict:
    """
    Merge both sources into unified patent records + family groupings.

    Returns:
        {
          "patents":  [ ... core patent records ... ],
          "families": { "FAM-00001": { ... }, ... },
          "stats":    { "matched": int, "xlsx_only": int, "csv_only": int, ... }
        }
    """
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # First pass: collapse CSV duplicates. Two CSV rows with the same
    # normalized_number are the same patent published under different kind
    # codes (e.g. "CN1876976A" + "CN1876976B"). Merge their metadata so we
    # don't emit the same patent twice downstream.
    csv_by_norm: dict[str, dict] = {}
    csv_no_key: list[dict] = []
    for rec in csv_records:
        key = rec["normalized_number"]
        if key is None:
            csv_no_key.append(rec)
            continue
        if key not in csv_by_norm:
            csv_by_norm[key] = rec
        else:
            _absorb_csv_duplicate(csv_by_norm[key], rec)

    consumed_csv_keys: set[str] = set()
    patents: list[dict] = []

    # ---- 1. Walk XLSX rows first (authoritative) ------------------------- #
    # Also collapse XLSX duplicates (e.g. two foreign rows with the same
    # normalized number) so each patent only appears once.
    xlsx_by_norm: dict[str, dict] = {}
    xlsx_orphans: list[dict] = []
    for xrec in xlsx_records:
        key = xrec["normalized_number"]
        if key is None:
            xlsx_orphans.append(xrec)
        elif key not in xlsx_by_norm:
            xlsx_by_norm[key] = xrec
        # Secondary XLSX rows with the same key are dropped (rare).

    for norm, xrec in xlsx_by_norm.items():
        crec = csv_by_norm.get(norm)
        if crec is not None:
            consumed_csv_keys.add(norm)
        patents.append(_build_patent(xrec, crec, now))

    # Placeholder XLSX rows (PRO/ORD/CON/D, no normalized_number) are unique
    # per row and can never match CSV, so emit them individually.
    for xrec in xlsx_orphans:
        patents.append(_build_patent(xrec, None, now))

    # ---- 2. CSV-only records (anything not consumed above) --------------- #
    for norm, crec in csv_by_norm.items():
        if norm in consumed_csv_keys:
            continue
        patents.append(_build_patent(None, crec, now))

    # CSV rows with unparseable patent numbers — still emit so they appear in
    # the exception report.
    for crec in csv_no_key:
        patents.append(_build_patent(None, crec, now))

    # ---- 3. Assign family IDs -------------------------------------------- #
    families = _build_families(patents)

    stats = {
        "total_patents":            len(patents),
        "matched_xlsx_and_csv":     sum(1 for p in patents if p["_sources"] == {"xlsx", "csv"}),
        "xlsx_only":                sum(1 for p in patents if p["_sources"] == {"xlsx"}),
        "csv_only":                 sum(1 for p in patents if p["_sources"] == {"csv"}),
        "families":                 len(families),
        "us_records":               sum(1 for p in patents if p["country"] == "US"),
        "foreign_records":          sum(1 for p in patents if p["country"] not in (None, "US")),
        "confirmed_sloan":          sum(1 for p in patents if p["assignee"]["is_confirmed_sloan"]),
    }

    return {"patents": patents, "families": families, "stats": stats, "generated_at": now}


# --------------------------------------------------------------------------- #
# Patent record construction
# --------------------------------------------------------------------------- #


def _build_patent(xrec: Optional[dict], crec: Optional[dict], now: str) -> dict:
    """
    Produce a unified patent record with per-field source attribution.

    Exactly one of xrec / crec may be None (for source-only records).
    """
    assert xrec is not None or crec is not None

    # Prefer XLSX identifiers; fall back to CSV.
    normalized_number = (xrec or {}).get("normalized_number") or (crec or {}).get("normalized_number")
    raw_number_primary = (xrec or {}).get("raw", {}).get("Patent/Publication No.") \
        or (crec or {}).get("raw", {}).get("Patent Number")

    country       = (xrec or {}).get("country") or (crec or {}).get("country")
    patent_type   = (xrec or {}).get("patent_type") or (crec or {}).get("patent_type") or "unknown"
    is_placeholder = bool((xrec or {}).get("is_placeholder") or (crec or {}).get("is_placeholder"))

    # Status: XLSX wins; keep unknowns from XLSX instead of silently replacing.
    if xrec and xrec["status"]["value"] != "unknown":
        status = {
            "value":          xrec["status"]["value"],
            "sub_tag":        xrec["status"]["sub_tag"],
            "source":         "xlsx",
            "raw_xlsx":       xrec["status"]["raw"],
            "raw_csv":        (crec["status"]["raw"] if crec else None),
            "last_refreshed": now,
            "override":       None,
        }
    elif crec:
        status = {
            "value":          crec["status"]["value"],
            "sub_tag":        crec["status"]["sub_tag"],
            "source":         "csv",
            "raw_xlsx":       (xrec["status"]["raw"] if xrec else None),
            "raw_csv":        crec["status"]["raw"],
            "last_refreshed": now,
            "override":       None,
        }
    else:
        status = {
            "value": "unknown", "sub_tag": None, "source": "xlsx",
            "raw_xlsx": (xrec["status"]["raw"] if xrec else None),
            "raw_csv": None, "last_refreshed": now, "override": None,
        }

    # Assignee: only CSV carries an assignee. XLSX is implicitly Sloan for
    # curated rows, so when only XLSX data is present we assume Sloan.
    if crec:
        assignee = {
            "raw":                 crec["assignee"]["raw"],
            "normalized":          crec["assignee"]["normalized"] or "Sloan Valve Company" if xrec else crec["assignee"]["normalized"],
            "is_confirmed_sloan":  crec["assignee"]["is_confirmed_sloan"] or bool(xrec),
            "needs_review":        crec["assignee"]["needs_review"] and not bool(xrec),
            "source":              "csv",
        }
    else:
        assignee = {
            "raw":                None,
            "normalized":         "Sloan Valve Company",
            "is_confirmed_sloan": True,
            "needs_review":       False,
            "source":             "xlsx",
        }

    title           = _pick((xrec or {}).get("title"),           (crec or {}).get("title"),
                             "xlsx", "csv")
    filing_date     = _pick((xrec or {}).get("filing_date"),     (crec or {}).get("filing_date"),
                             "xlsx", "csv")
    grant_date      = _pick((xrec or {}).get("grant_date"),      (crec or {}).get("grant_date"),
                             "xlsx", "csv")
    expiration_date = _pick((xrec or {}).get("expiration_date"), None, "xlsx", "xlsx")

    abstract    = _pick((crec or {}).get("abstract"),    None, "csv", "csv")
    claims_text = _pick((crec or {}).get("claims_text"), None, "csv", "csv")
    inventors   = _pick((crec or {}).get("inventors") or [], [], "csv", "csv")

    product_line = _pick((xrec or {}).get("product_line"), None, "xlsx", "xlsx")
    model        = _pick((xrec or {}).get("model"),        None, "xlsx", "xlsx")

    google_patents_link = _pick(
        (xrec or {}).get("google_patents_link"),
        None,
        "xlsx", "xlsx",
    )

    # Merged data-quality flags (dedup while preserving order)
    flags: list[str] = []
    for f in ((xrec or {}).get("data_quality_flags") or []) + ((crec or {}).get("data_quality_flags") or []):
        if f not in flags:
            flags.append(f)

    sources = set()
    if xrec: sources.add("xlsx")
    if crec: sources.add("csv")

    fallback_seed = f"{country or 'NA'}-{raw_number_primary or 'NO_NUMBER'}-{((xrec or crec) or {}).get('row_index', 0)}"
    patent_id = _stable_id(normalized_number, fallback_seed)

    return {
        "id":                  patent_id,
        "raw_number":          raw_number_primary,
        "normalized_number":   normalized_number,
        "patent_type":         patent_type,
        "country":             country,
        "is_placeholder":      is_placeholder,
        "title":               title,
        "abstract":            abstract,
        "claims_text":         claims_text,
        "filing_date":         filing_date,
        "grant_date":          grant_date,
        "publication_date":    _attributed(None, "csv"),
        "expiration_date":     expiration_date,
        "status":              status,
        "assignee":            assignee,
        "inventors":           inventors,
        "product_line":        product_line,
        "model":               model,
        "technology_cluster":  _attributed([], "manual"),   # awaits manual tagging
        "cpc_codes":           _attributed([], "api"),      # awaits API enrichment
        "family_id":           None,                         # filled in by _build_families
        "family_members":      [],                           # filled in by _build_families
        "google_patents_url":  google_patents_link,
        "forward_citations":   _attributed(None, "api"),
        "notes":               _attributed("", "manual"),
        "data_quality_flags":  flags,
        "_sources":            sources,                     # consumed by stats, stripped before export
        "_xlsx_row_index":     (xrec or {}).get("row_index"),
        "_csv_row_index":      (crec or {}).get("row_index"),
        "last_refreshed":      now,
    }


# --------------------------------------------------------------------------- #
# Family assignment
# --------------------------------------------------------------------------- #


def _build_families(patents: list[dict]) -> dict[str, dict]:
    """
    Assign family_id to every patent and return a families dict.

    Rules:
      1. Every US patent with a normalized_number seeds a family.
      2. Foreign patents try to attach to a US family by title key match.
      3. Foreign rows that don't match become their own orphan family.
      4. CSV-only US records also seed families.
    """
    families: dict[str, dict] = {}
    fam_counter = 0

    def next_family_id() -> str:
        nonlocal fam_counter
        fam_counter += 1
        return f"FAM-{fam_counter:05d}"

    # Pass 1: seed families on every US / unknown-country patent.
    title_to_family: dict[str, str] = {}
    for p in patents:
        if p["country"] == "US" or p["country"] is None:
            fid = next_family_id()
            p["family_id"] = fid
            families[fid] = {
                "family_id":       fid,
                "parent_id":       p["id"],
                "parent_number":   p["normalized_number"],
                "parent_title":    p["title"]["value"],
                "member_ids":      [p["id"]],
                "countries":       [p["country"]] if p["country"] else [],
            }
            tkey = _title_key(p["title"]["value"])
            if tkey and tkey not in title_to_family:
                title_to_family[tkey] = fid

    # Pass 2: foreign rows attempt a title match. Only XLSX-curated foreign
    # rows are eligible — using CSV-only foreign rows would dump hundreds of
    # unrelated old patents into any family with a generic title like
    # "Flush Valve". CSV-only foreign rows become their own orphan families.
    for p in patents:
        if p["country"] in (None, "US"):
            continue

        xlsx_curated = p["_sources"] & {"xlsx"}
        tkey = _title_key(p["title"]["value"])
        matched = (xlsx_curated and tkey and title_to_family.get(tkey)) or None

        if matched:
            p["family_id"] = matched
            families[matched]["member_ids"].append(p["id"])
            if p["country"] not in families[matched]["countries"]:
                families[matched]["countries"].append(p["country"])
        else:
            fid = next_family_id()
            p["family_id"] = fid
            families[fid] = {
                "family_id":     fid,
                "parent_id":     p["id"],
                "parent_number": p["normalized_number"],
                "parent_title":  p["title"]["value"],
                "member_ids":    [p["id"]],
                "countries":     [p["country"]] if p["country"] else [],
                "orphan":        True,
            }
            if "missing_us_parent" not in p["data_quality_flags"]:
                p["data_quality_flags"].append("missing_us_parent")

    # Pass 2.5: flag any family that grew suspiciously large — the title
    # match can still overcollect when two distinct inventions share a short
    # title (e.g. "Faucet", "Flush Valve"). The IP manager should review.
    for fam in families.values():
        if len(fam["member_ids"]) > 20:
            fam["oversized"] = True

    # Pass 3: fill family_members on each patent record for easy display.
    id_to_patent = {p["id"]: p for p in patents}
    for fam in families.values():
        for mid in fam["member_ids"]:
            pm = id_to_patent[mid]
            pm["family_members"] = [
                {
                    "normalized_number": id_to_patent[x]["normalized_number"],
                    "country":           id_to_patent[x]["country"],
                    "status":            id_to_patent[x]["status"]["value"],
                    "filing_date":       id_to_patent[x]["filing_date"]["value"],
                    "grant_date":        id_to_patent[x]["grant_date"]["value"],
                }
                for x in fam["member_ids"] if x != mid
            ]

    return families


if __name__ == "__main__":
    import json
    from ingest_xlsx import load_xlsx
    from ingest_csv import load_csv

    xlsx = load_xlsx()
    csv  = load_csv()
    result = merge(xlsx, csv)

    # Strip the internal _sources set before printing
    stats = result["stats"]
    print(json.dumps(stats, indent=2))
    print(f"\nFamilies: {len(result['families'])}")
    print(f"Sample patent:")
    sample = dict(result["patents"][0])
    sample["_sources"] = sorted(sample["_sources"])
    print(json.dumps(sample, indent=2, default=str)[:2000])
