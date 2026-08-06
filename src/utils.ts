import type { CustomerDue, Language, LedgerTransaction, Priority } from './types';

export const DAY_MS = 86_400_000;

export function daysSince(date: string): number {
  const target = new Date(`${date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - target.getTime()) / DAY_MS));
}

export function calculateBalance(transactions: LedgerTransaction[]): number {
  return Math.max(
    0,
    transactions.reduce(
      (balance, transaction) =>
        balance + (transaction.type === 'due' ? transaction.amount : -transaction.amount),
      0,
    ),
  );
}

export function latestTransactionDate(transactions: LedgerTransaction[], fallback: string): string {
  if (!transactions.length) return fallback;
  return [...transactions]
    .sort((a, b) => {
      const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    })[0].date;
}

export function normalizeCustomer(customer: Partial<CustomerDue> & Pick<CustomerDue, 'id' | 'name' | 'dueAmount' | 'lastTransactionDate'>): CustomerDue {
  const timestamp = customer.updatedAt ?? customer.createdAt ?? new Date().toISOString();
  const transactions: LedgerTransaction[] = Array.isArray(customer.transactions) && customer.transactions.length
    ? customer.transactions.map((transaction) => ({
        ...transaction,
        id: transaction.id || crypto.randomUUID(),
        title: transaction.title || (transaction.type === 'payment' ? 'Payment Received' : 'Opening Due'),
        amount: Number(transaction.amount) || 0,
        date: transaction.date || customer.lastTransactionDate,
        createdAt: transaction.createdAt || timestamp,
      }))
    : customer.dueAmount > 0
      ? [{
          id: crypto.randomUUID(),
          type: 'due',
          title: 'Opening Due',
          amount: Number(customer.dueAmount),
          date: customer.lastTransactionDate,
          note: 'Migrated from previous dashboard data',
          createdAt: timestamp,
        }]
      : [];
  const dueAmount = calculateBalance(transactions);
  return {
    id: customer.id,
    name: customer.name,
    dueAmount,
    lastTransactionDate: latestTransactionDate(transactions, customer.lastTransactionDate),
    phone: customer.phone ?? '',
    note: customer.note ?? '',
    status: dueAmount > 0 ? 'due' : 'paid',
    transactions,
    createdAt: customer.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}

export function getPriority(customer: CustomerDue): Priority {
  const days = daysSince(customer.lastTransactionDate);
  const amount = customer.dueAmount;
  if (days >= 90 || (days >= 60 && amount >= 10000)) return 'critical';
  if (days >= 60 || (days >= 30 && amount >= 10000)) return 'high';
  if (days >= 30 || amount >= 10000) return 'medium';
  return 'low';
}

export function urgencyScore(customer: CustomerDue): number {
  const days = daysSince(customer.lastTransactionDate);
  const amountWeight = Math.min(customer.dueAmount / 250, 70);
  return days + amountWeight;
}

export function formatMoney(value: number, language: Language): string {
  return new Intl.NumberFormat(language === 'bn' ? 'bn-BD' : 'en-BD', {
    style: 'currency',
    currency: 'BDT',
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number, language: Language): string {
  return new Intl.NumberFormat(language === 'bn' ? 'bn-BD' : 'en-BD').format(value);
}

export function formatDate(value: string, language: Language): string {
  return new Intl.DateTimeFormat(language === 'bn' ? 'bn-BD' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`));
}

export function normalizeExcelDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    const parsed = new Date(Math.round((value - 25569) * DAY_MS));
    return parsed.toISOString().slice(0, 10);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return null;
}
