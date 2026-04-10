"""
exceptions.py — Build the data-quality exception report.

Produces a single exceptions.json keyed by category, matching the categories
in the build spec so the Exception Report page can render them directly:

  1. assignee_review_queue
  2. missing_data
       - missing_expiration_date
       - missing_filing_date
       - unknown_status
       - placeholder_number
  3. unmatched_orphans
       - foreign_without_us_parent
       - csv_only (non-Sloan or historical)
       - xlsx_only (not yet in CSV snapshot)
  4. unmapped_taxonomy
       - missing_product_line
       - missing_technology_cluster
  5. data_freshness  (stub — populated by refresh pipeline)
"""

from __future__ import annotations

from datetime import datetime, timezone


def _thin(patent: dict) -> dict:
    """Compact per-patent summary used inside each exception list."""
    return {
        "id":                patent["id"],
        "normalized_number": patent["normalized_number"],
        "raw_number":        patent["raw_number"],
        "title":             patent["title"]["value"],
        "country":           patent["country"],
        "status":            patent["status"]["value"],
        "status_sub_tag":    patent["status"]["sub_tag"],
        "assignee":          patent["assignee"]["normalized"],
        "product_line":      patent["product_line"]["value"],
        "family_id":         patent["family_id"],
        "flags":             patent["data_quality_flags"],
    }


def build_exceptions(patents: list[dict], families: dict[str, dict]) -> dict:
    assignee_review: list[dict] = []
    missing_expiration: list[dict] = []
    missing_filing: list[dict] = []
    unknown_status: list[dict] = []
    placeholder_number: list[dict] = []

    foreign_orphans: list[dict] = []
    csv_only_non_sloan: list[dict] = []
    csv_only_historical: list[dict] = []
    xlsx_only: list[dict] = []

    missing_product_line: list[dict] = []
    missing_tech_cluster: list[dict] = []

    oversized_families: list[dict] = [
        {
            "family_id":    f["family_id"],
            "parent_title": f["parent_title"],
            "member_count": len(f["member_ids"]),
            "countries":    f["countries"],
        }
        for f in families.values() if f.get("oversized")
    ]

    for p in patents:
        sources = p["_sources"]
        thin = _thin(p)

        # 1) Assignee review queue -------------------------------------------
        if p["assignee"]["needs_review"]:
            assignee_review.append(thin)

        # 2) Missing data ----------------------------------------------------
        if p["expiration_date"]["value"] is None and p["status"]["value"] in ("active", "pending"):
            missing_expiration.append(thin)
        if p["filing_date"]["value"] is None:
            missing_filing.append(thin)
        if p["status"]["value"] == "unknown":
            unknown_status.append(thin)
        if p["is_placeholder"]:
            placeholder_number.append(thin)

        # 3) Unmatched / orphan records --------------------------------------
        if p["family_id"] in families and families[p["family_id"]].get("orphan"):
            foreign_orphans.append(thin)

        if sources == {"csv"}:
            if p["assignee"]["is_confirmed_sloan"]:
                csv_only_historical.append(thin)
            else:
                csv_only_non_sloan.append(thin)

        if sources == {"xlsx"} and not p["is_placeholder"]:
            xlsx_only.append(thin)

        # 4) Unmapped taxonomy -----------------------------------------------
        if p["product_line"]["value"] in (None, ""):
            missing_product_line.append(thin)
        if not p["technology_cluster"]["value"]:
            missing_tech_cluster.append(thin)

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    return {
        "generated_at": now,
        "summary": {
            "assignee_review":       len(assignee_review),
            "missing_expiration":    len(missing_expiration),
            "missing_filing":        len(missing_filing),
            "unknown_status":        len(unknown_status),
            "placeholder_number":    len(placeholder_number),
            "foreign_orphans":       len(foreign_orphans),
            "csv_only_non_sloan":    len(csv_only_non_sloan),
            "csv_only_historical":   len(csv_only_historical),
            "xlsx_only":             len(xlsx_only),
            "missing_product_line":  len(missing_product_line),
            "missing_tech_cluster":  len(missing_tech_cluster),
            "oversized_families":    len(oversized_families),
        },
        "assignee_review_queue": assignee_review,
        "missing_data": {
            "missing_expiration_date": missing_expiration,
            "missing_filing_date":     missing_filing,
            "unknown_status":          unknown_status,
            "placeholder_number":      placeholder_number,
        },
        "unmatched_orphans": {
            "foreign_without_us_parent": foreign_orphans,
            "csv_only_non_sloan":        csv_only_non_sloan,
            "csv_only_historical":       csv_only_historical,
            "xlsx_only":                 xlsx_only,
        },
        "unmapped_taxonomy": {
            "missing_product_line":      missing_product_line,
            "missing_technology_cluster": missing_tech_cluster,
        },
        "oversized_families": oversized_families,
        "data_freshness": {
            "last_refresh_xlsx": now,
            "last_refresh_csv":  now,
            "last_refresh_epo":  None,
            "last_refresh_uspto": None,
            "stale_sources":     [],
        },
    }
