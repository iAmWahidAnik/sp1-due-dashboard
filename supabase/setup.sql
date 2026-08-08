-- SP1 Global Due Dashboard - Supabase setup
-- Base data: SP1-Due-Ledger-2026-08-08.xlsx
-- Safe to run on a NEW Supabase project. Seed inserts use ON CONFLICT DO NOTHING.

create extension if not exists pgcrypto;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  type text not null check (type in ('due', 'payment')),
  title text not null,
  amount numeric(14,2) not null check (amount > 0),
  transaction_date date not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_transactions_customer_id on public.transactions(customer_id);
create index if not exists idx_transactions_date on public.transactions(transaction_date desc);

alter table public.customers enable row level security;
alter table public.transactions enable row level security;

drop policy if exists "authenticated_full_access_customers" on public.customers;
create policy "authenticated_full_access_customers"
on public.customers
for all
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated_full_access_transactions" on public.transactions;
create policy "authenticated_full_access_transactions"
on public.transactions
for all
to authenticated
using (true)
with check (true);

-- Atomic Excel restore helper used by the dashboard Import Excel feature.
create or replace function public.replace_ledger(
  p_customers jsonb,
  p_transactions jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.customers;

  insert into public.customers (id, name, phone, note, created_at, updated_at)
  select
    (item->>'id')::uuid,
    item->>'name',
    nullif(item->>'phone', ''),
    nullif(item->>'note', ''),
    coalesce((item->>'created_at')::timestamptz, now()),
    coalesce((item->>'updated_at')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_customers, '[]'::jsonb)) as item;

  insert into public.transactions (id, customer_id, type, title, amount, transaction_date, note, created_at)
  select
    (item->>'id')::uuid,
    (item->>'customer_id')::uuid,
    item->>'type',
    item->>'title',
    (item->>'amount')::numeric,
    (item->>'transaction_date')::date,
    nullif(item->>'note', ''),
    coalesce((item->>'created_at')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_transactions, '[]'::jsonb)) as item;
end;
$$;

revoke all on function public.replace_ledger(jsonb, jsonb) from public;
grant execute on function public.replace_ledger(jsonb, jsonb) to authenticated;

