#!/usr/bin/env python3
"""
Fishing outlook. Reads the latest file the fishing bot saved to Drive, pulls the
conditions it logged, compares them against the spots record, and writes a
one-line outlook to the Chief of Staff folder.

Reads only. Fetches nothing from the web: if the bot did not log a condition,
this script does not go and look it up. When no conditions were logged it says
"no data yet" and stops.

Usage:
  python3 fishing_outlook.py               write to the Chief of Staff folder
  python3 fishing_outlook.py --dry-run     print the outlook, write nothing
  python3 fishing_outlook.py --self-test   run extractors against fixtures
"""
from __future__ import annotations

import argparse
import datetime as dt
import re
import sys
import zoneinfo

import drive_common as dc

# Thresholds below are transcribed from the spots record, "Surf Command -
# Master Research & Ops Record", section 12 "Condition-driven adjustments".
# They are not invented here. If that section changes, change these.
WIND_PRIME_MPH = 8.0     # "Under 8 mph is prime"
WIND_BAIL_MPH = 16.0     # "Over 16 mph the surf rod is a liability; move to a pier or inlet"
SURF_BAIL_FT = 4.5       # "Over 4.5 ft, expect lost rigs and weed"

MOON_WORDS = [
    "new moon", "full moon", "first quarter", "last quarter", "third quarter",
    "waxing gibbous", "waning gibbous", "waxing crescent", "waning crescent",
]
SARGASSUM_WORDS = ["none", "clear", "trace", "light", "moderate", "heavy", "thick", "matted"]
TIDE_WORDS = ["incoming", "outgoing", "flood", "ebb", "slack", "high tide", "low tide", "rising", "falling"]


def _find(pattern, text, group=1, flags=re.IGNORECASE):
    m = re.search(pattern, text, flags)
    return m.group(group).strip() if m else None


def extract_conditions(text: str) -> dict:
    """Pull only values that are actually present. Absent fields stay None.

    A line that merely says "Conditions:" with no measurements is not data, and
    must not be reported as though it were.
    """
    c = {"weather": None, "pressure": None, "moon": None, "sargassum": None,
         "tide": None, "wind_mph": None, "surf_ft": None}

    wind = _find(r"(?:wind[^\n]{0,20}?)(\d+(?:\.\d+)?)\s*(?:-|to)?\s*(?:\d+)?\s*mph", text)
    if wind is None:
        wind = _find(r"(\d+(?:\.\d+)?)\s*mph", text)
    if wind:
        c["wind_mph"] = float(wind)

    surf = _find(r"(?:surf|seas|waves)[^\n]{0,20}?(\d+(?:\.\d+)?)\s*(?:-|to)?\s*(?:\d+(?:\.\d+)?)?\s*(?:ft|feet|')", text)
    if surf:
        c["surf_ft"] = float(surf)

    press = _find(r"(?:barometric\s+)?pressure[^\n]{0,30}?(\d{2}\.\d{1,2})\s*(?:in\.?\s?hg|inhg|\")?", text)
    if press is None:
        press = _find(r"(\d{2}\.\d{2})\s*(?:in\.?\s?hg|inhg)", text)
    if press:
        trend = ""
        for word in ("falling", "dropping", "rising", "steady", "climbing"):
            if re.search(r"pressure[^\n]{0,60}" + word, text, re.IGNORECASE) or \
               re.search(word + r"[^\n]{0,30}pressure", text, re.IGNORECASE):
                trend = " " + word
                break
        c["pressure"] = f"{press} inHg{trend}"

    low = text.lower()
    for w in MOON_WORDS:
        if w in low:
            c["moon"] = w
            break

    sarg = _find(r"sargassum[^\n]{0,25}?(\d)\s*/\s*5", text)
    if sarg:
        c["sargassum"] = f"{sarg}/5"
    else:
        m = re.search(r"sargassum\s*[:\-]?\s*(" + "|".join(SARGASSUM_WORDS) + r")\b",
                      text, re.IGNORECASE)
        if m:
            c["sargassum"] = m.group(1).lower()

    m = re.search(r"tide\s*[:\-]?\s*([^\n,.;]{0,40})", text, re.IGNORECASE)
    if m and any(w in m.group(1).lower() for w in TIDE_WORDS):
        c["tide"] = m.group(1).strip()
    else:
        for w in TIDE_WORDS:
            if re.search(r"\b" + re.escape(w) + r"\b", low):
                c["tide"] = w
                break

    bits = []
    if c["wind_mph"] is not None:
        bits.append(f"wind {c['wind_mph']:g} mph")
    if c["surf_ft"] is not None:
        bits.append(f"surf {c['surf_ft']:g} ft")
    sky = _find(r"\b(sunny|clear|overcast|cloudy|rain|storms?|squalls?|showers?)\b", text)
    if sky:
        bits.append(sky.lower())
    c["weather"] = ", ".join(bits) if bits else None
    return c


