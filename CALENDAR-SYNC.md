# Events ← Google Calendar

The Events section on the home page comes from the **Global Shapers PGH**
Google Calendar. Nobody needs to add or remove events by hand any more.

- **Add / change / cancel an event** → do it in Google Calendar. A GitHub
  Action (`.github/workflows/sync-calendar.yml`) checks the calendar every
  hour and updates `assets/events/calendar.json`.
- **Event is over** → it disappears from the site at its end time (the page
  filters on the end time, so it doesn't wait for the next sync).
- **Link in the event description** → becomes an "Event details" button.
- **Photo, custom button, or hide an event** → `/admin/events.html`, step 2.
  These extras are saved in `assets/events/calendar-overrides.json` and are
  cleaned up automatically once the event has passed.
- **Something that isn't a calendar event** → `/admin/events.html`, step 3
  ("Extra events"). Set "Hide after" so it comes down by itself.

## One-time setup

The sync reads the calendar's iCal feed, so one of these must be true:

1. **The calendar is public** (simplest). Google Calendar → the calendar's
   *Settings and sharing* → *Access permissions for events* → tick
   **Make available to public** with **See all event details**.
2. **Or** keep it private and give the sync its secret feed: copy *Secret
   address in iCal format* from the same settings page and save it in GitHub
   → repo *Settings* → *Secrets and variables* → *Actions* → new secret
   named `CALENDAR_ICS_URL`.

GitHub Actions must be enabled for the repo. Scheduled runs happen on the
default branch only. To run it right away, use **Sync now** on the admin page
(the token needs *Actions: Read and write*) or *Actions → Sync Google
Calendar events → Run workflow* on GitHub.

Run it locally:

```bash
pip install -r tools/requirements-calendar.txt
python3 tools/sync-calendar.py
```
