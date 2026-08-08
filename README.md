# FlowTrack

A simple training management system — trainees, attendance, assessments, schedule, and reports.

## Stack

- Next.js + TypeScript
- Tailwind CSS + shadcn/ui
- Drizzle ORM + Neon PostgreSQL
- Auth.js (credentials login)
- Recharts
- Deployed on Vercel

All services used are free tier.

## Getting Started

1. Clone the repo
   ```bash
   git clone https://github.com/your-username/flowtrack.git
   cd flowtrack
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Set up environment variables

   Create a `.env` file:
   ```
   DATABASE_URL=your_neon_postgres_url
   AUTH_SECRET=your_auth_secret
   ```

4. Run database migrations
   ```bash
   npm run db:push
   ```

5. Seed the admin account
   ```bash
   npm run db:seed
   ```

6. Start the dev server
   ```bash
   npm run dev
   ```

   Visit `http://localhost:3000`

## Features

- Admin login/logout
- Trainee management
- Attendance tracking
- Assessment scoring
- Training schedule
- Reports with CSV export

## Deployment

### Environment variables

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `AUTH_SECRET` | Auth.js secret — generate with `openssl rand -base64 32` |
| `ADMIN_EMAIL` | Initial admin email (used by seeding) |
| `ADMIN_PASSWORD` | Initial admin password (used by seeding) |
| `ADMIN_NAME` | Initial admin name (used by seeding) |

### Vercel (free tier)

1. Push the repository to GitHub and import it into Vercel.
2. Add the environment variables above in the project settings.
3. Deploy. Database migrations run automatically as part of the build.
4. Seed the initial admin account from your machine against the production database:
   ```bash
   DATABASE_URL=<production-url> ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=<strong-password> ADMIN_NAME=Administrator npm run db:seed
   ```

### Neon (free tier)

Create a free-tier Neon project and copy the connection string into `DATABASE_URL`.

## License

MIT