def has_any(c: dict) -> bool:
    return any(c[k] is not None for k in
               ("weather", "pressure", "moon", "sargassum", "tide"))


def extract_spots(spots_text: str):
    """Parse the operational rotation table out of the spots record."""
    if not spots_text:
        return []
    rows = []
    for line in spots_text.splitlines():
        if not line.strip().startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) != 2:
            continue
        need, loc = cells
        if not need or not loc or set(need) <= set("-: "):
            continue
        if need.lower() in ("need", "location"):
            continue
        rows.append({"need": need, "location": re.sub(r"\*\*", "", loc)})
    return rows


def pick_spot(c: dict, spots):
    """Choose a spot from the record, with the rule that drove the choice."""
    if not spots:
        return None, "spots record unreadable, no spot named"

    def match(*keywords):
        for s in spots:
            hay = (s["need"] + " " + s["location"]).lower()
            if any(k in hay for k in keywords):
                return s
        return None

    heavy_weed = c["sargassum"] and (
        c["sargassum"] in ("heavy", "thick", "matted")
        or (c["sargassum"].endswith("/5") and int(c["sargassum"][0]) >= 4)
    )
    if heavy_weed:
        s = match("inlet", "pier")
        return s, "heavy sargassum, record says move to a pier or the inlet"
    if c["wind_mph"] is not None and c["wind_mph"] > WIND_BAIL_MPH:
        s = match("inlet", "pier")
        return s, f"wind over {WIND_BAIL_MPH:g} mph, record says surf rod is a liability"
    if c["surf_ft"] is not None and c["surf_ft"] > SURF_BAIL_FT:
        s = match("inlet", "pier")
        return s, f"surf over {SURF_BAIL_FT:g} ft, record warns of lost rigs and weed"
    s = match("closest reliable") or (spots[0] if spots else None)
    if c["wind_mph"] is not None and c["wind_mph"] < WIND_PRIME_MPH:
        return s, f"wind under {WIND_PRIME_MPH:g} mph, record calls this prime"
    return s, "no bail-out condition logged"


def build_outlook(c, spots, src, today):
    parts = []
    for label, key in (("weather", "weather"), ("pressure", "pressure"),
                       ("moon", "moon"), ("sargassum", "sargassum"), ("tide", "tide")):
        if c[key] is not None:
            parts.append(f"{label} {c[key]}")
    spot, why = pick_spot(c, spots)
    where = spot["location"] if spot else "no spot named in the record"
    missing = [k for k in ("weather", "pressure", "moon", "sargassum", "tide")
               if c[k] is None]
    line = f"{today}: " + "; ".join(parts) + f" -> {where} ({why})."
    if missing:
        line += f" Not logged: {', '.join(missing)}."
    return line, src


def render(today, line, src, note=None):
    out = [f"# Fishing outlook — {today}", ""]
    out.append(line)
    out.append("")
    if src:
        out.append(f"Source: **{src['name']}**, modified {src['modifiedTime']}")
        if src.get("webViewLink"):
            out.append(f"Link: {src['webViewLink']}")
    if note:
        out.append("")
        out.append(note)
    out.append("")
    out.append("---")
    out.append("Generated by fishing_outlook.py. Read-only, no web lookups.")
    return "\n".join(out)


NO_CONDITIONS_FIXTURE = """TRIP 2026-09-01 — Dania Pier — 1 small fish, bites at dark
Spot: Dania Beach Pier
Gear: shrimp on pier; Legend Tournament 7' MH + Stradic SW 4000.
Catch: 1 small fish (shrimp). Several bites at dark.
Conditions: dusk, Dania Pier. One line only.
"""

WITH_CONDITIONS_FIXTURE = """LOG 2026-09-02 — fishing bot conditions pull
Weather: sunny, wind 6 mph, surf 2 ft
Barometric pressure: 29.94 inHg and falling ahead of a front
Moon: waxing gibbous
Sargassum: light
Tide: incoming through mid-morning
"""

