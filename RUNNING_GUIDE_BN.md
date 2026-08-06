# SP1 Due Dashboard চালানোর নিয়ম

## React/Vite project

1. কম্পিউটারে Node.js LTS ইনস্টল করুন।
2. project folder-এ Terminal খুলুন।
3. রান করুন:

```bash
npm install
npm run dev
```

4. Terminal-এ দেখানো URL browser-এ খুলুন। সাধারণত `http://localhost:5173`।

## দ্রুত demo দেখতে

`standalone/index.html` browser-এ খুলুন। Windows-এ `start-demo.bat` চালিয়েও demo খোলা যাবে।

## নতুন ledger ব্যবহার

- **Add new due:** পণ্যের নাম/শিরোনাম, টাকার পরিমাণ এবং তারিখ যোগ করুন। এটি বর্তমান বকেয়ার সঙ্গে যোগ হবে।
- **Add payment:** payment-এর শিরোনাম, amount এবং তারিখ যোগ করুন। এটি বর্তমান বকেয়া থেকে বিয়োগ হবে।
- **View statement:** customer-এর সম্পূর্ণ due/payment history এবং running balance দেখাবে।
- **Print / Save PDF:** statement customer-কে পাঠানোর জন্য PDF বানাতে পারবেন।
- **Copy details:** statement text কপি করে WhatsApp/Messenger-এ পাঠানো যাবে।
- ভুল transaction statement থেকে delete করলে balance আবার স্বয়ংক্রিয়ভাবে হিসাব হবে।

## Excel export

React version-এর Excel export-এ দুটি sheet থাকবে:

1. `Customers` — বর্তমান customer balance ও status
2. `Transactions` — সকল due এবং payment ledger entry

## ডেটা সংরক্ষণ

ডেটা browser localStorage-এ থাকে। একাধিক mobile/PC থেকে একই ডেটা ব্যবহার, staff login, cloud backup অথবা automatic reminder দরকার হলে Firebase/Supabase backend যুক্ত করতে হবে।
