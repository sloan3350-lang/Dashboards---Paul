#!/usr/bin/env python3
"""
Season alerts. What opens, closes or starts running in the next N days, and
what that means for where to go and what to bring.

No network, no Drive, no credentials. Pure date arithmetic against a table, so
it works on a machine with nothing configured and it is the one part of the
fishing summary that cannot say "no data yet" — the calendar is knowable in
advance whether or not any bot logged a condition.

The same table drives the Season clock in surf-command.html. If you change a
window here, change it there.

Legal windows were read off FWC species pages and FWC news releases on
5 September 2026 and are marked tier B. Bite windows are fishing pattern rather
than law and are marked tier C. Verify anything you are relying on: FWC changes
seasons by executive order mid-year, and this file will not know.

Usage:
  python3 season_alerts.py                 alerts for the next 45 days
  python3 season_alerts.py --days 90       a wider horizon
  python3 season_alerts.py --all           the whole clock, soonest change first
  python3 season_alerts.py --self-test     run the date engine against fixtures
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys

LEGAL, BITE = "legal", "bite"

# open: windows the season is ON, as (month, day, month, day). A window whose
# end sorts before its start wraps the year end. special="mini" means the two
# day lobster sport season, which is a rule rather than a date.
SEASONS = [
    dict(n="Snook harvest", kind=LEGAL, tier="B", open=[(2, 1, 5, 31), (9, 1, 12, 14)],
         short="Inlets on moving tide, the beach after 6 p.m., and the run.",
         where="Hillsboro Inlet on moving tide, Fort Lauderdale beach after 6 p.m., "
               "inlet edges at Boynton and Jupiter.",
         gear="Flair Hawk in inlet current after dark, topwater at first light, live mullet in the run.",
         need="Snook permit on top of the licence, open season or not.",
         note="The Keys are FWC's Southwest Region: 28-33 inch slot, closed Dec 1 through "
              "end of February and May 1 through Sep 30. Do not carry the Broward dates south.",
         src="https://myfwc.com/fishing/saltwater/recreational/snook/"),

    dict(n="Spiny lobster - sport season (mini-season)", kind=LEGAL, tier="B", special="mini",
         short="Two days in the water. Licence plus lobster permit, not the shoreline licence.",
         where="Keys patch reefs and the Broward second reef. No shore-based version exists.",
         gear="Tickle stick, net, gauge on a lanyard, dive flag, bag.",
         need="Saltwater licence PLUS lobster permit. The free shoreline licence does not cover diving.",
         note="Six per person per day in Monroe County and Biscayne National Park, twelve elsewhere. "
              "Carapace over three inches measured in the water, measuring device carried, no egg-bearing "
              "females, lobster stays whole. Night diving prohibited during the sport season.",
         src="https://myfwc.com/fishing/saltwater/recreational/lobster/"),

    dict(n="Spiny lobster - regular season", kind=LEGAL, tier="B", open=[(8, 6, 3, 31)],
         short="Eight quiet months on the same reefs the July crowd fishes.",
         where="Keys patch reefs off Islamorada and Marathon.",
         gear="As the sport season. Limits and the three-inch carapace do not change.",
         need="Saltwater licence plus lobster permit. Diving, so not the shoreline licence.",
         note="Aug 6 through Mar 31. If the point is lobster rather than the event, "
              "September through November is the trip to plan.",
         src="https://myfwc.com/fishing/saltwater/recreational/lobster/"),

    dict(n="Stone crab", kind=LEGAL, tier="B", open=[(10, 15, 5, 1)],
         short="Claws only, 2-7/8 inch minimum. Read the trap rules first.",
         where="Hard bottom and rocky shallows; the Keys and Florida Bay are the productive end.",
         gear="Recreational trap rules are their own regime. Read the FWC page before setting anything.",
         need="Saltwater licence, plus trap registration rules.",
         note="Open Oct 15 through May 1, closed May 2.",
         src="https://myfwc.com/fishing/saltwater/recreational/stone-crabs/"),

    dict(n="Hogfish - Atlantic", kind=LEGAL, tier="B", open=[(5, 1, 10, 31)],
         short="Reef fish, so a boat or a dive. Sixteen inch fork.",
         where="Reef. Not a shore fish anywhere on this coast.",
         gear="Spear, or a light bottom rig on a Keys head boat.",
         need="Saltwater licence. Spearfishing is banned in Monroe from Long Key north and within "
              "100 yards of any pier, bridge or public beach.",
         note="Atlantic season May 1 through Oct 31. The Gulf rules differ and are not your water.",
         src="https://myfwc.com/fishing/saltwater/recreational/hogfish/"),

    dict(n="Shallow-water grouper - Atlantic", kind=LEGAL, tier="B", open=[(5, 1, 12, 31)],
         short="Charter water. Book bottom trips in May, not March.",
         where="Charter water — the bottom boats. No legal grouper from the sand.",
         gear="House bottom rig. Non-stainless hooks with natural bait, descending device rigged.",
         need="Saltwater licence, covered by the vessel licence aboard a head boat.",
         note="Closed Jan 1 through Apr 30 in Atlantic state and federal waters including all state "
              "waters off Monroe. Gag has a shorter season than the rest.",
         src="https://myfwc.com/fishing/saltwater/recreational/groupers/"),

    dict(n="Greater amberjack - Atlantic", kind=LEGAL, tier="B", open=[(5, 1, 3, 31)],
         short="April is shut. Check before paying for a spring bottom charter.",
         where="Wrecks and deep structure off Haulover and Miami.",
         gear="Heavy bottom outfit; the head boats carry them.",
         need="Saltwater licence, covered aboard.",
         note="Atlantic harvest closed the whole of April, open the rest of the year.",
         src="https://myfwc.com/fishing/saltwater/recreational/amberjack/"),

    dict(n="Mutton snapper spawning limit", kind=LEGAL, tier="B", open=[(4, 1, 6, 30)], inverted=True,
         short="Reduced bag on the Keys reef through the spawn.",
         where="Keys patch reefs and the Islamorada humps.",
         gear="Knocker rig on fluorocarbon; night trips outfish day trips on mutton.",
         need="Saltwater licence, covered aboard.",
         note="Not a closure. Apr 1 through Jun 30 the recreational bag drops to five mutton inside "
              "the ten-snapper aggregate in Atlantic state waters. ON means the restriction applies.",
         src="https://myfwc.com/fishing/saltwater/recreational/snappers/"),

    dict(n="Shore shark permit", kind=LEGAL, tier="B", open=[(1, 1, 12, 31)],
         short="Free permit and course, renewed annually. Renew in January.",
         where="Any beach you already fish.",
         gear="Shoremaster and the BG MQ 8000, non-stainless circle hook, dehooking device to hand.",
         need="Free shore-based shark permit and the free Shark-Smart course, annual, age 16 and up.",
         note="No closed season, but no chumming from the beach for any species, and 29 prohibited "
              "species stay in the water.",
         src="https://myfwc.com/fishing/saltwater/recreational/sharks/"),

    dict(n="Pompano - the bite", kind=BITE, tier="C", open=[(11, 1, 4, 30)],
         short="First trough past the bar. High-low rig, sand fleas or Fishbites.",
         where="Fort Lauderdale citywide after 6 p.m., Gulfstream Park for the free lot, "
               "Mizell-Johnson when you need a midday option.",
         gear="High-low rig, #1-2 circle hooks, sand fleas or Fishbites; pompano jig between soaks.",
         need="Licence only. Six per person, eleven inch fork, no closed season.",
         note="Bite season, not a legal season. Peaks January and February. Fish the day a front "
              "arrives on falling pressure, not the bluebird day after.",
         src="https://myfwc.com/fishing/saltwater/recreational/permit/"),

    dict(n="Blacktip and spinner shark run", kind=BITE, tier="C", open=[(1, 1, 3, 31)],
         short="Palm Beach to Jupiter. Permit first, and the run is weakening.",
         where="Palm Beach, Singer Island, Jupiter Inlet, the Boca stretch.",
         gear="Shoremaster and the 8000, heavy leader, cut mullet.",
         need="Shore-based shark permit and Shark-Smart course.",
         note="Peaks mid-February. FAU research indicates the migration has weakened as coastal water "
              "warms. Treat a big run as possible, not reliable.",
         src="https://myfwc.com/wildlifehabitats/profiles/saltwater/sharks/blacktip-shark/"),

    dict(n="Mullet run", kind=BITE, tier="C", open=[(8, 25, 10, 31)],
         short="The best six weeks of the year. Fish the edges of the pods.",
         where="Open beach wherever pods are moving; Fort Lauderdale from 6 p.m., "
               "Lauderdale-by-the-Sea from 4 p.m. on a weekday.",
         gear="Silver profiles four to six inches. Fish the edges of a pod, never the middle. "
              "Shoremaster as the second spike for tarpon and oversized snook.",
         need="Snook permit if you intend to keep one — harvest reopens Sep 1.",
         note="Drop the pompano rotation for it.",
         src=""),

    dict(n="Tarpon on the beach", kind=BITE, tier="C", open=[(4, 1, 7, 31)],
         short="Inlet edges at first light. Release only, over 40 inches stays wet.",
         where="Inlet edges on moving tide; the beach at first light.",
         gear="Live mullet or a large swimbait on the Shoremaster.",
         need="Catch and release only. A tarpon over 40 inches may not leave the water.",
         note="Also runs again with the mullet.",
         src="https://myfwc.com/fishing/saltwater/recreational/tarpon/"),

    dict(n="Spanish mackerel and bluefish", kind=BITE, tier="C", open=[(12, 1, 3, 31)],
         short="Piers and clear winter water. Spoons and wire.",
         where="Piers and open beach when bait is thick and water is green-clear.",
         gear="Casting spoons and fast plugs. Wire or heavy fluoro — both species cut light leader.",
         need="Licence only. Spanish 12 inch fork and 15 per day; bluefish 12 inch fork and 3 per day.",
         note="Free fish on a pompano trip. Carry one spoon and one wire leader from December.",
         src="https://myfwc.com/fishing/saltwater/recreational/spanish-mackerel/"),

    dict(n="Kingfish and sailfish - charter season", kind=BITE, tier="C", open=[(11, 1, 3, 31)],
         short="The drift fleet's season. Book a boat when the sand goes cold.",
         where="The drift fleet: Blue Heron out of Riviera Beach, Catch My Drift and Flamingo "
               "at the after-work distance.",
         gear="House outfits. The season to fish a boat rather than argue about braid.",
         need="Nothing beyond the fare; the vessel licence covers you aboard.",
         note="Inverts the beach calendar — peaks in the months the surf goes cold and flat.",
         src=""),

    dict(n="Keys reef night bite", kind=BITE, tier="C", open=[(6, 1, 9, 30)],
         short="Night trips out of Islamorada and Marathon. Both ban braid.",
         where="Captain Michael at Robbie's nightly; Marathon Lady's summer night snapper run; "
               "Sailors Choice late Friday and Saturday.",
         gear="Light knocker rigs on fluorocarbon and a chum line. Fish the house rod.",
         need="Licence covered aboard. Mutton bag is reduced April through June.",
         note="The reason to drive to Marathon in July rather than February.",
         src=""),
]


# ---------------------------------------------------------------- date engine

def _md(d: dt.date) -> int:
    return d.month * 100 + d.day


def window_has(win, d: dt.date) -> bool:
    """True if d falls inside (m1,d1,m2,d2). Windows may wrap the year end."""
    m = _md(d)
    a = win[0] * 100 + win[1]
    b = win[2] * 100 + win[3]
    return (a <= m <= b) if a <= b else (m >= a or m <= b)


def mini_season(year: int):
    """The last consecutive Wednesday and Thursday of July, per FWC's rule.

    Anchor on the last THURSDAY in July and step back one day for the Wednesday.
    Anchoring on the last Wednesday is wrong in years where July 31 is itself a
    Wednesday: 2019 had Wednesdays through July 31, and the season was July
    24-25, because both days have to fall in July. 2030 is the next such year.
    """
    d = dt.date(year, 7, 31)
    while d.weekday() != 3:            # Monday is 0, so Thursday is 3
        d -= dt.timedelta(days=1)
    return d - dt.timedelta(days=1), d


def is_on(season: dict, d: dt.date) -> bool:
    if season.get("special") == "mini":
        return d in mini_season(d.year)
    return any(window_has(w, d) for w in season.get("open", ()))


def scan(season: dict, today: dt.date, horizon: int = 400) -> dict:
    """Current state, the next transition, and how recently it last changed."""
    on = is_on(season, today)
    at, days = None, None
    for i in range(1, horizon + 1):
        d = today + dt.timedelta(days=i)
        if is_on(season, d) != on:
            at, days = d, i
            break
    since = None
    for i in range(1, 31):
        if is_on(season, today - dt.timedelta(days=i)) != on:
            since = i
            break
    return {"on": on, "at": at, "days": days, "since": since}


def verb(season: dict, st: dict) -> str:
    if season.get("inverted"):
        return "lifts" if st["on"] else "applies"
    return "closes" if st["on"] else "opens"


def state_word(season: dict, st: dict) -> str:
    if season.get("inverted"):
        return "IN FORCE" if st["on"] else "not in force"
    if st["on"]:
        return "OPEN" if season["kind"] == LEGAL else "RUNNING"
    return "closed" if season["kind"] == LEGAL else "out of season"


def alerts(today: dt.date, days: int = 45):
    """Seasons changing within `days`, or that changed within the last 14."""
    out = []
    for s in SEASONS:
        st = scan(s, today)
        soon = st["days"] is not None and st["days"] <= days
        fresh = st["since"] is not None and st["since"] <= 14
        if soon or fresh:
            out.append((s, st, fresh))
    out.sort(key=lambda r: (-1 if r[2] else (r[1]["days"] or 10 ** 6)))
    return out


def clock(today: dt.date):
    rows = [(s, scan(s, today)) for s in SEASONS]
    rows.sort(key=lambda r: r[1]["days"] if r[1]["days"] is not None else 10 ** 6)
    return rows


# ---------------------------------------------------------------- rendering

def render_markdown(today: dt.date, days: int = 45) -> str:
    rows = alerts(today, days)
    out = [f"## Season alerts — next {days} days", ""]
    if not rows:
        out.append(f"Nothing on the calendar changes before "
                   f"{(today + dt.timedelta(days=days)):%B %-d}.")
        return "\n".join(out)
    for s, st, fresh in rows:
        if fresh:
            when = f"{state_word(s, st)} as of {st['since']} day{'s' if st['since'] != 1 else ''} ago"
        else:
            when = (f"{verb(s, st)} in {st['days']} day{'s' if st['days'] != 1 else ''}"
                    f" — {st['at']:%B %-d, %Y}")
        out.append(f"- **{s['n']}** — {when}. {s['short']}")
    out.append("")
    out.append("Legal seasons are FWC windows read 5 Sep 2026; bite seasons are pattern, not law. "
               "Verify before you rely on one.")
    return "\n".join(out)


def render_clock(today: dt.date) -> str:
    out = [f"## Season clock — {today:%B %-d, %Y}", ""]
    for s, st in clock(today):
        if st["days"] is None:
            when = "no change in the next 400 days"
        else:
            when = f"{verb(s, st)} in {st['days']}d ({st['at']:%b %-d, %Y})"
        out.append(f"- [{s['tier']}] **{s['n']}** — {state_word(s, st)}, {when}. {s['short']}")
    return "\n".join(out)


# ---------------------------------------------------------------- self-test

def self_test() -> int:
    fails = []

    def check(label, got, want):
        if got != want:
            fails.append(f"{label}: got {got!r}, want {want!r}")

    # The sport season is the last consecutive Wednesday and Thursday of July.
    check("mini 2026", mini_season(2026), (dt.date(2026, 7, 29), dt.date(2026, 7, 30)))
    check("mini 2027", mini_season(2027), (dt.date(2027, 7, 28), dt.date(2027, 7, 29)))
    check("mini 2028", mini_season(2028), (dt.date(2028, 7, 26), dt.date(2028, 7, 27)))
    # 2019 is the historical anchor: July 31 was a Wednesday and FWC still ran
    # the season July 24-25, because both days must fall inside July.
    check("mini 2019", mini_season(2019), (dt.date(2019, 7, 24), dt.date(2019, 7, 25)))
    check("mini 2030", mini_season(2030), (dt.date(2030, 7, 24), dt.date(2030, 7, 25)))
    for y in range(2026, 2041):
        w, t = mini_season(y)
        check(f"mini {y} weekdays", (w.weekday(), t.weekday()), (2, 3))
        check(f"mini {y} july", (w.month, t.month), (7, 7))
        # the Thursday is the last one in July, and the pair never straddles August
        check(f"mini {y} last thu", (t + dt.timedelta(days=7)).month, 8)

    # Wrapping windows.
    lob = next(s for s in SEASONS if s["n"] == "Spiny lobster - regular season")
    check("lobster Sep 6", is_on(lob, dt.date(2026, 9, 6)), True)
    check("lobster Mar 31", is_on(lob, dt.date(2027, 3, 31)), True)
    check("lobster Apr 1", is_on(lob, dt.date(2027, 4, 1)), False)
    check("lobster Aug 5", is_on(lob, dt.date(2027, 8, 5)), False)
    check("lobster Aug 6", is_on(lob, dt.date(2027, 8, 6)), True)

    # Two-window season: snook is shut in both closures and open between them.
    snook = next(s for s in SEASONS if s["n"] == "Snook harvest")
    for d, want in ((dt.date(2026, 12, 14), True), (dt.date(2026, 12, 15), False),
                    (dt.date(2027, 1, 31), False), (dt.date(2027, 2, 1), True),
                    (dt.date(2027, 5, 31), True), (dt.date(2027, 6, 1), False),
                    (dt.date(2027, 8, 31), False), (dt.date(2027, 9, 1), True)):
        check(f"snook {d}", is_on(snook, d), want)

    # Grouper closure and the April amberjack shutdown.
    grp = next(s for s in SEASONS if s["n"] == "Shallow-water grouper - Atlantic")
    check("grouper Jan 1", is_on(grp, dt.date(2027, 1, 1)), False)
    check("grouper Apr 30", is_on(grp, dt.date(2027, 4, 30)), False)
    check("grouper May 1", is_on(grp, dt.date(2027, 5, 1)), True)
    aj = next(s for s in SEASONS if s["n"] == "Greater amberjack - Atlantic")
    check("aj Mar 31", is_on(aj, dt.date(2027, 3, 31)), True)
    check("aj Apr 15", is_on(aj, dt.date(2027, 4, 15)), False)
    check("aj May 1", is_on(aj, dt.date(2027, 5, 1)), True)

    # The scanner finds the right next edge and counts days correctly.
    st = scan(snook, dt.date(2026, 9, 6))
    check("snook state", st["on"], True)
    check("snook next edge", st["at"], dt.date(2026, 12, 15))
    check("snook days", st["days"], 100)
    st = scan(next(s for s in SEASONS if s.get("special") == "mini"), dt.date(2026, 9, 6))
    check("mini next edge", st["at"], dt.date(2027, 7, 28))

    # Every season must resolve a next edge except the year-round permit row.
    for s in SEASONS:
        st = scan(s, dt.date(2026, 9, 6))
        if s["n"] != "Shore shark permit" and st["days"] is None:
            fails.append(f"{s['n']}: no transition found within 400 days")

    # Every row carries the fields the renderers read.
    for s in SEASONS:
        for f in ("n", "kind", "tier", "short", "where", "gear", "need", "note"):
            if not s.get(f):
                fails.append(f"{s['n']}: missing {f}")

    if fails:
        print("FAIL")
        for f in fails:
            print("  " + f)
        return 1
    print(f"OK — {len(SEASONS)} seasons, date engine and fields verified")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--days", type=int, default=45, help="alert horizon in days")
    ap.add_argument("--all", action="store_true", help="print the whole clock")
    ap.add_argument("--date", help="pretend today is YYYY-MM-DD")
    ap.add_argument("--self-test", action="store_true")
    a = ap.parse_args()
    if a.self_test:
        return self_test()
    today = dt.date.fromisoformat(a.date) if a.date else dt.date.today()
    print(render_clock(today) if a.all else render_markdown(today, a.days))
    return 0


if __name__ == "__main__":
    sys.exit(main())
