# চালানোর সংক্ষিপ্ত নির্দেশনা

এই version cloud-based। Deploy করার আগে `SUPABASE_SETUP_BN.md` অনুসরণ করুন।

## Local run

1. `.env.example` copy করে `.env.local` বানান।
2. Supabase Project URL এবং public/anon key বসান।
3. চালান:

```bash
npm install
npm run dev
```

## Vercel deploy

GitHub repository connect করুন এবং Vercel Environment Variables-এ দিন:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Build Command: `npm run build`  
Output Directory: `dist`

`node_modules`, `dist`, `.env`, `.vercel` GitHub-এ push করবেন না; `.gitignore` already configured।
