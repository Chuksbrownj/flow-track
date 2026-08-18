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
- **Weekly score sheet** — admins enter scores out of 100 per programme area (Graphic Design, Data Analysis, 2D/3D Animation, HP LIFE); grand total and percentage are calculated automatically.
- **Exams** — timed online exams per programme area (separate from the score sheet).
- **Training schedule** — sessions with an optional Google Form link per day so students submit work externally.
- **Audit log** — every data-changing action is logged with who, what and when. Admins see student actions; master admins see everything.
- **Reports** — summaries with CSV export.
- **Password reset** — by email (staff) or registration code + email on file (students). Staff can also reset a student's password from the Trainees module (fallback for students without an email).

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