-- Initial customers from the updated Excel backup.
insert into public.customers (id, name, phone, note, created_at, updated_at)
values
('f3350515-a719-5844-a159-a90ddebbdfc2', 'Mukul (Vai Vai Automobiles)', null, null, '2026-08-05T00:00:00+00', '2026-08-08T04:00:00+00'),
('beb87ef8-ba65-579f-a56d-2fd4ea20c165', 'Juyel Rana', null, null, '2026-08-05T00:00:00+00', '2026-08-08T04:00:00+00'),
('0187338e-baab-5d61-bd24-1bd7d973762e', 'Bappy', null, null, '2026-03-15T00:00:00+00', '2026-08-08T04:00:00+00'),
('48eff30a-33cf-5ad3-a72f-99dd4b6b6734', 'Masud Motors (amtola)', null, null, '2026-07-15T00:00:00+00', '2026-08-08T04:00:00+00'),
('ac8820e5-f8bc-5cd9-aeee-b7b1df22350e', 'Sagor - 14 No', null, null, '2026-07-18T00:00:00+00', '2026-08-08T04:00:00+00'),
('d05bc317-b4a3-5279-8aae-790c99817b75', 'Alomgir', null, null, '2026-08-03T00:00:00+00', '2026-08-08T04:00:00+00'),
('b4fbf567-8bd1-5e9b-a168-2183c3ee7f99', 'Sumon / Mohon (SM Motors)', null, null, '2026-08-05T00:00:00+00', '2026-08-08T04:00:00+00'),
('85481f8a-ac21-5faa-a1cb-b57db3955d89', 'Mohin (kabir - Alamgir)', null, null, '2026-07-17T00:00:00+00', '2026-08-08T04:00:00+00'),
('7b3ddb0f-520a-5bcd-867b-a0f1f1bdcc6e', 'Hafiz', null, null, '2026-05-04T00:00:00+00', '2026-08-08T04:00:00+00'),
('f845ab10-1d5b-5fb1-9849-389d9de2aa15', 'Raisa ENT', null, null, '2026-05-07T00:00:00+00', '2026-08-08T04:00:00+00'),
('09b9d09d-af69-5ba0-9a3d-ba659830595e', 'Sojol', null, null, '2026-07-21T00:00:00+00', '2026-08-08T04:00:00+00'),
('718376cc-a00f-5695-a0f0-acbff6bb3fb3', 'Ibrahim (Bike Bari)', null, null, '2026-05-13T00:00:00+00', '2026-08-08T04:00:00+00'),
('2156d776-b74f-5670-a987-341a7beb9ddc', 'Faruk (Mamun Vai)', null, null, '2026-08-04T00:00:00+00', '2026-08-08T04:00:00+00'),
('ef46c07f-66f8-53f5-a840-2a93615d3516', 'Akbor (Sohel - Sahin)', null, null, '2026-07-28T00:00:00+00', '2026-08-08T04:00:00+00'),
('a3ce38bf-05c0-5d39-ad61-eb04ae12085c', 'Mamun (kabir)', null, null, '2026-06-04T00:00:00+00', '2026-08-08T04:00:00+00'),
('a37564ff-b09a-5712-a916-ce209f8c760d', 'Kabir (Hasan)', null, null, '2026-07-14T00:00:00+00', '2026-08-08T04:00:00+00'),
('195f6b70-b984-5653-8f95-ea99590fc808', 'Sahin (Kabir)', null, null, '2026-06-10T00:00:00+00', '2026-08-08T04:00:00+00'),
('067725e9-1a5f-546c-8429-6d076e58760e', 'Sohel (Shahin - Kabir)', null, null, '2026-07-20T00:00:00+00', '2026-08-08T04:00:00+00'),
('e64a66d1-2662-5da5-945b-73507ac236b2', 'Sahin (Anik)', null, null, '2026-06-20T00:00:00+00', '2026-08-08T04:00:00+00'),
('78a9190e-6d59-5fc7-b8a4-3e23e521b1ca', 'Sojib (Kabir)', null, null, '2026-07-08T00:00:00+00', '2026-08-08T04:00:00+00'),
('24c096e6-a0c6-5750-9235-551f2cb2efe0', 'Borhan Boss', null, null, '2026-06-28T00:00:00+00', '2026-08-08T04:00:00+00'),
('0aef50f0-26f2-5d6f-a2d4-09f4d2acb181', 'Mokles', null, null, '2026-07-20T00:00:00+00', '2026-08-08T04:00:00+00'),
('ec699a45-b920-5864-b893-6b5386f8379f', 'Esmail', null, null, '2026-06-20T00:00:00+00', '2026-08-08T04:00:00+00'),
('9170d52d-b41d-5ba1-b1eb-9b26afe945fa', 'Samsul Rana', null, null, '2026-07-20T00:00:00+00', '2026-08-08T04:00:00+00'),
('a82c31b1-d3de-51dc-8519-b552b4b08cd3', 'Sumon Itkhola', null, null, '2026-07-17T00:00:00+00', '2026-08-08T04:00:00+00')
on conflict (id) do nothing;

