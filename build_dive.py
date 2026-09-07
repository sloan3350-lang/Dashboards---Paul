#!/usr/bin/env python3
"""Compose dive-command.html from dive_body.html plus assets lifted from
surf-command.html, so the two pages share one visual system and one tile pack."""
import io, re, sys

surf = io.open("surf-command.html", encoding="utf-8").read()
body = io.open("dive_body.html", encoding="utf-8").read()

# 1. the inlined Leaflet stylesheet
m = re.search(r'(<style>/\* Leaflet 1\.9\.4 stylesheet.*?</style>)', surf, re.S)
leaflet_css = m.group(1)

# 2. the app stylesheet that follows it — same dark satellite theme
rest = surf[m.end():]
m2 = re.search(r'(<style>\n:root\{.*?</style>)', rest, re.S)
app_css = m2.group(1)

# 3. the base64 USGS tile pack, one line
m3 = re.search(r'^(const EMBEDDED_TILES=\{.*?\};)$', surf, re.S | re.M)
tiles = m3.group(1)

# 4. tide table and the two helpers the dive page needs
m4 = re.search(r'(const TIDE_BASE=.*?\n\};)', surf, re.S)
tide_data = m4.group(1)
m5 = re.search(r'(function tideDayIndex\(d\)\{.*?\n\}\n)(?=function tideCoverEnd)', surf, re.S)
m6 = re.search(r'(function tideEvents\(stId,from,days\)\{.*?\n\}\n)', surf, re.S)
tides = tide_data + "\n" + m5.group(1) + m6.group(1)

out = (body.replace("{{LEAFLET_CSS}}", leaflet_css)
           .replace("{{APP_CSS}}", app_css)
           .replace("{{TILES}}", tiles)
           .replace("{{TIDES}}", tides))
for tok in ("{{LEAFLET_CSS}}", "{{APP_CSS}}", "{{TILES}}", "{{TIDES}}"):
    if tok in out:
        sys.exit("unsubstituted " + tok)
io.open("dive-command.html", "w", encoding="utf-8").write(out)
print("dive-command.html written, %.1f MB" % (len(out) / 1e6))
