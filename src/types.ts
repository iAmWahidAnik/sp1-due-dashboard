export type Language = 'en' | 'bn';
export type CustomerStatus = 'due' | 'paid';
export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type TransactionType = 'due' | 'payment';

export interface LedgerTransaction {
  id: string;
  type: TransactionType;
  title: string;
  amount: number;
  date: string;
  note?: string;
  createdAt: string;
}

export interface CustomerDue {
  id: string;
  name: string;
  dueAmount: number;
  lastTransactionDate: string;
  phone?: string;
  note?: string;
  status: CustomerStatus;
  transactions: LedgerTransaction[];
  createdAt: string;
  updatedAt: string;
}
