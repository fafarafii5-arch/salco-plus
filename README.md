# SALCO⁺ Store Management

A Persian RTL, mobile-first React/Vite starter for SALCO⁺ store operations.

## Features in this starter
- Black and gold responsive dashboard
- Supabase email/password sign-in and branch membership lookup
- Live reads and writes for inventory and cash transactions (subject to database RLS policies)
- Live reads for customers and sales
- Sections for sales, inventory, customers, petty cash and reports

## Run locally
1. Install Node.js 20+.
2. Copy `.env.example` to `.env`.
3. Add the Supabase project URL and **publishable/anon key** from Supabase Project Settings → API.
4. For GitHub Pages, add repository Actions secrets named `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under Settings → Secrets and variables → Actions.
5. Run `npm install`, then `npm run dev`.

## Security
- Never put a Supabase `service_role` key in frontend code.
- Never put a Supabase `service_role` key in frontend code.
- Row Level Security must permit only authenticated members of a branch to read/write that branch's records.
- Sale submission stays disabled until the atomic `record_sale` database function is installed; this avoids partially recording invoices or stock changes.


Deployment configuration is supplied at build time through GitHub Actions repository secrets.
