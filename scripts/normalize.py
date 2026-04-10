"""
normalize.py — Patent number, status, and assignee normalization.

Every downstream step depends on `normalize_patent_number`. The goal is to
turn the many observed raw formats into a single canonical key that can be
used for matching between the XLSX and the CSV.

Run this file directly to execute the self-tests:
    python3 scripts/normalize.py
"""

from __future__ import annotations

import re
import unicodedata
from typing import Optional

# --------------------------------------------------------------------------- #
# Patent number normalization
# --------------------------------------------------------------------------- #

# Placeholder codes used in the XLSX for patents that do not yet have a
# published number. We preserve these as-is and flag them downstream.
PLACEHOLDER_CODES = {"PRO", "ORD", "CON", "D"}

# Known 2-letter ISO-ish country prefixes that appear in our sources.
# (AE, AR, AT, AU, BR, CA, CH, CL, CN, CO, DE, EM, EP, ES, FR, GB, HK, IN,
# IT, JP, KR, MX, MY, NL, NZ, PE, PH, RU, TH, TW, US, UY, VE, WO, ZA)
COUNTRY_PREFIXES = {
    "AE", "AR", "AT", "AU", "BR", "CA", "CH", "CL", "CN", "CO", "DE", "EM",
    "EP", "ES", "FR", "GB", "HK", "IN", "IT", "JP", "KR", "MX", "MY", "NL",
    "NZ", "PE", "PH", "RU", "TH", "TW", "US", "UY", "VE", "WO", "ZA",
}

# US kind-code suffixes we strip for matching. (B1/B2 = utility grant,
# A1/A2 = publication, S/S1 = design, P = plant, E = reissue, H = SIR.)
US_KIND_CODE_RE = re.compile(r"(B[12]|A[129]?|S[12]?|P[12]?|E|H)$")

# --------------------------------------------------------------------------- #


def _strip_noise(value: str) -> str:
    """Strip unicode oddities, spaces, hyphens, commas, slashes."""
    # Remove combining marks, normalize to ASCII-ish
    value = unicodedata.normalize("NFKD", value)
    # Drop anything that isn't alphanumeric or a dot (dots appear in CN)
    return re.sub(r"[\s\-,\/]+", "", value).upper()


