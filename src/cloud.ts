import type { CustomerDue, LedgerTransaction, TransactionType } from './types';
import { calculateBalance, latestTransactionDate } from './utils';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
const SESSION_KEY = 'sp1-cloud-session-v1';

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
  user?: {
    id?: string;
    email?: string;
  };
};

type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type TransactionRow = {
  id: string;
  customer_id: string;
  type: TransactionType;
  title: string;
  amount: number | string;
  transaction_date: string;
  note: string | null;
  created_at: string;
};

export const isCloudConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let sessionCache: AuthSession | null = null;

function readSession(): AuthSession | null {
  if (sessionCache) return sessionCache;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    sessionCache = JSON.parse(raw) as AuthSession;
    return sessionCache;
  } catch {
    return null;
  }
}

function persistSession(session: AuthSession | null) {
  sessionCache = session;
  if (!session) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getStoredSession() {
  return readSession();
}

async function authRequest(path: string, init: RequestInit) {
  if (!isCloudConfigured) throw new Error('Supabase is not configured.');
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data?.msg ?? data?.message ?? data?.error_description ?? data?.error ?? `Request failed (${response.status})`;
    throw new Error(message);
  }
  return data;
}

export async function signInWithPassword(email: string, password: string): Promise<AuthSession> {
  const session = await authRequest('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }) as AuthSession;

  if (!session.expires_at && session.expires_in) {
    session.expires_at = Math.floor(Date.now() / 1000) + session.expires_in;
  }
  persistSession(session);
  return session;
}

async function refreshSession(): Promise<AuthSession> {
  const current = readSession();
  if (!current?.refresh_token) throw new Error('Your login session has expired. Please sign in again.');
  const session = await authRequest('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: current.refresh_token }),
  }) as AuthSession;
  if (!session.refresh_token) session.refresh_token = current.refresh_token;
  if (!session.expires_at && session.expires_in) {
    session.expires_at = Math.floor(Date.now() / 1000) + session.expires_in;
  }
  persistSession(session);
  return session;
}

async function activeAccessToken(): Promise<string> {
  const session = readSession();
  if (!session?.access_token) throw new Error('Please sign in.');
  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at && session.expires_at - now < 90) {
    const refreshed = await refreshSession();
    return refreshed.access_token;
  }
  return session.access_token;
}

export async function signOutCloud() {
  const session = readSession();
  try {
    if (session?.access_token && isCloudConfigured) {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.access_token}`,
        },
      });
    }
  } finally {
    persistSession(null);
  }
}

async function restRequest<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  if (!isCloudConfigured) throw new Error('Supabase is not configured.');
  const token = await activeAccessToken();
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    if (response.status === 401) persistSession(null);
    const message = data?.message ?? data?.details ?? data?.hint ?? `Database request failed (${response.status})`;
    throw new Error(message);
  }
  return data as T;
}

function mapTransaction(row: TransactionRow): LedgerTransaction {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    amount: Number(row.amount) || 0,
    date: row.transaction_date,
    note: row.note ?? '',
    createdAt: row.created_at,
  };
}

export async function fetchDashboardCustomers(): Promise<CustomerDue[]> {
  const [customerRows, transactionRows] = await Promise.all([
    restRequest<CustomerRow[]>('customers?select=*&order=created_at.asc'),
    restRequest<TransactionRow[]>('transactions?select=*&order=transaction_date.asc,created_at.asc'),
  ]);

  const grouped = new Map<string, LedgerTransaction[]>();
  for (const row of transactionRows) {
    const list = grouped.get(row.customer_id) ?? [];
    list.push(mapTransaction(row));
    grouped.set(row.customer_id, list);
  }

  return customerRows.map((row) => {
    const transactions = grouped.get(row.id) ?? [];
    const dueAmount = calculateBalance(transactions);
    const fallback = row.created_at.slice(0, 10);
    return {
      id: row.id,
      name: row.name,
      phone: row.phone ?? '',
      note: row.note ?? '',
      dueAmount,
      status: dueAmount > 0 ? 'due' : 'paid',
      lastTransactionDate: latestTransactionDate(transactions, fallback),
      transactions,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

export async function createCustomerWithOpeningDue(input: {
  name: string;
  phone?: string;
  note?: string;
  title: string;
  amount: number;
  date: string;
}) {
  const customerId = crypto.randomUUID();
  const transactionId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  await restRequest<CustomerRow[]>('customers', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      id: customerId,
      name: input.name,
      phone: input.phone || null,
      note: input.note || null,
      created_at: timestamp,
      updated_at: timestamp,
    }),
  });

  try {
    await restRequest<TransactionRow[]>('transactions', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        id: transactionId,
        customer_id: customerId,
        type: 'due',
        title: input.title,
        amount: input.amount,
        transaction_date: input.date,
        note: input.note || null,
        created_at: timestamp,
      }),
    });
  } catch (error) {
    await restRequest(`customers?id=eq.${encodeURIComponent(customerId)}`, { method: 'DELETE' }).catch(() => undefined);
    throw error;
  }
}

export async function updateCustomerAccount(customerId: string, input: { name: string; phone?: string; note?: string }) {
  await restRequest(`customers?id=eq.${encodeURIComponent(customerId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      name: input.name,
      phone: input.phone || null,
      note: input.note || null,
      updated_at: new Date().toISOString(),
    }),
  });
}

export async function addCloudTransaction(customerId: string, input: {
  type: TransactionType;
  title: string;
  amount: number;
  date: string;
  note?: string;
}) {
  await restRequest('transactions', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      id: crypto.randomUUID(),
      customer_id: customerId,
      type: input.type,
      title: input.title,
      amount: input.amount,
      transaction_date: input.date,
      note: input.note || null,
      created_at: new Date().toISOString(),
    }),
  });

  await restRequest(`customers?id=eq.${encodeURIComponent(customerId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ updated_at: new Date().toISOString() }),
  });
}

export async function deleteCloudTransaction(transactionId: string) {
  await restRequest(`transactions?id=eq.${encodeURIComponent(transactionId)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
}

export async function deleteCloudCustomer(customerId: string) {
  await restRequest(`customers?id=eq.${encodeURIComponent(customerId)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
}

export async function replaceAllCloudData(customers: CustomerDue[]) {
  const customerRows = customers.map((customer) => ({
    id: customer.id,
    name: customer.name,
    phone: customer.phone || null,
    note: customer.note || null,
    created_at: customer.createdAt || new Date().toISOString(),
    updated_at: customer.updatedAt || new Date().toISOString(),
  }));

  const transactionRows = customers.flatMap((customer) =>
    customer.transactions.map((transaction) => ({
      id: transaction.id,
      customer_id: customer.id,
      type: transaction.type,
      title: transaction.title,
      amount: transaction.amount,
      transaction_date: transaction.date,
      note: transaction.note || null,
      created_at: transaction.createdAt || new Date().toISOString(),
    })),
  );

  await restRequest('rpc/replace_ledger', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      p_customers: customerRows,
      p_transactions: transactionRows,
    }),
  });
}
