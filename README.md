# Side Hustle Club

A private community platform for student entrepreneurs. Access-code gated with member, mentor, and admin roles.

## Tech Stack

- **Frontend:** React + Vite
- **Backend:** Supabase (Postgres, RLS, RPC)
- **Hosting:** Vercel

## Local Development

```bash
npm install
npm run dev
```

Runs at `http://localhost:5173`

## Environment Variables

Copy `.env.example` to `.env` and fill in your Supabase credentials:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Deploy to Vercel

1. Push this repo to GitHub
2. Import the repo in [vercel.com/new](https://vercel.com/new)
3. Add environment variables in Vercel dashboard:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy — Vercel auto-detects Vite

## Default Access Codes

| Role   | Code   |
|--------|--------|
| Member | 222222 |
| Mentor | 333333 |
| Admin  | 000000 |

Change these in the Admin Panel after first login.