def normalize_patent_number(raw: Optional[str], country_hint: Optional[str] = None) -> dict:
    """
    Normalize a patent number string.

    Args:
        raw           — the raw patent identifier string
        country_hint  — if the caller already knows the country (e.g. from a
                        separate XLSX column), this overrides the "assume US"
                        fallback for bare numerics and strips any accidentally
                        prepended country prefix.

    Returns a dict with:
        raw_number          — the input, trimmed
        normalized_number   — canonical matching key (or None if placeholder)
        country             — inferred 2-letter prefix ("US" default for bare numerics)
        patent_type         — utility / design / publication / reissue /
                              provisional / continuation / placeholder / foreign / unknown
        is_placeholder      — True for PRO/ORD/CON/D and for totally missing values
    """
    if raw is None:
        return _placeholder_result(None)

    raw_str = str(raw).strip()
    if not raw_str or raw_str.lower() == "nan":
        return _placeholder_result(None)

    # Placeholder codes (XLSX pre-publication markers)
    upper_stripped = raw_str.upper().strip()
    if upper_stripped in PLACEHOLDER_CODES:
        return _placeholder_result(raw_str, code=upper_stripped)

    cleaned = _strip_noise(raw_str)
    if not cleaned:
        return _placeholder_result(raw_str)

    # If the caller tells us the country and the cleaned string starts with a
    # *different* country prefix, that prefix belongs to the title or link
    # rather than to this patent's jurisdiction — drop it.
    if country_hint and country_hint != "US":
        if cleaned.startswith("US") and cleaned != "US":
            cleaned = cleaned[2:]

    # -------- US REISSUES --------
    if cleaned.startswith("USRE") or cleaned.startswith("RE"):
        digits = re.sub(r"[^0-9]", "", cleaned)
        if digits:
            return {
                "raw_number": raw_str,
                "normalized_number": f"USRE{digits}",
                "country": "US",
                "patent_type": "reissue",
                "is_placeholder": False,
            }

    # -------- US DESIGNS --------
    # Accept "D644719", "USD644719", "USD844750S1", "USD1105354S"
    design_match = re.match(r"^(?:US)?D(\d+)", cleaned)
    if design_match and (cleaned.startswith("D") or cleaned.startswith("USD")):
        digits = design_match.group(1)
        return {
            "raw_number": raw_str,
            "normalized_number": f"USD{digits}",
            "country": "US",
            "patent_type": "design",
            "is_placeholder": False,
        }

    # -------- US PUBLICATIONS (11-digit application publication numbers) --------
    # e.g. US20240143614A1 → keep full format for uniqueness
    pub_match = re.match(r"^US(\d{11})([A-Z]\d?)?$", cleaned)
    if pub_match:
        digits = pub_match.group(1)
        kind = pub_match.group(2) or "A1"
        return {
            "raw_number": raw_str,
            "normalized_number": f"US{digits}{kind}",
            "country": "US",
            "patent_type": "publication",
            "is_placeholder": False,
        }

    # -------- Explicit country prefix (US utility grants + foreign) --------
    prefix_match = re.match(r"^([A-Z]{2})(.+)$", cleaned)
    if prefix_match and prefix_match.group(1) in COUNTRY_PREFIXES:
        prefix = prefix_match.group(1)
        body = prefix_match.group(2)

        if prefix == "US":
            # US utility grant like US11828449B2, US11828449, US7320146
            body = US_KIND_CODE_RE.sub("", body)
            # Must be all digits after stripping kind code
            digits = re.sub(r"[^0-9]", "", body)
            if digits:
                return {
                    "raw_number": raw_str,
                    "normalized_number": f"US{digits}",
                    "country": "US",
                    "patent_type": "utility",
                    "is_placeholder": False,
                }

        # Foreign — preserve the full body (strip trailing kind code letters
        # only if they are a single letter, to be safe with alphanumeric IDs
        # like "ZL201630470916.3" which is a Chinese design utility model).
        foreign_body = body
        # Trim a trailing single kind letter (A/B/C) + optional digit
        foreign_body = re.sub(r"([A-Z]\d?)$", "", foreign_body)
        if foreign_body:
            return {
                "raw_number": raw_str,
                "normalized_number": f"{prefix}{foreign_body}",
                "country": prefix,
                "patent_type": "foreign",
                "is_placeholder": False,
            }

    # -------- Bare numerics — assign to hinted country, else assume US --------
    # (XLSX US rows frequently store just "7320146" with no prefix; XLSX
    # foreign rows also store bare numbers like "5452" with the country in a
    # separate column.)
    if cleaned.isdigit() or re.match(r"^[0-9][0-9A-Z.\-]*$", cleaned):
        effective_country = country_hint or "US"
        ptype = "utility" if effective_country == "US" else "foreign"
        return {
            "raw_number": raw_str,
            "normalized_number": f"{effective_country}{cleaned}",
            "country": effective_country,
            "patent_type": ptype,
            "is_placeholder": False,
        }

    # -------- Unknown / unparseable but hinted with a country ---------------
    # (e.g. Chinese "ZL201630470916.3", Indian "298563-001" — prefix w/ hint.)
    if country_hint and cleaned:
        return {
            "raw_number": raw_str,
            "normalized_number": f"{country_hint}{cleaned}",
            "country": country_hint,
            "patent_type": "foreign",
            "is_placeholder": False,
        }

    # -------- Fully unknown --------
    return {
        "raw_number": raw_str,
        "normalized_number": cleaned or None,
        "country": None,
        "patent_type": "unknown",
        "is_placeholder": False,
    }


def _placeholder_result(raw: Optional[str], code: Optional[str] = None) -> dict:
    type_map = {
        "PRO": "provisional",
        "ORD": "nonprovisional_filed",
        "CON": "continuation",
        "D":   "design_placeholder",
    }
    return {
        "raw_number": raw,
        "normalized_number": None,
        "country": "US" if code else None,
        "patent_type": type_map.get(code, "placeholder") if code else "unknown",
        "is_placeholder": True,
    }


# --------------------------------------------------------------------------- #
# Status normalization
# --------------------------------------------------------------------------- #

# Maps every raw status value we've observed in either source file to the
# canonical (status, sub_tag) pair specified in the build spec, plus several
# additional XLSX values ("Published", "Filed", "Allowed", "Unfiled") that
# were not in the spec's table but appear in the data.
STATUS_RULES = {
    # Active family
    "active":              ("active",  None),
    "granted":             ("active",  None),
    "active - reinstated": ("active",  "reinstated"),
    "active-reinstated":   ("active",  "reinstated"),

    # Pending family
    "pending":             ("pending", None),
    "published":           ("pending", "published"),     # XLSX-only
    "filed":               ("pending", "filed"),          # XLSX-only
    "allowed":             ("pending", "allowed"),        # XLSX-only
    "unfiled":             ("pending", "unfiled"),        # XLSX-only

    # Expired family
    "expired":                ("expired", "standard"),
    "expired - lifetime":     ("expired", "lifetime"),
    "expired-lifetime":       ("expired", "lifetime"),
    "expired - fee related":  ("expired", "fee_lapse"),
    "expired-fee related":    ("expired", "fee_lapse"),

    # Dead family
    "abandoned":    ("dead", "abandoned"),
    "withdrawn":    ("dead", "withdrawn"),
    "ceased":       ("dead", "ceased"),
    "not-in-force": ("dead", "not_in_force"),
    "not in force": ("dead", "not_in_force"),
}


