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

Deployed on Vercel with a Neon PostgreSQL database. Set the same environment variables in the Vercel project settings.

## License

MIT
