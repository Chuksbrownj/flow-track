# FlowTrack

A simple training management system — students, attendance, weekly score sheets, exams, schedule, and reports.

🔗 **Live:** https://flow-track-gilt.vercel.app

[![CI](https://github.com/Chuksbrownj/flow-track/actions/workflows/ci.yml/badge.svg)](https://github.com/Chuksbrownj/flow-track/actions/workflows/ci.yml)

## Stack

- Next.js + TypeScript
- Tailwind CSS + shadcn/ui
- Drizzle ORM + Neon PostgreSQL
- Auth.js (credentials login)
- Recharts
- Deployed on Vercel

All services used are free tier.

## Roles

| Role | Access |
| --- | --- |
| **Student** | Sign in with registration code + password. Mark attendance, view the schedule and submission forms, take exams, view own scores, edit own email/phone. |
| **Admin (Trainer)** | Manages training: attendance approval, weekly score sheet, schedule, exams, reports. Sees the audit log of student actions. |
| **Master Admin** | Everything an Admin can do, plus staff management and promoting Admins to Master Admin. Sees the full audit log including role promotions. |

Only a Master Admin can promote an Admin to Master Admin.

## Getting Started

1. Clone the repo
   ```bash
   git clone https://github.com/Chuksbrownj/flow-track.git
   cd flow-track
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Set up environment variables

   Create a `.env` file (see `.env.example`):
   ```
   DATABASE_URL=your_neon_postgres_url
   AUTH_SECRET=your_auth_secret
   ```

4. Run database migrations
   ```bash
   npm run db:migrate
   ```

5. Seed the master admin account
   ```bash
   npm run db:seed
   ```

6. Start the dev server
   ```bash
   npm run dev
   ```

   Visit `http://localhost:3000`

## Features

- **Student accounts** — students register with registration code, name, gender and password (no email needed at signup; they add email/phone from their profile). They sign in with their registration code.
- **Roles** — Student, Admin (Trainer), Master Admin, with admin→master-admin promotion.
- **Attendance** — taken only on Mondays, Wednesdays and Fridays. Students self check-in (submission is *pending*), admins approve or reject, and admins can mark/override any student. Students not marked present by end of a training day are auto-marked absent.
- **Weekly score sheet** — one tab per programme course plus a **Grand total** tab. Each course tab shows every week as its own column (admins can add or backfill weeks), with a per-row **Save** and a **Course total** that sums all weeks. The **Grand total** tab adds up every course and shows an **Average %**.
- **Exams** — timed online exams per programme area (separate from the score sheet).
  Questions can be added one by one or imported from CSV, Excel, PDF, Word,
  Markdown and HTML files, with a review step (search, filter, edit, remove)
  before saving and a permanent preview that stays editable while the exam is
  still a draft. Exams run in full-screen with an anti-cheat that auto-submits
  when a trainee presses Escape more than twice or stays away from the screen
  for over 10 seconds. Admins can see who is taking an exam (Trainees dialog),
  reopen an auto-submitted attempt while the exam is still open, and grade
  written answers afterwards.
- **Training schedule** — sessions with an optional Google Form link per day so students submit work externally.
- **Audit log** — every data-changing action is logged with who, what and when. Admins see student actions; master admins see everything.
- **Reports** — summaries with CSV export.
- **Password reset** — by email (staff) or registration code + email on file (students). Staff can also reset a student's password from the Trainees module (fallback for students without an email).

## Tests

- `npm test` — unit tests (vitest). No database needed.
- `npm run test:integration` — integration tests against a real PostgreSQL
  database (Neon). Uses `DATABASE_URL` (loaded from `.env.local`); the
  rate-limit tests skip when it isn't set, the others require it. Covers the
  login rate-limit flow, the admin-created trainee login accounts, and exam
  question editing across draft/open/closed states. Each test cleans up the
  rows it creates.

Both suites run in CI (`.github/workflows/ci.yml`). The integration job
provisions a throwaway Neon branch, applies migrations, runs
`npm run test:integration`, and deletes the branch afterwards. It needs
`NEON_API_KEY` (repository secret) and `NEON_PROJECT_ID` (repository variable);
installing the [Neon GitHub Integration](https://neon.com/docs/guides/github-integration)
sets both automatically.

## Deployment

### Environment variables

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `AUTH_SECRET` | Auth.js secret — generate with `openssl rand -base64 32` |
| `ADMIN_EMAIL` | Master admin email (used by seeding) |
| `ADMIN_PASSWORD` | Master admin password (used by seeding) |
| `ADMIN_NAME` | Master admin name (used by seeding) |
| `APP_URL` | Public base URL used in password reset emails |
| `BREVO_API_KEY` | Brevo API key for password reset / credentials emails |
| `BREVO_FROM_EMAIL` / `BREVO_FROM_NAME` | Sender details for Brevo emails |

> **Admin sign-in note** — the master admin logs in at `/admin/login` with
> the `ADMIN_EMAIL` / `ADMIN_PASSWORD` values (in `.env.local` locally).
> Special characters are part of the password (don't trim them), and it is
> case-sensitive. Seeding only creates the account when it doesn't already
> exist, so changing `ADMIN_PASSWORD` in `.env.local` later does **not**
> update an existing admin's password — use the app's password reset or
> update the hash in the database instead. If login is rejected with "too
> many attempts", wait out the 15-minute rate-limit window; the counter
> resets automatically once the window expires.

### Vercel (free tier)

1. Push the repository to GitHub and import it into Vercel.
2. Add the environment variables above in the project settings.
3. Deploy. Database migrations run automatically as part of the build (`vercel-build` runs `npm run db:migrate`).
4. Seed the master admin account from your machine against the production database:
   ```bash
   DATABASE_URL=<production-url> ADMIN_EMAIL=admin@thrilled.com ADMIN_PASSWORD=<strong-password> ADMIN_NAME=Administrator npm run db:seed
   ```

### Neon (free tier)

Create a free-tier Neon project and copy the connection string into `DATABASE_URL`.

## License

MIT