def normalize_status(raw: Optional[str], is_placeholder: bool = False) -> dict:
    """Map a raw status string to the canonical model."""
    if is_placeholder:
        return {"value": "pending", "sub_tag": "pre_publication", "raw": raw}

    if raw is None or (isinstance(raw, float)) or str(raw).strip() == "" or str(raw).lower() == "nan":
        return {"value": "unknown", "sub_tag": None, "raw": raw}

    key = str(raw).strip().lower()
    value, sub_tag = STATUS_RULES.get(key, ("unknown", None))
    return {"value": value, "sub_tag": sub_tag, "raw": raw}


# --------------------------------------------------------------------------- #
# Assignee normalization
# --------------------------------------------------------------------------- #

# Each rule is (compiled regex, canonical name, is_confirmed_sloan).
# Order matters — first match wins. Regexes are case-insensitive.
_ASSIGNEE_RULES: list[tuple[re.Pattern, str, bool]] = [
    # Core Sloan Valve Company + common typos/variants
    (re.compile(r"\bsloan\s*valve\b",           re.I), "Sloan Valve Company",     True),
    (re.compile(r"\bsolan\s*valve\b",           re.I), "Sloan Valve Company",     True),  # known typo
    (re.compile(r"\bwilliam\s*e\.?\s*sloan\b",  re.I), "Sloan Valve Company",     True),  # founder
    (re.compile(r"\be\.?\s*sloan\s*william\b",  re.I), "Sloan Valve Company",     True),
    (re.compile(r"\bsloan\s*transportation\b",  re.I), "Sloan Transportation Products", False),

    # Subsidiaries and acquisitions
    (re.compile(r"sloan\s*water\s*technology",  re.I), "Sloan Water Technology",  True),
    (re.compile(r"stone\s*and\s*steel\s*systems", re.I), "Stone And Steel Systems", True),
    (re.compile(r"arichell\s*technolog",        re.I), "Arichell Technologies",   True),
    (re.compile(r"recurrent\s*solutions",       re.I), "Recurrent Solutions",     True),
]

# Assignees we explicitly know are NOT Sloan — flagged for exclusion review.
_KNOWN_NON_SLOAN = {
    "bauer industries",
    "midland brake",
    "haldex midland brake",
    "hewlett packard",
    "tooshlights",
    "mitsubishi electric",
    "railtech",
    "smart wave technologies",
    "modus systems",
}


def normalize_assignee(raw: Optional[str]) -> dict:
    """Canonicalize an assignee string and flag whether it is Sloan-related."""
    if raw is None or str(raw).strip() == "" or str(raw).strip().lower() == "nan":
        return {
            "raw": raw,
            "normalized": None,
            "is_confirmed_sloan": False,
            "needs_review": True,
        }

    raw_str = str(raw).strip()

    for pattern, canonical, is_sloan in _ASSIGNEE_RULES:
        if pattern.search(raw_str):
            return {
                "raw": raw_str,
                "normalized": canonical,
                "is_confirmed_sloan": is_sloan,
                "needs_review": not is_sloan,
            }

    lower = raw_str.lower()
    for needle in _KNOWN_NON_SLOAN:
        if needle in lower:
            return {
                "raw": raw_str,
                "normalized": raw_str,
                "is_confirmed_sloan": False,
                "needs_review": True,
            }

    # Unknown assignee — pass through, flag for review
    return {
        "raw": raw_str,
        "normalized": raw_str,
        "is_confirmed_sloan": False,
        "needs_review": True,
    }


# --------------------------------------------------------------------------- #
# Self-tests (run: python3 scripts/normalize.py)
# --------------------------------------------------------------------------- #

