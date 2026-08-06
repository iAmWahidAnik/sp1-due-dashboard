# SP1 Due Collection Dashboard — Ledger Edition

A light-theme bilingual React dashboard for tracking customer dues, payments and follow-up priorities.

## Main features

- English / বাংলা language toggle
- Customer-wise transaction ledger
- Add a new due with product/title, amount, date and note
- Add a partial or full payment with title, amount, date and note
- Outstanding balance recalculates automatically
- Clean customer statement with running balance
- Copy statement text, print it or save it as PDF
- Delete an incorrect transaction and recalculate the account
- View outstanding, paid or all customer accounts
- Follow-up priority based on transaction age and outstanding balance
- Search, status/priority filters and sorting
- Excel import and two-sheet Excel export (Customers + Transactions)
- Browser localStorage persistence
- Responsive desktop/mobile layout
- Initial data imported from `Sp1 - Due List (13 July, 2026).xlsx`

## Run locally

```bash
npm install
npm run dev
```

Open the URL shown by Vite, normally `http://localhost:5173`.

## Quick standalone demo

Open `standalone/index.html` directly in a browser, or run `start-demo.bat` on Windows.

## Production build

```bash
npm run build
npm run preview
```

The production files will be created in the `dist` folder.

## Data storage

This version stores data in the current browser. For shared multi-device access, user accounts, cloud backup, WhatsApp/SMS reminders or multiple staff logins, connect it to Firebase, Supabase or another backend.
