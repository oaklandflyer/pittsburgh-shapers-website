#!/usr/bin/env python3
"""
Sync the Global Shapers PGH Google Calendar into assets/events/calendar.json.

Runs on a schedule from .github/workflows/sync-calendar.yml. It downloads the
calendar's iCal feed, expands recurring events, keeps only events that have
not ended yet, and writes them as JSON that index.html renders. The website
also hides any event whose end time has passed, so an event drops off the
site the moment it is over even between syncs.

Feed URL: $CALENDAR_ICS_URL if set (e.g. the calendar's "Secret address in
iCal format", stored as a GitHub Actions secret), otherwise the calendar's
public iCal address, which only works when the calendar is shared publicly.

    pip install -r tools/requirements-calendar.txt
    python3 tools/sync-calendar.py                 # fetch and write
    python3 tools/sync-calendar.py --ics file.ics  # use a local file
"""
import argparse
import html
import json
import os
import re
import sys
import urllib.request
from datetime import date, datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import icalendar
import recurring_ical_events

CALENDAR_ID = "s3iuuvb7t4jhod33nt76bn9spo@group.calendar.google.com"
PUBLIC_ICS = ("https://calendar.google.com/calendar/ical/"
              + CALENDAR_ID.replace("@", "%40") + "/public/basic.ics")
TZ = ZoneInfo("America/New_York")
HORIZON_DAYS = 365          # how far ahead to list events
OUT = Path(__file__).resolve().parent.parent / "assets" / "events" / "calendar.json"

URL_RE = re.compile(r"https?://[^\s<>\"')]+")


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "gs-pittsburgh-calendar-sync"})
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read()
    if not body.lstrip().startswith(b"BEGIN:VCALENDAR"):
        sys.exit("The calendar URL did not return an iCal feed. If the calendar is not "
                 "public, set CALENDAR_ICS_URL to its secret iCal address.")
    return body


def to_dt(v):
    """iCal DATE/DATETIME -> aware datetime in Pittsburgh time."""
    if isinstance(v, datetime):
        return (v if v.tzinfo else v.replace(tzinfo=TZ)).astimezone(TZ)
    return datetime.combine(v, time.min, tzinfo=TZ)


def plain_text(desc):
    """Google stores descriptions as light HTML; turn it into plain text."""
    s = str(desc or "")
    s = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</li>", "\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s).replace("\r", "")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def fmt_time(dt):
    return dt.strftime("%-I:%M %p").replace(":00 ", " ")


def display_date(start, end, all_day):
    """Human date line, e.g. 'Sat, Nov 21 · 5 PM – 9:30 PM' or 'Dec 12 – 14'."""
    if all_day:
        last = end - timedelta(days=1)  # iCal all-day end is exclusive
        if last <= start:
            return start.strftime("%a, %b %-d")
        if last.month == start.month:
            return start.strftime("%b %-d") + " – " + last.strftime("%-d")
        return start.strftime("%b %-d") + " – " + last.strftime("%b %-d")
    if start.date() == end.date():
        return start.strftime("%a, %b %-d") + " · " + fmt_time(start) + " – " + fmt_time(end)
    return start.strftime("%b %-d, ") + fmt_time(start) + " – " + end.strftime("%b %-d, ") + fmt_time(end)


def build(ics_bytes, now):
    cal = icalendar.Calendar.from_ical(ics_bytes)
    window_end = now + timedelta(days=HORIZON_DAYS)
    out = []
    for ev in recurring_ical_events.of(cal).between(now - timedelta(days=2), window_end):
        if str(ev.get("STATUS", "")).upper() == "CANCELLED":
            continue
        cls = str(ev.get("CLASS", "")).upper()
        if cls in ("PRIVATE", "CONFIDENTIAL"):
            continue
        raw_start = ev.decoded("DTSTART")
        all_day = not isinstance(raw_start, datetime)
        start = to_dt(raw_start)
        if ev.get("DTEND") is not None:
            end = to_dt(ev.decoded("DTEND"))
        elif ev.get("DURATION") is not None:
            end = start + ev.decoded("DURATION")
        else:
            end = start + (timedelta(days=1) if all_day else timedelta(hours=1))
        if end <= now:
            continue

        uid = str(ev.get("UID", ""))
        desc = plain_text(ev.get("DESCRIPTION"))
        urls = URL_RE.findall(desc) or URL_RE.findall(str(ev.get("DESCRIPTION") or ""))
        link = str(ev.get("URL") or "") or (urls[0] if urls else "")
        # Drop a description that is nothing but the link itself.
        if link and desc.strip() == link:
            desc = ""

        out.append({
            # Overrides (photo, button, hide) are keyed by "key" in calendar-overrides.json.
            "key": uid.split("@")[0],
            "id": uid.split("@")[0],
            "title": str(ev.get("SUMMARY", "")).strip() or "Untitled event",
            "start": start.isoformat(),
            "end": end.isoformat(),
            "allDay": all_day,
            "date": display_date(start, end, all_day),
            "location": str(ev.get("LOCATION", "") or "").strip(),
            "description": desc,
            "link": link,
        })
    out.sort(key=lambda e: (e["start"], e["title"]))
    # Repeating events share a UID; give each occurrence its own id.
    counts = {}
    for e in out:
        counts[e["key"]] = counts.get(e["key"], 0) + 1
    for e in out:
        if counts[e["key"]] > 1:
            e["id"] = e["key"] + "_" + e["start"][:10].replace("-", "")
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ics", help="read this local .ics file instead of downloading")
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()

    if args.ics:
        body = Path(args.ics).read_bytes()
    else:
        body = fetch(os.environ.get("CALENDAR_ICS_URL") or PUBLIC_ICS)

    events = build(body, datetime.now(TZ))
    data = json.dumps(events, indent=2, ensure_ascii=False) + "\n"
    out = Path(args.out)
    if out.exists() and out.read_text(encoding="utf-8") == data:
        print(f"No change ({len(events)} upcoming events).")
        return
    out.write_text(data, encoding="utf-8")
    print(f"Wrote {len(events)} upcoming events to {out}.")


if __name__ == "__main__":
    main()