def _run_tests() -> None:
    cases = [
        # (input, expected_normalized_number, expected_type, is_placeholder)
        ("7320146",           "US7320146",        "utility",          False),
        ("US 11828449 B2",    "US11828449",       "utility",          False),
        ("US11907242B2",      "US11907242",       "utility",          False),
        ("US-6019131-A",      "US6019131",        "utility",          False),
        ("US-977562-A",       "US977562",         "utility",          False),
        ("D644719",           "USD644719",        "design",           False),
        ("D1105354",          "USD1105354",       "design",           False),
        ("USD844750S1",       "USD844750",        "design",           False),
        ("USD424169S",        "USD424169",        "design",           False),
        ("RE45373",           "USRE45373",        "reissue",          False),
        ("US20240328133A1",   "US20240328133A1",  "publication",      False),
        ("US20250103607A1",   "US20250103607A1",  "publication",      False),
        ("PRO",               None,               "provisional",          True),
        ("ORD",               None,               "nonprovisional_filed", True),
        ("CON",               None,               "continuation",         True),
        ("D",                 None,               "design_placeholder",   True),
        ("AR11160881",        "AR11160881",       "foreign",          False),
        ("AU2007217354",      "AU2007217354",     "foreign",          False),
        ("AU2018285022C1",    "AU2018285022",     "foreign",          False),
        ("WO2024049848A1",    "WO2024049848",     "foreign",          False),
        ("WO 2021/250645",    "WO2021250645",     "foreign",          False),
        ("EP3009202",         "EP3009202",        "foreign",          False),
        ("CA2846529",         "CA2846529",        "foreign",          False),
        (None,                None,               "unknown",              True),
        ("nan",               None,               "unknown",              True),
        ("",                  None,               "unknown",              True),
    ]

    failures = 0
    for raw, exp_num, exp_type, exp_placeholder in cases:
        got = normalize_patent_number(raw)
        ok = (
            got["normalized_number"] == exp_num
            and got["patent_type"]   == exp_type
            and got["is_placeholder"] == exp_placeholder
        )
        status = "PASS" if ok else "FAIL"
        if not ok:
            failures += 1
            print(f"[{status}] {raw!r:<25} -> {got}")
            print(f"       expected: num={exp_num!r} type={exp_type!r} placeholder={exp_placeholder}")
        else:
            print(f"[PASS] {raw!r:<25} -> {got['normalized_number']} ({got['patent_type']})")

    # Status tests
    print("\n-- Status normalization --")
    for raw, exp in [
        ("Granted",             "active"),
        ("granted",             "active"),
        ("Active",              "active"),
        ("Active - Reinstated", "active"),
        ("Pending",             "pending"),
        ("Published",           "pending"),
        ("Filed",               "pending"),
        ("Allowed",             "pending"),
        ("Unfiled",             "pending"),
        ("Expired",             "expired"),
        ("Expired - Lifetime",  "expired"),
        ("Expired - Fee Related", "expired"),
        ("Abandoned",           "dead"),
        ("Withdrawn",           "dead"),
        ("Ceased",              "dead"),
        ("Not-in-force",        "dead"),
        (None,                  "unknown"),
        ("nan",                 "unknown"),
    ]:
        got = normalize_status(raw)
        ok = got["value"] == exp
        if not ok: failures += 1
        print(f"[{'PASS' if ok else 'FAIL'}] {raw!r:<25} -> {got['value']}")

    # Assignee tests
    print("\n-- Assignee normalization --")
    for raw, exp_name, exp_sloan in [
        ("Sloan Valve Co",                      "Sloan Valve Company",    True),
        ("Sloan Valve Company",                 "Sloan Valve Company",    True),
        ("SOLAN VALVE Co",                      "Sloan Valve Company",    True),
        ("Sloan Water Technology Ltd",          "Sloan Water Technology", True),
        ("Stone And Steel Systems LLC",         "Stone And Steel Systems", True),
        ("Arichell Technologies, Inc.",         "Arichell Technologies",  True),
        ("Recurrent Solutions LP",              "Recurrent Solutions",    True),
        ("Bauer Industries, Inc.",              "Bauer Industries, Inc.", False),
        ("Mitsubishi Electric Corp",            "Mitsubishi Electric Corp", False),
        (None,                                  None,                     False),
    ]:
        got = normalize_assignee(raw)
        ok = got["normalized"] == exp_name and got["is_confirmed_sloan"] == exp_sloan
        if not ok: failures += 1
        print(f"[{'PASS' if ok else 'FAIL'}] {raw!r:<42} -> {got['normalized']} sloan={got['is_confirmed_sloan']}")

    print(f"\n{failures} failure(s)" if failures else "\nAll tests passed.")


if __name__ == "__main__":
    _run_tests()
