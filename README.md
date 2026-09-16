# Scheduled Drive summaries

Two scripts. Each reads the latest file a bot already saved to a Google Drive
folder and writes a short summary to the Chief of Staff folder.

| Script | Reads | Writes |
|---|---|---|
| `money_summary.py` | Money Machine folder | `money-summary-YYYY-MM-DD.md` |
| `fishing_outlook.py` | fishing folder | `fishing-outlook-YYYY-MM-DD.md` |
| `season_alerts.py` | nothing — a table in the file | stdout, and a block inside the fishing outlook |

Both are read-only against your data. They move no money, file nothing, and
contact no one. Neither one scrapes the web: if a bot did not log a figure,
the summary says the figure is missing rather than going to look it up.

## Status: written and tested, NOT scheduled

The extraction logic is tested and passing:

    ./.venv/bin/python money_summary.py   --self-test
    ./.venv/bin/python fishing_outlook.py --self-test

Neither script has been run against live Drive, and neither is scheduled.
Four things block that, described below.

## What is blocking a live run

**1. This container cannot host cron.** There is no `cron`, `crond` or
`crontab` binary, and no init system to run one. The container is also
ephemeral and is reclaimed after a period of inactivity. A cron job installed
here would not survive, so scheduling here would look like it worked and then
silently stop. These need to run on a machine that stays on: your personal
computer, or a small always-on VM.

**2. There are no Google credentials on this machine.** The Drive access used
to research this repo is a chat-session connector, not a credential a
standalone script can use. `config.json` expects an OAuth client secret at
`~/.config/paul-dashboards/client_secret.json`. The first authorization has to
be done once, by hand, on the host machine, because cron cannot answer an
OAuth consent prompt. After that the refresh token is reused.

**3. The fishing bot has never logged conditions.** (Softened: the season block
now carries the summary on days with no conditions, see `season_alerts.py`
below. The conditions half of the outlook is still blocked as described.) This is the significant
one. Nothing in Drive records weather, barometric pressure, moon phase,
sargassum rating or tide. The `Hunting and Fishing` folder holds trip logs
written after the fact, and the logging protocol in that folder
(`LOG 2026-08-31 — trip pattern log protocol`) specifies `Conditions: one line
only (wind, surf, sargassum)`. The most recent trip log's conditions line reads
in full: `dusk, Dania Pier. One line only.` No measurements. Run against Drive
as it stands today, `fishing_outlook.py` will correctly write "no data yet"
every morning, indefinitely, until something starts logging conditions.

**4. There is no spots sheet.** (Partly addressed: `surf-command.html` now lives
in this repo, see below, but `fishing_outlook.py` still reads the Drive record.)
The closest thing is
`Surf Command — Master Research & Ops Record`, a markdown research document in
the `Surf Command` folder. Its section 12 carries the condition thresholds this
script uses and section 13 carries the spot rotation table it parses. The
companion app `surf-command.html`, which that record says holds the structured
spot dataset in an `S` array, is a **195-byte truncated stub** containing only
a `<head>` block. The upload failed. There is no spot data in it.

## Unconfirmed configuration

`config.json` marks two values `"confirmed": false`. Three folders could be the
"fishing bot folder": `Hunting and Fishing`, `Surf Command`, and
`YouTube Fishing Channel`. I picked `Hunting and Fishing` because it is the only
one holding dated logs with a conditions field. Change `fishing.source_folder_id`
if that is wrong. Confirmed folder IDs: Money Machine
`1C6CIwZDaxtzOwOxB4COHogSxiqBar7uv`, Chief of Staff
`1CC1Gaif3c8-QyZPZE1ehVhxat2bG7pfU`.

## A note on "the latest file"

Both scripts take the most recently modified file in the folder, as specified.
For the Money Machine folder that is worth knowing about: the folder mixes full
daily refreshes with narrow one-line LOG notes, prompt drafts and dashboards.
On 2 Sep the newest file was a note about a Chase Plaid link, not the daily
refresh, so a 7:30 a.m. run would have summarised the note. Every summary names
the file it read and links it, so you can see when this happens. The structured
alternative is the `BOARD` Google Sheet and its seven tabs, which is a different
script; say the word and I will write it against `BOARD` instead.

## Setup on the host machine

    git clone <this repo> /opt/dashboards && cd /opt/dashboards
    python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt
    mkdir -p ~/.config/paul-dashboards
    # put the OAuth client secret at ~/.config/paul-dashboards/client_secret.json
    ./.venv/bin/python money_summary.py --dry-run      # authorizes once, writes nothing
    ./.venv/bin/python fishing_outlook.py --dry-run

`--dry-run` prints the summary to the terminal and writes nothing to Drive. Use
it to confirm the output before letting either script write.

## Scheduling

Edit the checkout path in `crontab.example`, then:

    crontab crontab.example && crontab -l

`CRON_TZ=America/New_York` keeps 7:30 a.m. correct across the DST change. If
your cron does not support `CRON_TZ`, use a systemd timer instead, which also
catches up a run the machine slept through:

    # /etc/systemd/system/money-summary.timer
    [Timer]
    OnCalendar=*-*-* 07:30:00 America/New_York
    Persistent=true

## OAuth scope

