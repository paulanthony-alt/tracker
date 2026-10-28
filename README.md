# Vyro

A personal dashboard for school, side businesses, habits, goals, tasks and notes, with a dark interface by default.

It runs two ways:

- **On all your devices (Firebase, free):** one password unlocks the same data on your laptop, phone and tablet, with live sync and offline support. See [Use it on all your devices](#use-it-on-all-your-devices-firebase-free).
- **On one computer:** a local server with a SQLite database. See [Quick start](#quick-start).

## Use it on all your devices (Firebase, free)

This uses Firebase's free **Spark** plan, which needs no credit card. Your data lives in your own Firebase project. You sign in with a **password only**; the app uses one fixed account email behind the scenes, so you never type an email.

**One-time setup (about 10 minutes)**

1. Go to [console.firebase.google.com](https://console.firebase.google.com), click **Create a project**, and give it a name (e.g. `vyro`). You can turn Google Analytics off. New projects start on the free Spark plan.
   **Use a new project just for Vyro.** Deploying into a project another app already uses would replace that app's website and security rules.
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.** Turn on only the first switch, not "Email link".
3. **Build → Firestore Database → Create database.** Pick a location near you and start in **production mode**. The app's own security rules replace the defaults when you deploy.
4. **Project settings** (gear icon) **→ General → Your apps → Web (`</>`)**. Register an app called "Vyro", then copy `apiKey`, `authDomain`, `projectId` and `appId` from the config it shows.
5. On your computer:
   ```bash
   git clone https://github.com/paulanthony-alt/tracker.git
   cd tracker
   cp .env.example .env      # paste the values into the VITE_FIREBASE_* lines (Windows: copy .env.example .env)
   npm install
   npx firebase login        # opens a browser to sign in to your Google account
   npm run deploy            # builds the app and publishes it with the security rules
   ```
6. Open **`https://<your-project-id>.web.app`**, choose **"First time here? Set your password"**, and set a password of at least 8 characters. **Do this right after deploying.** Once a password is set, nobody can set another.

**On every other device**, open the same address and type your password. On a phone, use your browser's *Add to Home Screen* to get an app icon.

**Good to know**

- **Live sync:** a change on one device appears on the others within a second or two, no refresh needed.
- **Offline:** each device keeps a copy, so the app opens and saves without internet and syncs when you're back online. The sidebar shows *Offline — saved on device*.
- **Settings → Account** lets you change your password or sign out. Signing out removes the offline copy from that device, which is useful on a shared computer.
- **Forgot your password?** In the Firebase console go to **Authentication → Users**, delete the user (`vyro-owner@example.com`), then open the app and set a new password. Your data is stored separately from the account, so nothing is lost.
- **Security:** `firestore.rules` lets only that one account read or write, and only inside the app's own data. Firebase also slows down repeated wrong-password attempts. The `VITE_FIREBASE_*` values aren't secrets; they only say which project to talk to.
- **Free limits:** the Spark plan's daily database and hosting allowances are far above what one person's dashboard uses.
- **Notifications on your phone when Vyro is closed** need a few extra steps. See [Notifications](#notifications).
- **AI chat isn't available on the free plan.** Keeping an API key secret needs server code (Cloud Functions), which requires the paid Blaze plan. Everything else works, including the rule-based daily briefing, auto day-planner and weekly review. Run the local server version if you want the chat.
- **Moving existing data:** in the old version go to **Settings → Export backup**, then in the Firebase version go to **Settings → Import backup**.
- **Updating later:** in the `tracker` folder, run `git pull`, then `npm run deploy`.
- **This repository is public:** anyone can read the code, but your data, your password, `.env` and the GitHub secret are never in it. `.env` is ignored by Git, and the reminder job's public logs show only counts and times, never your reminder text.

**Try it without a Firebase project:** `npm run dev:emulator` runs the whole Firebase setup locally using Google's emulators (requires Java), at http://localhost:5173.

## Notifications

**While Vyro is open** (any version, no setup), reminders, upcoming events, tasks with a due time, a morning summary and an optional evening habit nudge pop up as cards inside the app at the exact time. If you allow it, they also appear as system notifications, so you see them from other tabs. Important reminders stay on screen until you tap Done or Snooze. Anything that came due while the app was closed is shown when you reopen it. Choose what you get in **Settings → Notifications**.

**On your phone when Vyro is closed** (Firebase version, free) uses push notifications. Firebase can deliver push for free but can't *schedule* it on the free plan, so a small script on GitHub Actions checks every 10 minutes and pushes anything due before the next check. Notifications can arrive a few minutes early, and they always show the exact time. GitHub Actions is free for public repositories like this one. GitHub's scheduled runs are sometimes delayed by a few minutes at busy times.

**One-time push setup** (after the Firebase setup above):

1. **Firebase console → Project settings → General → Your apps:** copy `messagingSenderId` into `.env` as `VITE_FIREBASE_MESSAGING_SENDER_ID`.
2. **Project settings → Cloud Messaging → Web Push certificates → Generate key pair:** copy the key into `.env` as `VITE_FIREBASE_VAPID_KEY`.
3. Run `npm run deploy` again.
4. **Project settings → Service accounts → Generate new private key.** This downloads a JSON file. In GitHub, open the repo → **Settings → Secrets and variables → Actions → New repository secret**, name it `FIREBASE_SERVICE_ACCOUNT`, paste the **whole file's contents**, save, then **delete the downloaded file**. It's a master key to your Firebase project; only GitHub should keep it.
5. Test it: GitHub → **Actions → Vyro reminders → Run workflow**. The log shows how many notifications it found and sent (for privacy it never prints reminder text).
6. On each phone or computer, open Vyro → **Settings → Notifications → Push to this device → Turn on**, and allow notifications.
   - **iPhone / iPad (iOS 16.4+):** first open Vyro in Safari, tap **Share → Add to Home Screen**, then open Vyro from the home-screen icon and turn push on there. Apple only allows web push for home-screen apps.
   - **Android:** works in Chrome directly. Adding to the home screen is optional.

If a run fails with an error mentioning the Cloud Messaging API, enable **Firebase Cloud Messaging API (V1)** under Project settings → Cloud Messaging.

GitHub pauses scheduled jobs in public repositories after 60 days without any commits. If reminders stop arriving, open **Actions → Vyro reminders** and click **Enable workflow**.

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

Other scripts: `npm test` (unit tests), `npm run test:rules` (Firebase security-rules and push-sender tests, needs Java), `npm run typecheck`, `npm run build`, `npm run deploy` (Firebase).

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

- **Firebase mode** (when `VITE_FIREBASE_*` is set in `.env`): data lives in Cloud Firestore at `vyro/owner/…` in your project, with an offline copy on each signed-in device. Back up whenever you like with *Export backup*.

- **Local server mode (`npm start` / `npm run dev`):** data lives in `data/vyro.db`, a SQLite database on your computer. Each change is checked and saved within about half a second. If the server goes away mid-edit, unsent changes are kept in the browser and sent automatically when it comes back.
- **Automatic backups:** each day the server starts, a JSON snapshot is written to `data/backups/` (the last 14 are kept). A safety snapshot is also taken before any import or full erase.
- **Manual backups:** Settings → *Export backup (JSON)* / *Import backup*.
- **Fallback mode:** if you open the built app without its server (for example `dist/` on a static host), it saves to that browser's `localStorage`. The sidebar shows **“Saved in this browser”** when this happens. Limitations: that data stays in that one browser on that one device, clearing site data erases it, and browsers cap storage at roughly 5 MB. Export backups regularly in this mode. If you later run the server against an empty database, browser-only data is moved into it automatically.

The server listens on `127.0.0.1` only, so other devices can't reach your data. To use it from your phone on the same Wi-Fi, set `HOST=0.0.0.0` in `.env`. There is no login, so only do this on a network you trust.

## Integrations

| Feature | Needs | Setup |
|---|---|---|
| Prioritization, grade impact, alerts, daily briefing, auto day-planner, weekly review, search | Nothing | Built in |
| **AI assistant chat** | An Anthropic API key and the local server | `cp .env.example .env`, set `ANTHROPIC_API_KEY=…`, restart. Defaults to `claude-opus-5-5`; override with `ANTHROPIC_MODEL`. Not available in the free Firebase setup (it would need paid Cloud Functions). |
| Google Calendar or school-portal sync | OAuth credentials and a hosted callback | Not included. Add events and grades directly, or import a backup. |

The API key is read only by the server and is **never sent to the browser**. When you send a chat message, a plain-text snapshot of your tasks, events, habits, grades, projects and goals goes to Anthropic's API to generate the answer. The Assistant page has a *“Show exactly what is sent”* toggle so you can inspect it.

## Configuration (`.env`)

```ini
VITE_FIREBASE_API_KEY=    # Firebase mode: the four values from your web app config
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MESSAGING_SENDER_ID=  # optional: push notifications (see Notifications)
VITE_FIREBASE_VAPID_KEY=
ANTHROPIC_API_KEY=        # local server only: enables the AI assistant
ANTHROPIC_MODEL=claude-opus-5-5
PORT=3000                 # production server port
API_PORT=3001             # dev API port
HOST=127.0.0.1            # set 0.0.0.0 to allow other devices on your network
DATA_DIR=data             # where the database and backups live
```

## Architecture

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS and Zustand. Hash routing, so it also works as static files.
- **Backend:** either Firebase (Auth + Cloud Firestore + Hosting, free plan), or Express 5 on Node with SQLite through the built-in `node:sqlite` (JSON-file fallback on older Node versions). Firebase is loaded only in Firebase builds.
- **One data model** in `shared/schema.ts` (Zod). The browser checks every record before saving, and the server checks it again before writing to the database. Invalid data is rejected with a clear error.
- **Sync:** an optimistic UI with a queued, batched sync. Repeated edits to the same record are combined into one write, failed sends are retried with backoff, and a beacon flushes pending changes when the tab closes.

```
shared/schema.ts        data model + validation (used by client and server)
server/                 Express API, SQLite storage, AI proxy (local server mode)
firestore.rules         Firebase security rules (owner-only access)
firebase.json           Firebase Hosting + emulator config
scripts/deploy.mjs      `npm run deploy`: build + publish to Firebase
scripts/reminders/      push sender run by .github/workflows/reminders.yml
shared/notifications.ts what's due when (used by the app and the push sender)
public/sw.js            service worker: shows push notifications
src/lib/                store, persistence, grades, priority, habits, recurrence, insights, quick-add parser
src/components/         UI primitives, editors, task rows, charts, command palette, quick add
src/widgets/            dashboard widgets
src/pages/              Dashboard, Tasks, Calendar, School, Business, Habits, Notes, Assistant, Settings
tests/                  unit tests for the calculation logic; tests/firebase/ for security rules
```

### How things are calculated

- **Class average:** with categories, it's the weighted average of the categories that have grades (the weights are re-normalized, as most gradebooks do). Without categories, it's total points earned ÷ possible. Excused work is ignored. If a marking period has no graded work but you entered a known grade, that grade is used. If there's no information, it shows “—” rather than a guess.
- **GPA:** A/A+ 4.0, A- 3.7 … D- 0.7, F 0. Weighted mode adds +0.5 for Honors and +1.0 for AP/IB, and classes are weighted by credits.
- **Grade impact:** the difference in your class average between scoring 100% and 0% on an ungraded assignment.
- **Priority score:** urgency (overdue, today, tomorrow, this week…) + importance (priority) + grade impact (or the assignment type) + a small boost if it's in progress. The reasons are shown next to each task.
- **Streaks:** only scheduled days count, and an unfinished *today* doesn't break a streak. Weekly habits count consecutive weeks that hit the target.
