# TSUE Timetable

A small local Node.js app for [tsue.edupage.org](https://tsue.edupage.org/timetable/) that answers two questions:

1. **When does my class start?** — search your group by name, see the current/next lesson and the full weekly schedule.
2. **Which rooms are free?** — pick a date and time range (optionally filter by room name) and see which classrooms are free or busy.

It reads the same public data the university's own timetable page uses (no login, no scraping HTML — a couple of documented-nowhere-but-public JSON endpoints the page itself calls).

## Setup

```
npm install
npm start
```

Then open http://localhost:3000.

The first request triggers a fetch of the full timetable from EduPage (a few MB, takes a couple of seconds) and caches it to `data/cache.json`. After that it's served from the cache and refreshed automatically in the background once it's older than `CACHE_MAX_AGE_HOURS` (default 12h).

To force a refresh without starting the server:

```
npm run refresh
```

## How it works

- `src/edupageClient.js` calls the two RPC endpoints the site's own timetable viewer uses (`getTTViewerData` to find the currently active timetable revision, `regularttGetData` to pull its full data: classes, classrooms, subjects, teachers, and the "cards" that place a lesson at a specific weekday/period/room).
- `src/buildCache.js` flattens that into a compact list of "occurrences" (one row per class + weekday a lesson happens), cached to `data/cache.json`.
- `src/dataStore.js` answers queries against that cache: class search, weekly schedule, next/current class, free rooms.
- `src/time.js` handles all date math. "Now" is always read in the Asia/Tashkent timezone (via `Intl`), regardless of what timezone the machine running the app is set to.

### The A/B week rotation

Some lessons only happen on alternating weeks ("week A" / "week B" — visible in the schedule table). The app computes which week is currently active by counting weeks since the active timetable's start date, so it stays correct as the term goes on.

### Known limitations

- Only the **regular/recurring** weekly schedule is available publicly. One-off substitutions, cancellations, or room changes (the "Замены" page) require a logged-in session and aren't reflected here.
- Class ("group") names are the same ones shown on the university's own timetable site (e.g. `MO-900/26`) — search is a plain substring match, not an exact ID.
- Room names come straight from EduPage (e.g. `8-202-70`), not simplified to bare numbers.

## Configuration

Environment variables (all optional):

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Web server port |
| `EDUPAGE_SUBDOMAIN` | `tsue` | The `<subdomain>` in `<subdomain>.edupage.org` |
| `CACHE_MAX_AGE_HOURS` | `12` | How long the cache is used before auto-refreshing |

## API

All endpoints return JSON.

- `GET /api/classes?q=MO-900` — search groups by name.
- `GET /api/classes/:id/schedule` — full weekly schedule for a group.
- `GET /api/classes/:id/next` — current + next lesson for a group, relative to real time in Tashkent.
- `GET /api/rooms?q=202` — search rooms by name.
- `GET /api/rooms/free?date=2026-09-24&from=10:00&to=11:00&q=202` — free/busy rooms in that window (all params optional; default to "now" in Tashkent, filter to all rooms).
- `POST /api/refresh` — force an immediate re-fetch from EduPage.