-- Initial transaction ledger from the updated Excel backup.
insert into public.transactions (id, customer_id, type, title, amount, transaction_date, note, created_at)
values
('cb742ed2-c913-5040-b2b2-bcacf6d06985', 'f3350515-a719-5844-a159-a90ddebbdfc2', 'due', 'Opening Due', 6430.00, '2026-02-23', 'Imported from the initial due list', '2026-02-23T00:00:00+00'),
('7d698cf2-90be-53ae-a47c-ae8b8065f6f9', 'f3350515-a719-5844-a159-a90ddebbdfc2', 'payment', 'Payment Received', 2000.00, '2026-08-05', null, '2026-08-05T00:00:01+00'),
('d04a4e16-f71a-5cbd-bf49-967e7babf539', 'beb87ef8-ba65-579f-a56d-2fd4ea20c165', 'due', 'Opening Due', 5350.00, '2026-03-13', 'Imported from the initial due list', '2026-03-13T00:00:02+00'),
('df3d2247-4022-5472-93be-361e32a1d0a3', 'beb87ef8-ba65-579f-a56d-2fd4ea20c165', 'due', 'M 591', 3300.00, '2026-08-05', null, '2026-08-05T00:00:03+00'),
('a003904f-3934-5148-9fab-e8ef654ba9fd', '0187338e-baab-5d61-bd24-1bd7d973762e', 'due', 'Opening Due', 4050.00, '2026-03-15', 'Imported from the initial due list', '2026-03-15T00:00:04+00'),
('7996ae88-caa2-5c2b-af19-41518d3b0682', '48eff30a-33cf-5ad3-a72f-99dd4b6b6734', 'due', 'Opening Due', 4140.00, '2026-07-15', 'Imported from the initial due list', '2026-07-15T00:00:05+00'),
('18a69017-0a47-5964-8736-49b300e169b0', 'ac8820e5-f8bc-5cd9-aeee-b7b1df22350e', 'due', 'Opening Due', 6700.00, '2026-07-18', 'Imported from the initial due list', '2026-07-18T00:00:06+00'),
('1ecc52e3-dd21-53db-9a1b-a058492a9f28', 'd05bc317-b4a3-5279-8aae-790c99817b75', 'due', 'Opening Due', 650.00, '2026-03-27', 'Imported from the initial due list', '2026-03-27T00:00:07+00'),
('d9c1bb92-74d5-5051-b5e8-76819da9255d', 'd05bc317-b4a3-5279-8aae-790c99817b75', 'due', 'K 183', 500.00, '2026-08-03', null, '2026-08-03T00:00:08+00'),
('54fef8fa-4124-53c6-a67a-3b7070311b7f', 'b4fbf567-8bd1-5e9b-a168-2183c3ee7f99', 'due', 'Opening Due', 23690.00, '2026-04-30', 'Imported from the initial due list', '2026-04-30T00:00:09+00'),
('816298e3-9ce3-5951-88b9-5af809f4984e', 'b4fbf567-8bd1-5e9b-a168-2183c3ee7f99', 'payment', 'Payment Received', 5600.00, '2026-08-05', null, '2026-08-05T00:00:10+00'),
('893bd8ce-ba08-5995-9bcf-fd1c91959614', '85481f8a-ac21-5faa-a1cb-b57db3955d89', 'due', 'Opening Due', 9950.00, '2026-07-15', 'Imported from the initial due list', '2026-07-15T00:00:11+00'),
('ed680ec3-90b7-5092-9583-e3b6a1307bba', '85481f8a-ac21-5faa-a1cb-b57db3955d89', 'due', 'Denso Snail Horn', 1500.00, '2026-07-17', null, '2026-07-17T00:00:12+00'),
('5b3bc92c-75ef-5ff4-94cd-43cfbf7ce62e', '7b3ddb0f-520a-5bcd-867b-a0f1f1bdcc6e', 'due', 'Opening Due', 3250.00, '2026-05-04', 'Imported from the initial due list', '2026-05-04T00:00:13+00'),
('30e02f8a-b0a6-542e-987f-69da7e251a0e', 'f845ab10-1d5b-5fb1-9849-389d9de2aa15', 'due', 'Opening Due', 2800.00, '2026-05-07', 'Imported from the initial due list', '2026-05-07T00:00:14+00'),
('ae9a2371-5a51-5973-a44a-9a83d3d9b6c0', '09b9d09d-af69-5ba0-9a3d-ba659830595e', 'due', 'Opening Due', 14160.00, '2026-05-08', 'Imported from the initial due list', '2026-05-08T00:00:15+00'),
('168e0b78-2ee9-5ae3-93fa-96501ee97394', '09b9d09d-af69-5ba0-9a3d-ba659830595e', 'payment', 'Payment Received', 400.00, '2026-07-21', null, '2026-07-21T00:00:16+00'),
('f450b245-8840-501e-98a5-1d85932cd97b', '718376cc-a00f-5695-a0f0-acbff6bb3fb3', 'due', 'Opening Due', 1640.00, '2026-05-13', 'Imported from the initial due list', '2026-05-13T00:00:17+00'),
('37226309-d902-527e-9e3a-64bd432d84dd', '2156d776-b74f-5670-a987-341a7beb9ddc', 'due', 'Opening Due', 2600.00, '2026-05-15', 'Imported from the initial due list', '2026-05-15T00:00:18+00'),
('8eb37d14-8f37-53fb-b14d-2e6694afd42a', '2156d776-b74f-5670-a987-341a7beb9ddc', 'due', 'K 194', 250.00, '2026-08-04', null, '2026-08-04T00:00:19+00'),
('5b0f4b86-26b8-5024-bbb6-ddb957946cd6', 'ef46c07f-66f8-53f5-a840-2a93615d3516', 'due', 'Opening Due', 900.00, '2026-05-19', 'Imported from the initial due list', '2026-05-19T00:00:20+00'),
('2651ce40-d566-551d-a78e-dc12a9eaa06f', 'ef46c07f-66f8-53f5-a840-2a93615d3516', 'payment', 'Payment Received', 900.00, '2026-07-28', null, '2026-07-28T00:00:21+00'),
('3a502403-ac1b-5786-85f6-a4399a45e836', 'a3ce38bf-05c0-5d39-ad61-eb04ae12085c', 'due', 'Opening Due', 1900.00, '2026-06-04', 'Imported from the initial due list', '2026-06-04T00:00:22+00'),
('db03c77d-8760-51c1-9036-e3fe6331bbc0', 'a37564ff-b09a-5712-a916-ce209f8c760d', 'due', 'Opening Due', 3600.00, '2026-07-14', 'Imported from the initial due list', '2026-07-14T00:00:23+00'),
('3a6a1c3b-3c66-51e4-bdcf-85d9cd1b1fe0', '195f6b70-b984-5653-8f95-ea99590fc808', 'due', 'Opening Due', 3600.00, '2026-06-10', 'Imported from the initial due list', '2026-06-10T00:00:24+00'),
('5562045f-4837-53ed-b7c5-34b656ea96e2', '067725e9-1a5f-546c-8429-6d076e58760e', 'due', 'Opening Due', 5250.00, '2026-06-14', 'Imported from the initial due list', '2026-06-14T00:00:25+00'),
('e0e5217c-53ca-527e-9732-4fc2813b382a', '067725e9-1a5f-546c-8429-6d076e58760e', 'payment', 'Payment Received', 3000.00, '2026-05-27', null, '2026-05-27T00:00:26+00'),
('125a5211-4b04-5577-95ab-5ecaf2a3d177', '067725e9-1a5f-546c-8429-6d076e58760e', 'payment', 'Payment Received', 1000.00, '2026-07-20', null, '2026-07-20T00:00:27+00'),
('5ecf29d1-dc9a-5b33-8451-863f17d23362', 'e64a66d1-2662-5da5-945b-73507ac236b2', 'due', 'Opening Due', 4900.00, '2026-06-20', 'Imported from the initial due list', '2026-06-20T00:00:28+00'),
('3722399b-1457-5160-853e-9cafc72cab5d', '78a9190e-6d59-5fc7-b8a4-3e23e521b1ca', 'due', 'Opening Due', 1700.00, '2026-07-08', 'Imported from the initial due list', '2026-07-08T00:00:29+00'),
('69dc42db-7392-57a8-91d5-1eb186dda57e', '24c096e6-a0c6-5750-9235-551f2cb2efe0', 'due', 'Opening Due', 10600.00, '2026-06-28', 'Imported from the initial due list', '2026-06-28T00:00:30+00'),
('cc45ec71-7430-58a8-a037-47b8345bca3b', '0aef50f0-26f2-5d6f-a2d4-09f4d2acb181', 'due', 'Opening Due', 13070.00, '2026-07-10', 'Imported from the initial due list', '2026-07-10T00:00:31+00'),
('8529f6fe-3660-532d-87cb-d6462eef66b2', '0aef50f0-26f2-5d6f-a2d4-09f4d2acb181', 'payment', 'Payment Received', 500.00, '2026-07-20', null, '2026-07-20T00:00:32+00'),
('84c311bf-b0da-593c-b361-e411efcc966b', 'ec699a45-b920-5864-b893-6b5386f8379f', 'due', 'Opening Due', 4240.00, '2026-06-20', 'Imported from the initial due list', '2026-06-20T00:00:33+00'),
('346b207f-f4ff-50ab-9256-66f9a788612a', '9170d52d-b41d-5ba1-b1eb-9b26afe945fa', 'due', 'Opening Due', 1880.00, '2025-08-02', 'Imported from the initial due list', '2025-08-02T00:00:34+00'),
('7aa2bd65-9c94-5e67-88cc-42783fbc5fe1', '9170d52d-b41d-5ba1-b1eb-9b26afe945fa', 'payment', 'Payment Received', 1000.00, '2026-07-20', null, '2026-07-20T00:00:35+00'),
('a064e63c-eda4-5e80-aa79-5c2ad8dbb231', 'a82c31b1-d3de-51dc-8519-b552b4b08cd3', 'due', 'Opening Due', 450.00, '2026-07-17', 'Imported from the initial due list', '2026-07-17T00:00:36+00')
on conflict (id) do nothing;
