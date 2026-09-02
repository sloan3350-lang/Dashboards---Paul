#!/usr/bin/env python3
"""
Money summary. Reads the latest file the Money Machine bots saved to Drive and
writes a one-page summary to the Chief of Staff folder.

Reads only. Never moves money, never pays or schedules anything, never contacts
anyone. Where a figure is absent or reads zero, it says so plainly rather than
carrying forward a stale number or inferring one.

Usage:
  python3 money_summary.py                 write to the Chief of Staff folder
  python3 money_summary.py --dry-run       print the summary, write nothing
  python3 money_summary.py --self-test     run extractors against a fixture
"""
from __future__ import annotations

import argparse
import datetime as dt
import re
import sys
import zoneinfo

import drive_common as dc

MINUS = "−"  # the money docs use a true minus sign, not a hyphen
AMOUNT = r"[" + MINUS + r"\-]?\$?[\d,]+(?:\.\d{2})?"

BALANCE_LINE = re.compile(
    r"^[ \t]{2,}(?P<label>\S.*?\S)[ \t]{2,}(?P<amt>" + AMOUNT + r")[ \t]*$"
)
NET_WORTH = re.compile(r"NET\s+WORTH[^\n$]*\$\s*(" + AMOUNT.replace(r"\$?", "") + r")",
                       re.IGNORECASE)
BILL_HINT = re.compile(
    r"\b(autopay|auto-pay|due|lands|statement balance|payment|bill)\b", re.IGNORECASE
)
FLAG_HINT = re.compile(
    r"\b(unlinked|missing|do not retry|bug|stale|contradict|unverified|"
    r"could not verify|absent|flag)\b",
    re.IGNORECASE,
)


def to_number(raw: str):
    cleaned = raw.replace("$", "").replace(",", "").replace(MINUS, "-").strip()
    try:
        return float(cleaned)
    except ValueError:
        return None


def extract_net_worth(text: str):
    m = NET_WORTH.search(text)
    if not m:
        return None
    return to_number(m.group(1)), m.group(1).strip()


def extract_balances(text: str):
    """Pull the indented 'label ....  amount' rows the money docs use."""
    out = []
    for line in text.splitlines():
        m = BALANCE_LINE.match(line)
        if not m:
            continue
        label = m.group("label").strip()
        if not re.search(r"[A-Za-z]", label):
            continue
        if label.lower().startswith(("claude", "board", "priced lots")):
            continue
        value = to_number(m.group("amt"))
        if value is None:
            continue
        out.append({"label": label, "raw": m.group("amt").strip(), "value": value})
    return out


def extract_bills(text: str):
    """Sentences that name a payment and an amount. Reported verbatim.

    Works paragraph by paragraph so a run-on balance table is never mistaken
    for one very long sentence about a bill.
    """
    hits = []
    for para in re.split(r"\n\s*\n", text):
        flat = re.sub(r"\s+", " ", para).strip()
        if not flat:
            continue
        for sentence in re.split(r"(?<=[.!?])\s+", flat):
            s = sentence.strip()
            if len(s) > 300:
                continue  # a table or a paragraph, not a bill line
            if len(re.findall(r"\$[\d,]+", s)) > 3:
                continue  # dense with amounts: a table row set
            if BILL_HINT.search(s) and re.search(r"\$[\d,]+", s):
                if s not in hits:
                    hits.append(s)
    return hits


def extract_flags(text: str):
    """Lines the source itself marks as broken, missing, changed or unverified."""
    hits = []
    for line in text.splitlines():
        s = line.strip().lstrip("-").strip()
        if len(s) < 12:
            continue
        if s.isupper():
            continue  # a section heading, not a finding
        if FLAG_HINT.search(s):
            if s not in hits:
                hits.append(s)
    return hits


def build_report(cfg, src, text, today):
    lines = []
    lines.append(f"# Money summary — {today}")
    lines.append("")
    lines.append(f"Source: **{src['name']}**")
    lines.append(f"Modified: {src['modifiedTime']}  ")
    lines.append(f"Link: {src.get('webViewLink', 'n/a')}")
    lines.append("")
    lines.append(
        "Every figure below is copied from that one file. Nothing is estimated, "
        "carried forward from a previous day, or fetched from anywhere else."
    )
    lines.append("")

    lines.append("## Net worth")
    nw = extract_net_worth(text)
    if nw is None:
        lines.append(
            "**Not stated in the source file.** No net worth figure was found. "
            "Not guessing one."
        )
    elif nw[0] == 0:
        lines.append("**Reads $0.** Treating this as unverified, not as a confirmed zero.")
    else:
        lines.append(f"**${nw[0]:,.0f}** (source text: `{nw[1]}`)")
    lines.append("")

    lines.append("## Account balances")
    balances = extract_balances(text)
    if not balances:
        lines.append("**No balance rows found in the source file.**")
    else:
        zeros = [b for b in balances if b["value"] == 0]
        for b in balances:
            note = "  <-- reads zero, unverified" if b["value"] == 0 else ""
            lines.append(f"- {b['label']}: {b['raw']}{note}")
        if zeros:
            lines.append("")
            lines.append(
                f"**{len(zeros)} balance(s) read zero.** A zero here means the source "
                "said zero. It is not confirmation that the account is empty."
            )
    lines.append("")

    lines.append("## Upcoming bills and payments")
    bills = extract_bills(text)
    if not bills:
        lines.append("**Nothing in the source file names an upcoming payment.**")
    else:
        for b in bills:
            lines.append(f"- {b}")
    lines.append("")

    lines.append("## Flagged broken, missing or changed")
    flags = extract_flags(text)
    if not flags:
        lines.append("**Nothing flagged in the source file.**")
    else:
        for f in flags:
            lines.append(f"- {f}")
    lines.append("")
    lines.append("---")
    lines.append(
        "Generated by money_summary.py. Read-only: no money moved, nothing filed, "
        "no one contacted."
    )
    return "\n".join(lines)


