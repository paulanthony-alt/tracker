# Life OS

A personal dashboard for school, side businesses, habits, goals, tasks and notes. It runs on your own computer, saves to a local SQLite database, and has a dark interface by default.

## Quick start

Requirements: **Node.js 22.5 or newer** (recommended, for the built-in SQLite). Node 20 also works, but then data is stored in a JSON file instead of SQLite.

```bash
npm install
npm start            # builds the app, then serves it at http://localhost:3000
```

Open **http://localhost:3000**. On first launch you can start empty or explore with sample data (it's labelled, and one click removes it).

For development with hot reload:

```bash
npm run dev          # web app at http://localhost:5173, API on :3001
```

Other scripts: `npm test` (unit tests), `npm run typecheck`, `npm run build`.

## What's inside

| Section | Highlights |
|---|---|
| **Dashboard** | Greeting and date, daily completion ring, alerts, “focus next”, today’s schedule, top 3 priorities, due today and overdue, habits, weekly goals, grades and GPA, active projects, deadlines for the next 2 weeks, reminders, weekly chart, scratchpad. Widgets can be reordered (drag or arrows), resized, hidden and re-added. |
| **Tasks** | One list for personal tasks, assignments and business tasks. A “Do first” view ranks tasks by due date, priority and grade impact, and shows the reasons. Other views: Today, Next 7 days, Overdue, All, Completed, Archived. Filters, search, sorting, tags, categories, repeating tasks, quick capture with natural dates (`fri 5pm !high #tag @class +project`), and CSV export. |
| **Calendar** | Month, week and day views with tasks, assignments, events (including repeating ones), milestones and project deadlines. Drag to reschedule; click a day or hour to add. |
| **School** | Classes with weighted grade categories, assignments by class, missing work, grades by marking period, weighted or unweighted GPA, cumulative GPA with past terms, a GPA goal, a what-if grade calculator, a “what score do I need?” solver, a study planner that schedules sessions before tests, and class notes. |
| **Business** | Projects with status, progress, tasks, milestones and a timeline, contacts, notes and ideas, next action, deadlines, and optional revenue and expense tracking with a monthly chart and CSV export. |
| **Habits & Goals** | Your own daily, weekday-only or times-per-week habits with streaks, best streaks, 7- and 30-day rates, and a heatmap. Weekly, short-term and long-term goals tracked by percent, number, milestones or linked tasks. Journal (mood, energy, wins, gratitude), daily planner with auto-planning, and a weekly review. |
| **Notes** | Markdown notes with clickable checklists, folders, pins, tags, search, templates (`{{date}}` is filled in), links to projects, classes and goals, and an archive. |
| **Assistant** | A daily briefing calculated from your data (no AI needed). An optional AI chat to summarize, plan your day and suggest priorities (needs an API key; see below). |

Anywhere in the app: **⌘/Ctrl K** or **/** to search and run commands, **N** to quick-add, **G then D/T/C/S/B/H/N/A** to jump between sections.

### Everything is entered once

An assignment is a task with a class, and a business task is a task with a project. There is one record, and it shows up on School or Business, Tasks, the Calendar, the Dashboard and in search. Editing it anywhere updates it everywhere.

## How your data is saved

- **Normal mode (`npm start` / `npm run dev`):** data lives in `data/life-os.db`, a SQLite database on your computer. Each change is checked and saved within about half a second. If the server goes away mid-edit, unsent changes are kept in the browser and sent automatically when it comes back.
- **Automatic backups:** each day the server starts, a JSON snapshot is written to `data/backups/` (the last 14 are kept). A safety snapshot is also taken before any import or full erase.
- **Manual backups:** Settings → *Export backup (JSON)* / *Import backup*.
- **Fallback mode:** if you open the built app without its server (for example `dist/` on a static host), it saves to that browser's `localStorage`. The sidebar shows **“Saved in this browser”** when this happens. Limitations: that data stays in that one browser on that one device, clearing site data erases it, and browsers cap storage at roughly 5 MB. Export backups regularly in this mode. If you later run the server against an empty database, browser-only data is moved into it automatically.

The server listens on `127.0.0.1` only, so other devices can't reach your data. To use it from your phone on the same Wi-Fi, set `HOST=0.0.0.0` in `.env`. There is no login, so only do this on a network you trust.

## Integrations

| Feature | Needs | Setup |
|---|---|---|
| Prioritization, grade impact, alerts, daily briefing, auto day-planner, weekly review, search | Nothing | Built in |
| **AI assistant chat** | An Anthropic API key | `cp .env.example .env`, set `ANTHROPIC_API_KEY=…`, restart. Defaults to `claude-opus-5-5`; override with `ANTHROPIC_MODEL`. |
| Google Calendar or school-portal sync | OAuth credentials and a hosted callback | Not included. Add events and grades directly, or import a backup. |

The API key is read only by the server and is **never sent to the browser**. When you send a chat message, a plain-text snapshot of your tasks, events, habits, grades, projects and goals goes to Anthropic's API to generate the answer. The Assistant page has a *“Show exactly what is sent”* toggle so you can inspect it.

## Configuration (`.env`)

```ini
ANTHROPIC_API_KEY=        # optional, enables the AI assistant
ANTHROPIC_MODEL=claude-opus-5-5
PORT=3000                 # production server port
API_PORT=3001             # dev API port
HOST=127.0.0.1            # set 0.0.0.0 to allow other devices on your network
DATA_DIR=data             # where the database and backups live
```

## Architecture

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS and Zustand. Hash routing, so it also works as static files.
- **Backend:** Express 5 on Node, with SQLite through the built-in `node:sqlite` (JSON-file fallback on older Node versions).
- **One data model** in `shared/schema.ts` (Zod). The browser checks every record before saving, and the server checks it again before writing to the database. Invalid data is rejected with a clear error.
- **Sync:** an optimistic UI with a queued, batched sync. Repeated edits to the same record are combined into one write, failed sends are retried with backoff, and a beacon flushes pending changes when the tab closes.

```
shared/schema.ts        data model + validation (used by client and server)
server/                 Express API, SQLite storage, AI proxy
src/lib/                store, persistence, grades, priority, habits, recurrence, insights, quick-add parser
src/components/         UI primitives, editors, task rows, charts, command palette, quick add
src/widgets/            dashboard widgets
src/pages/              Dashboard, Tasks, Calendar, School, Business, Habits, Notes, Assistant, Settings
tests/                  unit tests for the calculation logic
```

### How things are calculated

- **Class average:** with categories, it's the weighted average of the categories that have grades (the weights are re-normalized, as most gradebooks do). Without categories, it's total points earned ÷ possible. Excused work is ignored. If a marking period has no graded work but you entered a known grade, that grade is used. If there's no information, it shows “—” rather than a guess.
- **GPA:** A/A+ 4.0, A- 3.7 … D- 0.7, F 0. Weighted mode adds +0.5 for Honors and +1.0 for AP/IB, and classes are weighted by credits.
- **Grade impact:** the difference in your class average between scoring 100% and 0% on an ungraded assignment.
- **Priority score:** urgency (overdue, today, tomorrow, this week…) + importance (priority) + grade impact (or the assignment type) + a small boost if it's in progress. The reasons are shown next to each task.
- **Streaks:** only scheduled days count, and an unfinished *today* doesn't break a streak. Weekly habits count consecutive weeks that hit the target.
