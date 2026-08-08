# SP1 Global Due Dashboard — Cloud Edition

React + TypeScript + Vite due/payment ledger for SP1 Global Enterprise.

## What changed in Cloud Edition

- Supabase cloud database instead of browser-only localStorage
- Admin email/password login
- Same ledger across phone/PC/tablet
- Auto sync every 15 seconds + refresh on window focus
- Customer-wise due/payment transaction history
- Running statement suitable for screenshot/print/PDF
- New due with product/title + amount + date
- Payment with title + amount + date
- Excel backup export/import
- Bengali/English toggle
- Updated left-aligned customer UI
- Favicon included
- Vercel TypeScript `TS5096` fix included

## Initial data

`sample-data/SP1-Due-Ledger-2026-08-08.xlsx`

- 25 customers
- 37 ledger transactions
- ৳128,650 current outstanding

## Setup

Read `SUPABASE_SETUP_BN.md` and run `supabase/setup.sql` in a new Supabase project before deploying.

Local development:

```bash
cp .env.example .env.local
npm install
npm run dev
```

Production build:

```bash
npm run build
```
