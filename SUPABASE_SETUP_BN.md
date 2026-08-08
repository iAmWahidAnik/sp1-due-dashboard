# SP1 Due Dashboard — Supabase + Vercel Setup

এই version-এ customer/due/payment data আর browser localStorage-এ primary data হিসেবে রাখা হয় না। Data Supabase cloud database-এ থাকবে, তাই একই login দিয়ে PC/phone/tablet-এ একই updated ledger দেখা যাবে।

## এই package-এর base data

- Updated source: `sample-data/SP1-Due-Ledger-2026-08-08.xlsx`
- Customers: 25
- Transactions: 37
- Current outstanding total: ৳128,650
- Payment এবং নতুন due history দুটোই included

## 1) Supabase project তৈরি করুন

1. Supabase Dashboard-এ নতুন project তৈরি করুন।
2. Project ready হলে **SQL Editor** খুলুন।
3. এই project-এর `supabase/setup.sql` file-এর সম্পূর্ণ SQL copy করে Run করুন।

এই SQL:
- `customers` table বানাবে
- `transactions` table বানাবে
- Row Level Security (RLS) চালু করবে
- শুধু authenticated user-কে read/write permission দেবে
- Updated Excel-এর 25 customer + 37 transaction initial data হিসেবে insert করবে

> `setup.sql`-এর seed insert `ON CONFLICT DO NOTHING` ব্যবহার করে। তবুও live system চালু হওয়ার পরে অপ্রয়োজনে initial seed script আবার চালাবেন না।

## 2) Admin user তৈরি করুন

Supabase Dashboard → **Authentication → Users** থেকে আপনার admin email/password user তৈরি করুন।

Website-এ public signup button নেই। Supabase dashboard থেকে যাদের user account তৈরি করবেন, তারাই login করতে পারবে।

## 3) Supabase API values নিন

Supabase Project Settings-এর API section থেকে নিচের দুইটি value নিন:

- Project URL
- anon/public key (নতুন dashboard terminology-তে publishable key হতে পারে)

**Service Role / secret key কখনো frontend বা Vercel-এর `VITE_...` variable-এ দেবেন না।**

## 4) Vercel Environment Variables

Vercel → Project → Settings → Environment Variables-এ যোগ করুন:

```text
VITE_SUPABASE_URL = https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY = YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
```

Production, Preview এবং Development যেগুলোতে প্রয়োজন সেখানে enable করুন। তারপর **Redeploy** দিন।

## 5) GitHub-এ যেগুলো push করবেন

Project-এর `.gitignore` already updated। `node_modules`, `dist`, `.vercel`, `.env` push হবে না।

GitHub-এ অবশ্যই রাখবেন:

```text
src/
public/
supabase/setup.sql
package.json
index.html
tsconfig*.json
vite.config.ts
.env.example
.gitignore
```

## 6) Vercel Build Settings

সাধারণত Vercel Vite detect করবে। Manual হলে:

```text
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

আগের `TS5096 allowImportingTsExtensions` issue fix করা হয়েছে: `tsconfig.node.json`-এ `noEmit: true` আছে।

## 7) Multi-device sync কীভাবে কাজ করবে

Login করার পরে website Supabase থেকে data load করবে।

- Add customer → cloud database
- Add new due → cloud transaction
- Payment received → cloud transaction
- Edit/Delete → cloud database
- Customer statement → cloud ledger থেকে generated
- Excel export → current cloud data
- Excel import → confirmation নিয়ে পুরো cloud ledger replace করতে পারে
- অন্য device open থাকলে প্রতি 15 seconds-এ refresh করবে
- Browser/window-এ ফিরে এলে সাথে সাথে refresh করবে
- Header-এর cloud refresh button দিয়েও manual sync করা যায়

## 8) পুরোনো device-এর localStorage data

এই নতুন cloud version পুরোনো browser localStorage-কে source of truth হিসেবে ব্যবহার করে না। Updated Excel sheet-টিই initial cloud data হিসেবে `setup.sql`-এ দেওয়া হয়েছে। তাই পুরোনো device-specific data mismatch problem আর থাকবে না।

## 9) Future backup

Dashboard থেকে নিয়মিত **Export Excel** করলে `Customers` এবং `Transactions`—দুইটি sheet পাবেন। প্রয়োজন হলে সেই backup আবার Import Excel দিয়ে restore করা যাবে। Import করলে existing cloud ledger replace হবে, তাই confirmation দেখাবে।