BLOWN_OUT_FIXTURE = """LOG 2026-09-03 — fishing bot conditions pull
Weather: overcast, wind 21 mph onshore, surf 5 ft
Barometric pressure: 30.11 inHg rising
Moon: full moon
Sargassum: heavy
Tide: outgoing
"""

SPOTS_FIXTURE = """## 13. Operational rotation

| Need | Location |
|---|---|
| Closest reliable, evening -> sunrise | **Fort Lauderdale**, whole beach, 6 p.m.-9 a.m. |
| Midday - the only legal option | **Mizell-Johnson**, 8 a.m.-sunset, $6 |
| Pre-dawn before the park opens | **Dania Beach Pier**, 5:00 a.m. |
| Inlet current, snook on Flair Hawk | **Hillsboro Inlet Park**, free lot, 7 a.m.-10 p.m. |
"""


def self_test():
    print("Running extractors against fixtures drawn from the real Drive files.\n")

    spots = extract_spots(SPOTS_FIXTURE)
    assert len(spots) == 4, spots
    print(f"  spots record         -> {len(spots)} rotation rows parsed  OK")

    c0 = extract_conditions(NO_CONDITIONS_FIXTURE)
    assert not has_any(c0), c0
    print("  real 1 Sep trip log  -> no conditions found, reports 'no data yet'  OK")
    print("                          (a bare 'Conditions:' label is not treated as data)")

    c1 = extract_conditions(WITH_CONDITIONS_FIXTURE)
    assert c1["wind_mph"] == 6.0, c1
    assert c1["surf_ft"] == 2.0, c1
    assert c1["pressure"] == "29.94 inHg falling", c1
    assert c1["moon"] == "waxing gibbous", c1
    assert c1["sargassum"] == "light", c1
    assert c1["tide"] and "incoming" in c1["tide"], c1
    print("  fair-conditions log  -> all five fields parsed  OK")
    line1, _ = build_outlook(c1, spots, None, "2026-09-02")
    assert "Fort Lauderdale" in line1, line1
    print(f"     {line1}")

    c2 = extract_conditions(BLOWN_OUT_FIXTURE)
    assert c2["sargassum"] == "heavy", c2
    assert c2["wind_mph"] == 21.0, c2
    line2, _ = build_outlook(c2, spots, None, "2026-09-03")
    assert "Pier" in line2 or "Inlet" in line2, line2
    print("  blown-out log        -> routed off the beach per the record's rule  OK")
    print(f"     {line2}")

    partial = extract_conditions("Weather: wind 5 mph. Nothing else logged.")
    line3, _ = build_outlook(partial, spots, None, "2026-09-04")
    assert "Not logged:" in line3, line3
    print("  partial log          -> names the fields that are missing  OK")
    print(f"     {line3}")

    print("\nAll extractor tests passed.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()

    if args.self_test:
        self_test()
        return 0

    cfg = dc.load_config(args.config)
    today = dt.datetime.now(zoneinfo.ZoneInfo(cfg["timezone"])).strftime("%Y-%m-%d")
    filename = f"fishing-outlook-{today}.md"

    service = dc.get_service(cfg)
    src = dc.latest_file(service, cfg["fishing"]["source_folder_id"])

    if src is None:
        body = render(today, "No data yet. "
                      f"The {cfg['fishing']['source_folder_name']} folder is empty.", None)
    else:
        text = dc.fetch_text(service, src["id"], src["mimeType"]) or ""
        conditions = extract_conditions(text)
        if not has_any(conditions):
            body = render(
                today,
                "No data yet. The latest file logs no weather, pressure, moon, "
                "sargassum or tide.",
                src,
            )
        else:
            spots_text = None
            spot_id = cfg["fishing"].get("spots_file_id")
            if spot_id:
                meta = service.files().get(
                    fileId=spot_id, fields="id,name,mimeType").execute()
                spots_text = dc.fetch_text(service, spot_id, meta["mimeType"])
            spots = extract_spots(spots_text)
            note = None if spots else "Spots record could not be read, so no spot is named."
            line, _ = build_outlook(conditions, spots, src, today)
            body = render(today, line, src, note)

    if args.dry_run:
        print(body)
        return 0

    out = dc.write_markdown(service, cfg["output"]["chief_of_staff_folder_id"],
                            filename, body)
    print(f"Wrote {out['name']} -> {out.get('webViewLink')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