FIXTURE = """FROM CLAUDE - 2026-09-02 daily refresh (post-close)

NET WORTH — $1,323,344

  Live securities, priced at the close                        $580,544
    Schwab taxable …470                                        227,560
    Vanguard Roth …0110                                        272,648
  TSP C Fund (6 Aug lot, no ticker feed)                          9,500
  Linked cash, Plaid (Byron savings …7616 only)                    3.94
  Busey mortgage stub …0010                                       0.00
  FFEL Consolidated                                             −17,760
  Chase Prime Visa …5167 (Gmail statement balance)             −6,712.63

CASH — nothing moved since the 11:02 AM Plaid pull. The Chase Prime Visa …5167
autopay of $6,712.63, full statement balance, lands tomorrow, 3 September.

WHAT IS STILL MISSING
- Chase checking balance. The account every bill pulls from.
- PNC …5738 principal. Absent from Plaid's connection list entirely. Do not retry.
Chase checking …5385 and savings …0230 render as UNLINKED, never as $0.
"""


def self_test():
    print("Running extractors against a fixture drawn from the 2 Sep 2026 refresh.\n")
    nw = extract_net_worth(FIXTURE)
    assert nw and nw[0] == 1323344, f"net worth wrong: {nw}"
    print(f"  net worth            -> ${nw[0]:,.0f}  OK")

    balances = extract_balances(FIXTURE)
    labels = {b["label"]: b["value"] for b in balances}
    assert labels.get("Schwab taxable …470") == 227560.0, labels
    assert labels.get("Linked cash, Plaid (Byron savings …7616 only)") == 3.94, labels
    assert labels.get("FFEL Consolidated") == -17760.0, labels
    assert labels.get("Chase Prime Visa …5167 (Gmail statement balance)") == -6712.63, labels
    assert labels.get("Busey mortgage stub …0010") == 0.0, labels
    print(f"  balances             -> {len(balances)} rows, signs and cents correct  OK")
    print("  negative liabilities -> true minus sign handled  OK")
    print("  zero balance         -> detected and will be called out  OK")

    bills = extract_bills(FIXTURE)
    assert any("autopay of $6,712.63" in b for b in bills), bills
    assert all(len(b) <= 300 for b in bills), "a table leaked into bills"
    assert not any("Vanguard Roth" in b for b in bills), "balance table leaked into bills"
    print(f"  upcoming bills       -> {len(bills)} found, incl. the 3 Sep autopay  OK")

    flags = extract_flags(FIXTURE)
    assert any("Do not retry" in f for f in flags), flags
    assert any("UNLINKED" in f for f in flags), flags
    assert "WHAT IS STILL MISSING" not in flags, "section heading leaked into flags"
    print(f"  flags                -> {len(flags)} found, incl. UNLINKED and Do-not-retry  OK")

    empty = build_report({}, {"name": "x", "modifiedTime": "t"}, "nothing here", "2026-09-02")
    assert "Not stated in the source file" in empty
    assert "No balance rows found" in empty
    print("  empty source         -> says so plainly, invents nothing  OK")

    print("\n  Report preview from fixture")
    print("  " + "-" * 60)
    for ln in build_report({}, {"name": "fixture", "modifiedTime": "2026-09-02T21:10:24Z"},
                           FIXTURE, "2026-09-02").splitlines():
        print("  " + ln)
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
    filename = f"money-summary-{today}.md"

    service = dc.get_service(cfg)
    src = dc.latest_file(
        service,
        cfg["money"]["source_folder_id"],
        skip_name_contains=cfg["money"].get("skip_name_contains", []),
    )

    if src is None:
        body = (
            f"# Money summary — {today}\n\n"
            f"**No file found in the {cfg['money']['source_folder_name']} folder.**\n\n"
            "Nothing was read, so nothing is reported. No figures are carried "
            "forward from a previous day.\n"
        )
    else:
        text = dc.fetch_text(service, src["id"], src["mimeType"])
        if text is None:
            body = (
                f"# Money summary — {today}\n\n"
                f"Latest file is **{src['name']}** ({src['mimeType']}), which has no "
                "text form this script can read. Nothing is being guessed from the "
                "filename.\n"
            )
        else:
            body = build_report(cfg, src, text, today)

    if args.dry_run:
        print(body)
        return 0

    out = dc.write_markdown(service, cfg["output"]["chief_of_staff_folder_id"],
                            filename, body)
    print(f"Wrote {out['name']} -> {out.get('webViewLink')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
