# SALCO⁺ Store Management

A Persian RTL, mobile-first React/Vite starter for SALCO⁺ store operations.

## Features in this starter
- Black and gold responsive dashboard
- Best-selling product panel (demo data until database access is configured)
- Sections for sales, inventory, customers, petty cash and reports
- Supabase client configuration via environment variables

## Run locally
1. Install Node.js 20+.
2. Copy `.env.example` to `.env`.
3. Add the Supabase project URL and **publishable/anon key** from Supabase Project Settings → API.
4. Run `npm install`, then `npm run dev`.

## Security
- Never put a Supabase `service_role` key in frontend code.
- The database has Row Level Security enabled; add suitable authenticated-user policies before connecting real store data.
- The current UI uses demo data and does not write to the database yet.
