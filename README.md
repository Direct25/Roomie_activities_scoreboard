# 🏠 Roomie Activities Scoreboard

Chores, but make it a competition. Roommates log what they do around the house, earn points, and a weekly leaderboard shows who is carrying the flat. The board resets every Monday, and past winners get crowns.

Mobile-first web app. **Next.js + TypeScript** frontend, **Express + MongoDB** API.

## Features

- **Households with join codes.** One person creates the household, roommates join with a 6-character code.
- **One-tap logging.** Starter chores come with the household (dishes, trash, bathroom...), each worth points. Add your own, set the points, archive the ones you don't need.
- **Weekly leaderboard.** Podium for the top three, ranks, chore counts. The board resets at **Monday 00:00 in your household's timezone**, not the server's.
- **Streaks and crowns.** 🔥 consecutive days with at least one chore. 👑 weekly wins from finished weeks.
- **History.** Browse any past week or all-time standings, plus a "Weeks" tab with each finished week's winner.
- **Fair play.** A roommate can **dispute** an entry, so it stops counting until the disputer takes it back. You can **undo** your own entries for 24 hours. Rapid double taps are ignored.
- **Live-ish.** The board refreshes every 30 seconds and when the tab regains focus.
- **Dark mode** and safe-area support for phones.

## Market research

Before building, I looked at what already exists. This is a snapshot from web research in November 2026, not an exhaustive survey.