`drive_common.py` requests full `drive` scope: read access to the bot folders
plus write access to the Chief of Staff folder. `drive.readonly` cannot create
the summary, and `drive.file` only sees files the script itself created, so it
cannot read the bot files. Narrow it if you would rather grant less.

## `surf-command.html`

The Surf Command app itself, published as an Artifact at
`claude.ai/code/artifact/dd43faf9-0382-48c9-8ebb-c0707ee6dc7f`. This file is the
source of that Artifact and is the version to edit; republish it to the same URL
rather than creating a new one. It is self-contained and runs offline from
`file://` — the only things that need network are the live weather fetch, the
Esri and Sentinel-2 map layers and the sargassum search. The USGS tile pack is
base64-embedded, which is why the file is 8 MB.

Tabs: Plan, Conditions, Playbook, Kit, Spots, Rules, **Charters**, Keep?

The Plan tab opens with a **season alert band** — anything opening, closing or
newly running within 45 days — and the Playbook tab opens with the **season
clock**, the full forward calendar with where, gear, permits and a countdown per
season. Both are computed in the file against today's date, so they work
offline and do not go stale between openings.

The Charters tab covers seat-fare drift and head boats from Riviera Beach to Key
West — twelve boats, five of them in the Keys (Sailors Choice at Key Largo,
Miss Islamorada and Captain Michael at Islamorada, Marathon Lady at Vaca Cut,
Gulfstream IV at Key West) — with sailing times computed in the file, fares,
what the ticket includes, the braid-versus-mono rule per boat, booking and
review notes, and a comparison table. Marina pins are teal bow triangles on the map so they never read as a
beach access. Fares and schedules were read on 5 September 2026 and go stale
fast; the tier badge on each card says whether it came from the operator or from
an aggregator.

## `season_alerts.py`

What opens, closes or starts running in the next N days, with where to go, what
gear it needs and which licence or permit it takes. No network, no Drive, no
credentials — pure date arithmetic against a table in the file, so it runs on a
machine with nothing configured:

    python3 season_alerts.py                 alerts for the next 45 days
    python3 season_alerts.py --days 90       a wider horizon
    python3 season_alerts.py --all           the whole clock, soonest change first
    python3 season_alerts.py --date 2027-07-01   pretend it is another day
    python3 season_alerts.py --self-test     the date engine against fixtures

`fishing_outlook.py` renders this block into every daily summary. That matters
because of blocker 3 above: on a day the fishing bot logged nothing, the
conditions line still says "no data yet", but the summary is no longer empty —
the calendar is knowable in advance and needs no bot.

Sixteen seasons. Legal windows (snook, lobster sport and regular, stone crab,
hogfish, Atlantic shallow-water grouper, greater amberjack, the mutton spawning
bag reduction, the shore shark permit) were read off FWC pages and news releases
on 5 September 2026 and are tier B. Bite windows (pompano, blacktip run, mullet
run, tarpon, mackerel and bluefish, the winter charter season, the Keys reef
night bite) are pattern rather than law and are tier C.

The lobster sport season is computed from FWC's rule rather than stored as a
date, so it does not expire: **the last Thursday in July and the Wednesday
before it.** Anchoring on the last *Wednesday* instead is wrong in any year
where July 31 is a Wednesday — 2019 ran July 24-25 for that reason, and 2030 is
the next such year. The self-test pins 2019, 2026, 2027, 2028 and 2030 and
checks the invariants across fifteen years. The same table and the same rule
drive the Season clock in `surf-command.html`; change one, change both.

## `dive-command.html`

Snorkel and scuba from Jupiter to Key West, published as an Artifact at
`claude.ai/code/artifact/433e45a9-da4e-48bc-b010-f574d40ad312`. Sibling of Surf
Command and deliberately built from its parts: `build_dive.py` lifts the inlined
Leaflet stylesheet, the app stylesheet, the base64 USGS tile pack and the tide
table straight out of `surf-command.html` and splices them into `dive_body.html`.
Edit `dive_body.html`, then:

    python3 build_dive.py     # writes dive-command.html

Never hand-edit `dive-command.html`; it is generated and the tile pack alone is
7.9 MB of it.

Tabs: Sites, Outfitters, Rules, Research.

**The colour bands are the organising idea.** Green is under a quarter mile from
shore, amber a quarter to a half, navy beyond — the distance is stored per site
with its provenance and the band derives from it, so a card always says whether
the figure was published or computed from an approximate plotted position.
Cards also carry certification needed against an Open Water card, depth, fees,
parking, dog rules, hours, hazards, sanctuary rules, review themes, address,
phone and a source link. Outfitters are boat operators only; a shop that sells
gear and fills tanks but runs no boat is not on the page.

The Sites tab computes the next four high slacks at NOAA station 8722670, Lake
Worth Pier, from the tide table baked into Surf Command — Blue Heron Bridge is
unfishable and unenjoyable on the wrong tide, and that is the number that
decides the trip.

Research intake lives in Google Drive at **My Drive → Dive Command**, with
`00 — INBOX for Grok`, `01 — Verified` and `02 — Reference and conflicts`. The
intake spec in the inbox names every field the page renders. The Research tab
lists what is still missing, which is mostly charter pricing and itemised rental
costs.
