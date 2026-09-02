# Scheduled Drive summaries

Two scripts. Each reads the latest file a bot already saved to a Google Drive
folder and writes a short summary to the Chief of Staff folder.

| Script | Reads | Writes |
|---|---|---|
| `money_summary.py` | Money Machine folder | `money-summary-YYYY-MM-DD.md` |
| `fishing_outlook.py` | fishing folder | `fishing-outlook-YYYY-MM-DD.md` |

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

**3. The fishing bot has never logged conditions.** This is the significant
one. Nothing in Drive records weather, barometric pressure, moon phase,
sargassum rating or tide. The `Hunting and Fishing` folder holds trip logs
written after the fact, and the logging protocol in that folder
(`LOG 2026-08-31 — trip pattern log protocol`) specifies `Conditions: one line
only (wind, surf, sargassum)`. The most recent trip log's conditions line reads
in full: `dusk, Dania Pier. One line only.` No measurements. Run against Drive
as it stands today, `fishing_outlook.py` will correctly write "no data yet"
every morning, indefinitely, until something starts logging conditions.

**4. There is no spots sheet.** The closest thing is
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