| Product | Type | What it does | Notes |
| --- | --- | --- | --- |
| [OurHome](https://www.top10.com/household-chore-apps) | Family app, free | Points and rewards, shared lists, family calendar, task takeover | Built around parents and kids |
| Sweepy | Household app | Daily schedule, points and leaderboards | Points and rewards are rigid ([per a comparison](https://mychoreboard-site.pages.dev/blog/best-free-chore-apps-2025)) |
| Nipto | Game-style chores | Points and competition, supports roommates and split homes | Game-first, less routine logic (same comparison) |
| Flatastic, Flatify, OurFlat | Roommate apps, freemium | Shared shopping list, chores, expenses, bill splitting, chat ([listing](https://alternativeto.net/software/donetick/?p=2)) | Broad "run the flat" apps, with chores as one feature among many |
| ChoreSplit | Gamified, $5/month | Points convert to money, AI photo verification, multi-household | Paid, aimed at money and rewards |
| [Donetick](https://alternativeto.net/software/donetick/?p=2) | Open source | Collaborative chore manager, circles, adaptive scheduling, analytics | Task-manager focus, no scoreboard emphasis |
| [Chore Wars](https://github.com/Ayessaaa/ChoreWars) | Open-source student project | Households, chores with points, leaderboard, feed with photo proof | Closest to this project. Plain JS + Tailwind, admin-only chore management, no weekly reset or disputes |
| [Household Scoreboard Card](https://community.home-assistant.io/t/household-scoreboard-card-gamified-chores-household-task-scoreboard-with-podium-streaks-roulette-levels/1028607) | Home Assistant add-on | XP, ranks, podium for chores | Requires a Home Assistant setup |

Caveat: the MyChoreBoard comparison is published by a competing vendor, so I only used it for feature lists, not for judgments.

### What I took from it

1. **Most of the market is built for parents and kids.** Rewards, allowance, approvals. Adults sharing a flat want bragging rights, not an allowance.
2. **Roommate apps are broad.** Chores sit next to bill splitting and shopping lists. A focused scoreboard is simpler to adopt.
3. **Open-source options are task managers or small demos.** There is room for a clean, well-tested, self-hostable scoreboard.
4. **Gaps this app fills:** a weekly reset in the household's own timezone, crowns for past winners, streaks, and a dispute flow so points stay trustworthy without a parent-style approver.

### Deliberately not built (yet)

Photo proof, money or allowance, push notifications, bill splitting, chore rotation and reminders. These are the obvious next steps, listed under [Roadmap](#roadmap).

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js (App Router), React, TypeScript, Tailwind CSS |
| API | Node.js, Express 5, TypeScript |
| Database | MongoDB with Mongoose |
| Auth | Email + password, bcrypt, JWT bearer tokens |
| Validation | Zod |
| Hardening | Helmet, CORS allow-list, rate limits on sign-in and join, 20 KB body limit |
| Tests | Vitest + Supertest |

## Project structure

```
.
├── client/            Next.js app (UI)
│   ├── app/           layout, global styles, single page
│   ├── components/    Board, Log, Feed and Weeks tabs, auth, onboarding
│   └── lib/           API client, types, formatting helpers
└── server/            Express API
    ├── src/
    │   ├── lib/       weeks (timezone/ISO week maths), scoring (ranks, streaks, crowns)
    │   ├── models/    User, Household, Activity, Entry
    │   ├── routes/    auth, households, activities, entries, leaderboard
    │   └── middleware/
    └── test/          unit + API tests
```

## Getting started

You need Node 20+ and a MongoDB instance (local, or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster).

```bash
# 1. API
cd server
cp .env.example .env        # set MONGODB_URI and a long random JWT_SECRET
npm install
npm run dev                 # http://localhost:4000

# 2. Web app (in a second terminal)
cd client
cp .env.example .env.local  # NEXT_PUBLIC_API_URL=http://localhost:4000
npm install
npm run dev                 # http://localhost:3000
```

Open the app, create an account, start a household, and share the invite code with a roommate.

### Tests

```bash
cd server
npm test
```

The scoring and calendar tests run anywhere. The API tests need a MongoDB at `TEST_MONGODB_URI` (default `mongodb://127.0.0.1:27017/roomie_scoreboard_test`), **wipe all collections in that database**, and are skipped if none is reachable. Point them at a throwaway database only.

### Production

- Server: `npm run build && npm start`. Set `NODE_ENV=production`, `JWT_SECRET` (16+ characters, required), `MONGODB_URI`, and `CLIENT_ORIGIN` (comma-separated list of allowed web origins). Set `TRUST_PROXY=1` behind a reverse proxy so rate limits see real client IPs.
- Client: `npm run build && npm start`, with `NEXT_PUBLIC_API_URL` pointing at the API. This variable is baked in at build time.

## API overview

All routes are under `/api`. Everything except `/auth/register`, `/auth/login` and `/health` needs an `Authorization: Bearer <token>` header.

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/auth/register`, `/auth/login` | Create an account or sign in |
| GET | `/auth/me` | Current user |
| POST | `/households` | Create a household (seeds starter chores) |
| POST | `/households/join` | Join with a code |
| GET | `/households/me` | Household and members |
| POST | `/households/leave` | Leave (the last person out deletes the household) |
| GET/POST | `/activities` | List or add chores |
| DELETE | `/activities/:id` | Archive a chore (history is kept) |
| GET/POST | `/entries` | Activity feed, log a chore |
| DELETE | `/entries/:id` | Undo your own entry (within 24 h) |
| POST | `/entries/:id/dispute`, `/entries/:id/reinstate` | Dispute a roommate's entry, or take a dispute back |
| GET | `/leaderboard?week=2026-W44\|all` | Standings, defaults to the current week |
| GET | `/leaderboard/history` | Winners of finished weeks |

## How scoring works

- Each entry stores a snapshot of the chore's name and points, so editing chores later never rewrites history.
- Entries are tagged with the local day and ISO week **at logging time, in the household's timezone**.
- Ranking: points, then number of chores, then name. Full ties share a rank.
- A **streak** is consecutive local days with a counted entry. It stays alive until you miss a whole day.
- A **crown** goes to the top scorer of each finished week (ties share the win).
- Disputed entries are excluded from every total until reinstated.

## Roadmap

- Photo proof for chores and a "verify" tap from a roommate
- Recurring chores and rotation, with reminders
- Web push notifications ("Ben just did the bathroom 😮")
- Optional prizes for the weekly winner (loser buys pizza)
- Real-time updates over WebSockets instead of polling
- Household owner role (rename, remove members, regenerate the join code)

## License

MIT
