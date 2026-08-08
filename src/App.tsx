import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownUp,
  BadgeDollarSign,
  CalendarDays,
  CheckCircle2,
  Cloud,
  ChevronRight,
  CircleDollarSign,
  ClipboardCopy,
  Clock3,
  Download,
  Edit3,
  Eye,
  FileSpreadsheet,
  Languages,
  LogOut,
  Menu,
  Plus,
  PlusCircle,
  Printer,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { getCopy } from './i18n';
import {
  addCloudTransaction,
  createCustomerWithOpeningDue,
  deleteCloudCustomer,
  deleteCloudTransaction,
  fetchDashboardCustomers,
  getStoredSession,
  isCloudConfigured,
  replaceAllCloudData,
  signInWithPassword,
  signOutCloud,
  updateCustomerAccount,
  type AuthSession,
} from './cloud';
import type {
  CustomerDue,
  Language,
  LedgerTransaction,
  Priority,
  TransactionType,
} from './types';
import {
  calculateBalance,
  daysSince,
  formatDate,
  formatMoney,
  formatNumber,
  getPriority,
  latestTransactionDate,
  normalizeCustomer,
  normalizeExcelDate,
  urgencyScore,
} from './utils';

type SortMode = 'urgency' | 'amount' | 'oldest';
type StatusFilter = 'due' | 'all' | 'paid';

type FormState = {
  name: string;
  dueAmount: string;
  openingTitle: string;
  lastTransactionDate: string;
  phone: string;
  note: string;
};

type TransactionFormState = {
  title: string;
  amount: string;
  date: string;
  note: string;
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const emptyForm = (): FormState => ({
  name: '',
  dueAmount: '',
  openingTitle: '',
  lastTransactionDate: todayIso(),
  phone: '',
  note: '',
});

const emptyTransactionForm = (): TransactionFormState => ({
  title: '',
  amount: '',
  date: todayIso(),
  note: '',
});

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

function App() {
  const [language, setLanguage] = useState<Language>('en');
  const [session, setSession] = useState<AuthSession | null>(() => getStoredSession());
  const [customers, setCustomers] = useState<CustomerDue[]>([]);
  const [query, setQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('due');
  const [sortMode, setSortMode] = useState<SortMode>('urgency');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState('');
  const [transactionCustomerId, setTransactionCustomerId] = useState<string | null>(null);
  const [transactionType, setTransactionType] = useState<TransactionType>('due');
  const [transactionForm, setTransactionForm] = useState<TransactionFormState>(emptyTransactionForm);
  const [transactionError, setTransactionError] = useState('');
  const [statementCustomerId, setStatementCustomerId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [isLoading, setIsLoading] = useState(Boolean(session));
  const [isSyncing, setIsSyncing] = useState(false);
  const [cloudError, setCloudError] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const t = getCopy(language);

  async function refreshData(silent = false) {
    if (!session) return;
    if (!silent) setIsLoading(true);
    setIsSyncing(true);
    try {
      const nextCustomers = await fetchDashboardCustomers();
      setCustomers(nextCustomers);
      setLastSyncedAt(new Date());
      setCloudError('');
    } catch (error) {
      const message = errorMessage(error);
      setCloudError(message);
      if (/sign in|expired|jwt|401/i.test(message)) {
        await signOutCloud().catch(() => undefined);
        setSession(null);
        setCustomers([]);
      }
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }

  useEffect(() => {
    if (!session || !isCloudConfigured) return;
    void refreshData();
    const timer = window.setInterval(() => void refreshData(true), 15_000);
    const handleFocus = () => void refreshData(true);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
    };
  }, [session?.access_token]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const activeCustomers = useMemo(
    () => customers.filter((customer) => customer.dueAmount > 0),
    [customers],
  );

  const totalDue = useMemo(
    () => activeCustomers.reduce((sum, customer) => sum + customer.dueAmount, 0),
    [activeCustomers],
  );

  const urgentCustomers = useMemo(
    () => activeCustomers.filter((customer) => ['critical', 'high'].includes(getPriority(customer))),
    [activeCustomers],
  );

  const oldest = useMemo(
    () =>
      [...activeCustomers].sort(
        (a, b) =>
          new Date(a.lastTransactionDate).getTime() - new Date(b.lastTransactionDate).getTime(),
      )[0],
    [activeCustomers],
  );

  const priorityCounts = useMemo(
    () =>
      activeCustomers.reduce<Record<Priority, number>>(
        (acc, customer) => {
          acc[getPriority(customer)] += customer.dueAmount;
          return acc;
        },
        { critical: 0, high: 0, medium: 0, low: 0 },
      ),
    [activeCustomers],
  );

  const filteredCustomers = useMemo(() => {
    const normalizedQuery = query.toLowerCase().trim();
    const result = customers.filter((customer) => {
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'due' && customer.dueAmount > 0) ||
        (statusFilter === 'paid' && customer.dueAmount === 0);
      const matchesQuery =
        !normalizedQuery ||
        customer.name.toLowerCase().includes(normalizedQuery) ||
        customer.phone?.toLowerCase().includes(normalizedQuery);
      const matchesPriority =
        priorityFilter === 'all' ||
        (customer.dueAmount > 0 && getPriority(customer) === priorityFilter);
      return matchesStatus && matchesQuery && matchesPriority;
    });

    return result.sort((a, b) => {
      if (sortMode === 'amount') return b.dueAmount - a.dueAmount;
      if (sortMode === 'oldest') {
        return (
          new Date(a.lastTransactionDate).getTime() -
          new Date(b.lastTransactionDate).getTime()
        );
      }
      if (a.dueAmount === 0 && b.dueAmount > 0) return 1;
      if (b.dueAmount === 0 && a.dueAmount > 0) return -1;
      return urgencyScore(b) - urgencyScore(a);
    });
  }, [customers, priorityFilter, query, sortMode, statusFilter]);

  const priorityQueue = useMemo(
    () => [...activeCustomers].sort((a, b) => urgencyScore(b) - urgencyScore(a)).slice(0, 5),
    [activeCustomers],
  );

  const transactionCustomer = useMemo(
    () => customers.find((customer) => customer.id === transactionCustomerId) ?? null,
    [customers, transactionCustomerId],
  );

  const statementCustomer = useMemo(
    () => customers.find((customer) => customer.id === statementCustomerId) ?? null,
    [customers, statementCustomerId],
  );

  function openCreateForm() {
    setEditingId(null);
    setForm(emptyForm());
    setFormError('');
    setIsFormOpen(true);
  }

  function openEditForm(customer: CustomerDue) {
    setEditingId(customer.id);
    setForm({
      name: customer.name,
      dueAmount: String(customer.dueAmount),
      openingTitle: '',
      lastTransactionDate: customer.lastTransactionDate,
      phone: customer.phone ?? '',
      note: customer.note ?? '',
    });
    setFormError('');
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingId(null);
    setFormError('');
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const amount = Number(form.dueAmount);
    if (!form.name.trim() || (!editingId && (!form.dueAmount || !form.lastTransactionDate || !form.openingTitle.trim()))) {
      setFormError(t.required);
      return;
    }
    if (!editingId && (!Number.isFinite(amount) || amount <= 0)) {
      setFormError(t.invalidAmount);
      return;
    }

    setFormError('');
    try {
      if (editingId) {
        await updateCustomerAccount(editingId, {
          name: form.name.trim(),
          phone: form.phone.trim(),
          note: form.note.trim(),
        });
        setToast(t.accountUpdated);
      } else {
        await createCustomerWithOpeningDue({
          name: form.name.trim(),
          phone: form.phone.trim(),
          note: form.note.trim(),
          title: form.openingTitle.trim(),
          amount,
          date: form.lastTransactionDate,
        });
        setToast(t.customerAdded);
      }
      await refreshData(true);
      closeForm();
    } catch (error) {
      setFormError(errorMessage(error));
    }
  }

  function openTransaction(customer: CustomerDue, type: TransactionType) {
    setStatementCustomerId(null);
    setTransactionCustomerId(customer.id);
    setTransactionType(type);
    setTransactionForm({
      title: type === 'payment' ? t.paymentReceived : '',
      amount: type === 'payment' ? String(customer.dueAmount) : '',
      date: todayIso(),
      note: '',
    });
    setTransactionError('');
  }

  function closeTransaction() {
    setTransactionCustomerId(null);
    setTransactionError('');
  }

  async function handleTransactionSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!transactionCustomer) return;
    const amount = Number(transactionForm.amount);
    if (!transactionForm.title.trim() || !transactionForm.date || !transactionForm.amount) {
      setTransactionError(t.required);
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setTransactionError(t.invalidAmount);
      return;
    }
    if (transactionType === 'payment' && amount > transactionCustomer.dueAmount) {
      setTransactionError(t.paymentTooHigh);
      return;
    }

    setTransactionError('');
    try {
      await addCloudTransaction(transactionCustomer.id, {
        type: transactionType,
        title: transactionForm.title.trim(),
        amount,
        date: transactionForm.date,
        note: transactionForm.note.trim(),
      });
      await refreshData(true);
      setToast(transactionType === 'due' ? t.dueAdded : t.paymentAdded);
      closeTransaction();
    } catch (error) {
      setTransactionError(errorMessage(error));
    }
  }

  async function deleteTransaction(customerId: string, transactionId: string) {
    if (!window.confirm(t.deleteTransactionConfirm)) return;
    try {
      await deleteCloudTransaction(transactionId);
      await refreshData(true);
      setToast(t.transactionDeleted);
      if (statementCustomerId === customerId) setStatementCustomerId(customerId);
    } catch (error) {
      window.alert(errorMessage(error));
    }
  }

  async function deleteCustomer(customer: CustomerDue) {
    if (!window.confirm(t.deleteConfirm)) return;
    try {
      await deleteCloudCustomer(customer.id);
      await refreshData(true);
      if (statementCustomerId === customer.id) setStatementCustomerId(null);
      setToast(t.customerDeleted);
    } catch (error) {
      window.alert(errorMessage(error));
    }
  }

  function resetData() {
    void refreshData();
  }

  async function importExcel(file: File) {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      let imported: CustomerDue[] = [];

      const transactionSheet = workbook.Sheets.Transactions;
      if (transactionSheet) {
        const customerSheet = workbook.Sheets.Customers;
        const customerRows = customerSheet
          ? XLSX.utils.sheet_to_json<Record<string, unknown>>(customerSheet, { defval: '' })
          : [];
        const transactionRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(transactionSheet, { defval: '' });

        const customerMeta = new Map<string, { phone: string; note: string }>();
        for (const row of customerRows) {
          const name = String(row.Name ?? row.Customer ?? '').trim();
          if (!name) continue;
          customerMeta.set(name, {
            phone: String(row.Phone ?? '').trim(),
            note: String(row.Note ?? '').trim(),
          });
        }

        const map = new Map<string, CustomerDue>();
        const ensureCustomer = (name: string) => {
          let customer = map.get(name);
          if (customer) return customer;
          const meta = customerMeta.get(name);
          const timestamp = new Date().toISOString();
          customer = {
            id: crypto.randomUUID(),
            name,
            phone: meta?.phone ?? '',
            note: meta?.note ?? '',
            dueAmount: 0,
            lastTransactionDate: todayIso(),
            status: 'paid',
            transactions: [],
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          map.set(name, customer);
          return customer;
        };

        for (const name of customerMeta.keys()) ensureCustomer(name);

        transactionRows.forEach((row, index) => {
          const name = String(row.Customer ?? row.Name ?? '').trim();
          const date = normalizeExcelDate(row.Date ?? row['Transaction Date']);
          const amount = Number(row.Amount ?? row['Due Amount']);
          if (!name || !date || !Number.isFinite(amount) || amount <= 0) return;

          const typeRaw = String(row.Type ?? 'Due').trim().toLowerCase();
          const type: TransactionType = typeRaw.includes('payment') || typeRaw.includes('paid') ? 'payment' : 'due';
          const customer = ensureCustomer(name);
          const title = String(row.Title ?? row.Product ?? row['Product Name'] ?? (type === 'payment' ? t.paymentReceived : t.openingDue)).trim();
          const note = String(row.Note ?? '').trim();
          customer.transactions.push({
            id: crypto.randomUUID(),
            type,
            title: title || (type === 'payment' ? t.paymentReceived : t.openingDue),
            amount,
            date,
            note,
            createdAt: `${date}T${String(Math.floor(index / 3600)).padStart(2, '0')}:${String(Math.floor(index / 60) % 60).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}.000Z`,
          });
        });

        imported = Array.from(map.values()).map((customer) => {
          const dueAmount = calculateBalance(customer.transactions);
          const fallback = customer.createdAt.slice(0, 10);
          const lastTransactionDate = latestTransactionDate(customer.transactions, fallback);
          const firstDate = [...customer.transactions].sort((a, b) => a.date.localeCompare(b.date))[0]?.date;
          return {
            ...customer,
            dueAmount,
            status: dueAmount > 0 ? 'due' : 'paid',
            lastTransactionDate,
            createdAt: firstDate ? `${firstDate}T00:00:00.000Z` : customer.createdAt,
            updatedAt: new Date().toISOString(),
          };
        });
      }

      if (!imported.length) {
        const sheetResults: CustomerDue[][] = [];

        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
            header: 1,
            defval: null,
            raw: true,
          });

          const headerRowIndex = matrix.findIndex((row) => {
            const labels = row.map((value) => String(value ?? '').trim().toLowerCase());
            return labels.some((label) => /^(name|customer|কাস্টমার|নাম)$/.test(label)) &&
              labels.some((label) => /^(amount|due amount|current outstanding|বকেয়া|টাকা)$/.test(label));
          });

          if (headerRowIndex < 0) continue;
          const headers = matrix[headerRowIndex].map((value) => String(value ?? '').trim());
          const findIndex = (patterns: RegExp[]) =>
            headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
          const nameIndex = findIndex([/^name$/i, /customer/i, /কাস্টমার/i, /^নাম$/i]);
          const amountIndex = findIndex([/^amount$/i, /due amount/i, /current outstanding/i, /বকেয়া/i, /^টাকা$/i]);
          const dateIndex = findIndex([/last.*transaction/i, /update.*date/i, /^date$/i, /তারিখ/i]);
          if (nameIndex < 0 || amountIndex < 0 || dateIndex < 0) continue;

          const parsed: CustomerDue[] = [];
          for (const row of matrix.slice(headerRowIndex + 1)) {
            const name = row[nameIndex];
            const amount = row[amountIndex];
            const date = row[dateIndex];
            const normalizedDate = normalizeExcelDate(date);
            const numericAmount = typeof amount === 'number' ? amount : Number(amount);
            if (!name || !normalizedDate || !Number.isFinite(numericAmount) || numericAmount <= 0) continue;
            const normalizedName = String(name).trim();
            if (/total/i.test(normalizedName)) continue;
            const timestamp = new Date().toISOString();
            parsed.push(normalizeCustomer({
              id: crypto.randomUUID(),
              name: normalizedName,
              dueAmount: numericAmount,
              lastTransactionDate: normalizedDate,
              status: 'due',
              transactions: [{
                id: crypto.randomUUID(),
                type: 'due',
                title: t.openingDue,
                amount: numericAmount,
                date: normalizedDate,
                note: 'Imported from Excel',
                createdAt: timestamp,
              }],
              createdAt: timestamp,
              updatedAt: timestamp,
            }));
          }
          if (parsed.length) sheetResults.push(parsed);
        }
        imported = sheetResults.sort((a, b) => b.length - a.length)[0] ?? [];
      }

      if (!imported.length) throw new Error('No rows');
      if (!window.confirm(t.importReplaceConfirm)) return;

      await replaceAllCloudData(imported);
      await refreshData(true);
      setToast(`${formatNumber(imported.length, language)} ${t.imported}`);
    } catch (error) {
      window.alert(`${t.importError}\n\n${errorMessage(error)}`);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function exportExcel() {
    const customerRows = customers.map((customer, index) => ({
      SL: index + 1,
      Name: customer.name,
      Phone: customer.phone ?? '',
      'Current Outstanding': customer.dueAmount,
      Status: customer.dueAmount > 0 ? 'Due' : 'Paid',
      'Last Transaction Date': customer.lastTransactionDate,
      'Transaction Count': customer.transactions.length,
      Note: customer.note ?? '',
    }));
    const transactionRows = customers.flatMap((customer) =>
      customer.transactions.map((transaction) => ({
        Customer: customer.name,
        Phone: customer.phone ?? '',
        Date: transaction.date,
        Type: transaction.type === 'due' ? 'Due' : 'Payment',
        Title: transaction.title,
        Amount: transaction.amount,
        Note: transaction.note ?? '',
      })),
    );
    const workbook = XLSX.utils.book_new();
    const customerSheet = XLSX.utils.json_to_sheet(customerRows);
    const transactionSheet = XLSX.utils.json_to_sheet(transactionRows);
    customerSheet['!cols'] = [{ wch: 6 }, { wch: 32 }, { wch: 18 }, { wch: 20 }, { wch: 12 }, { wch: 22 }, { wch: 18 }, { wch: 30 }];
    transactionSheet['!cols'] = [{ wch: 32 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 34 }, { wch: 14 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(workbook, customerSheet, 'Customers');
    XLSX.utils.book_append_sheet(workbook, transactionSheet, 'Transactions');
    XLSX.writeFile(workbook, `SP1-Due-Ledger-${todayIso()}.xlsx`);
  }

  async function handleLogin(email: string, password: string) {
    const nextSession = await signInWithPassword(email, password);
    setIsLoading(true);
    try {
      const nextCustomers = await fetchDashboardCustomers();
      setCustomers(nextCustomers);
      setLastSyncedAt(new Date());
      setCloudError('');
      setSession(nextSession);
    } catch (error) {
      await signOutCloud().catch(() => undefined);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogout() {
    await signOutCloud().catch(() => undefined);
    setSession(null);
    setCustomers([]);
    setStatementCustomerId(null);
    setCloudError('');
  }

  async function copyStatement(customer: CustomerDue) {
    const rows = buildLedgerRows(customer.transactions);
    const lines = [
      t.company,
      `${t.customerStatement}: ${customer.name}`,
      customer.phone ? `${t.phone}: ${customer.phone}` : '',
      `${t.currentBalance}: ${formatMoney(customer.dueAmount, language)}`,
      '',
      ...rows.map((row) =>
        `${formatDate(row.transaction.date, language)} | ${row.transaction.title} | ${row.transaction.type === 'due' ? '+' : '-'}${formatMoney(row.transaction.amount, language)} | ${t.balance}: ${formatMoney(row.balance, language)}`,
      ),
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setToast(t.copied);
    } catch {
      window.prompt(t.copyDetails, lines.join('\n'));
    }
  }

  if (!isCloudConfigured) {
    return <SetupRequired language={language} onToggleLanguage={() => setLanguage((current) => (current === 'en' ? 'bn' : 'en'))} />;
  }

  if (!session) {
    return <LoginScreen language={language} onToggleLanguage={() => setLanguage((current) => (current === 'en' ? 'bn' : 'en'))} onLogin={handleLogin} />;
  }

  if (isLoading && !customers.length) {
    return <LoadingScreen language={language} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">SP1</div>
          <div>
            <div className="company-name">{t.company}</div>
            <div className="app-name">{t.appName}</div>
          </div>
        </div>
        <div className="header-actions">
          <div className={`sync-chip ${isSyncing ? 'syncing' : ''}`} title={lastSyncedAt ? `${t.lastSynced}: ${lastSyncedAt.toLocaleTimeString()}` : t.cloudSynced}>
            <Cloud size={15} />
            <span>{isSyncing ? t.syncing : t.cloudSynced}</span>
          </div>
          <button className="icon-button header-icon" onClick={() => void refreshData()} title={t.syncNow} aria-label={t.syncNow}>
            <RefreshCw size={17} className={isSyncing ? 'spin' : ''} />
          </button>
          <button
            className="language-toggle"
            onClick={() => setLanguage((current) => (current === 'en' ? 'bn' : 'en'))}
            aria-label="Toggle language"
          >
            <Languages size={17} />
            <span>{language === 'en' ? 'বাংলা' : 'English'}</span>
          </button>
          <button className="primary-button" onClick={openCreateForm}>
            <Plus size={18} />
            <span>{t.addCustomer}</span>
          </button>
          <button className="icon-button header-icon" onClick={() => void handleLogout()} title={t.signOut} aria-label={t.signOut}>
            <LogOut size={17} />
          </button>
        </div>
      </header>

      <main className="page-container">
        <section className="hero-row">
          <div>
            <span className="eyebrow"><CalendarDays size={15} /> {t.today}</span>
            <h1>{t.subtitle}</h1>
          </div>
          <div className="data-actions">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importExcel(file);
              }}
            />
            <button className="secondary-button" onClick={() => fileRef.current?.click()}>
              <Upload size={17} /> {t.importExcel}
            </button>
            <button className="secondary-button" onClick={exportExcel}>
              <Download size={17} /> {t.exportExcel}
            </button>
          </div>
        </section>

        {cloudError && <div className="cloud-error"><AlertTriangle size={17} /><span>{cloudError}</span><button onClick={() => void refreshData()}>{t.retry}</button></div>}

        <section className="stats-grid">
          <StatCard label={t.totalDue} value={formatMoney(totalDue, language)} icon={<CircleDollarSign size={22} />} detail={`${formatNumber(activeCustomers.length, language)} ${t.customerCount}`} tone="green" />
          <StatCard label={t.activeCustomers} value={formatNumber(activeCustomers.length, language)} icon={<Users size={22} />} detail={`${formatNumber(activeCustomers.filter((c) => daysSince(c.lastTransactionDate) >= 90).length, language)} ${t.overdue90}`} tone="blue" />
          <StatCard label={t.urgentFollowups} value={formatNumber(urgentCustomers.length, language)} icon={<AlertTriangle size={22} />} detail={t.attentionNow} tone="orange" />
          <StatCard label={t.oldestDue} value={oldest ? `${formatNumber(daysSince(oldest.lastTransactionDate), language)} ${t.days}` : '—'} icon={<Clock3 size={22} />} detail={oldest?.name ?? '—'} tone="purple" />
        </section>

        <section className="dashboard-grid">
          <div className="panel priority-panel">
            <div className="panel-heading">
              <div><h2>{t.followupQueue}</h2><p>{t.followupSub}</p></div>
              <span className="panel-icon"><BadgeDollarSign size={20} /></span>
            </div>
            <div className="queue-list">
              {priorityQueue.map((customer, index) => {
                const priority = getPriority(customer);
                return (
                  <button className="queue-item" key={customer.id} onClick={() => setStatementCustomerId(customer.id)}>
                    <span className="queue-index">{formatNumber(index + 1, language)}</span>
                    <span className="queue-person"><strong>{customer.name}</strong><small>{formatNumber(daysSince(customer.lastTransactionDate), language)} {t.days} · {formatDate(customer.lastTransactionDate, language)}</small></span>
                    <span className="queue-amount"><strong>{formatMoney(customer.dueAmount, language)}</strong><PriorityBadge priority={priority} label={t[priority]} /></span>
                    <ChevronRight size={17} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="panel breakdown-panel">
            <div className="panel-heading">
              <div><h2>{t.dueBreakdown}</h2><p>{t.largestBalance}: {activeCustomers.length ? formatMoney(Math.max(...activeCustomers.map((c) => c.dueAmount)), language) : '—'}</p></div>
              <span className="panel-icon"><ArrowDownUp size={20} /></span>
            </div>
            <div className="breakdown-list">
              {(['critical', 'high', 'medium', 'low'] as Priority[]).map((priority) => {
                const value = priorityCounts[priority];
                const percentage = totalDue ? Math.round((value / totalDue) * 100) : 0;
                return (
                  <div className="breakdown-row" key={priority}>
                    <div className="breakdown-meta"><PriorityBadge priority={priority} label={t[priority]} /><strong>{formatMoney(value, language)}</strong></div>
                    <div className="progress-track"><span className={`progress-fill ${priority}`} style={{ width: `${percentage}%` }} /></div>
                    <small>{formatNumber(percentage, language)}%</small>
                  </div>
                );
              })}
            </div>
            <div className="browser-note"><Cloud size={17} /><span>{t.cloudNote}</span></div>
          </div>
        </section>

        <section className="panel table-panel">
          <div className="table-toolbar">
            <div><h2>{t.allCustomers}</h2><p>{formatNumber(filteredCustomers.length, language)} {t.records}</p></div>
            <div className="filter-row">
              <label className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} /></label>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                <option value="due">{t.outstandingOnly}</option><option value="all">{t.allAccounts}</option><option value="paid">{t.paidOnly}</option>
              </select>
              <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as 'all' | Priority)}>
                <option value="all">{t.allPriorities}</option><option value="critical">{t.critical}</option><option value="high">{t.high}</option><option value="medium">{t.medium}</option><option value="low">{t.low}</option>
              </select>
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                <option value="urgency">{t.sortUrgency}</option><option value="amount">{t.sortAmount}</option><option value="oldest">{t.sortOldest}</option>
              </select>
              {(query || priorityFilter !== 'all' || statusFilter !== 'due') && (
                <button className="text-button" onClick={() => { setQuery(''); setPriorityFilter('all'); setStatusFilter('due'); }}><X size={15} /> {t.clearFilters}</button>
              )}
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead><tr><th>{t.customer}</th><th>{t.amount}</th><th>{t.date}</th><th>{t.delayed}</th><th>{t.status}</th><th className="actions-heading">{t.actions}</th></tr></thead>
              <tbody>
                {filteredCustomers.map((customer) => {
                  const priority = customer.dueAmount > 0 ? getPriority(customer) : null;
                  return (
                    <tr key={customer.id}>
                      <td><button className="customer-link" onClick={() => setStatementCustomerId(customer.id)}><span className="avatar">{customer.name.slice(0, 1).toUpperCase()}</span><span><strong>{customer.name}</strong>{customer.phone && <small>{customer.phone}</small>}<small>{formatNumber(customer.transactions.length, language)} {t.transaction}</small></span></button></td>
                      <td className="money-cell">{formatMoney(customer.dueAmount, language)}</td>
                      <td>{formatDate(customer.lastTransactionDate, language)}</td>
                      <td>{customer.dueAmount > 0 ? <span className="days-chip">{formatNumber(daysSince(customer.lastTransactionDate), language)} {t.days}</span> : '—'}</td>
                      <td>{priority ? <PriorityBadge priority={priority} label={t[priority]} /> : <span className="paid-badge"><CheckCircle2 size={12} />{t.paid}</span>}</td>
                      <td>
                        <div className="row-actions">
                          <button title={t.viewStatement} className="icon-button" onClick={() => setStatementCustomerId(customer.id)}><Eye size={17} /></button>
                          <button title={t.addDue} className="icon-button due-action" onClick={() => openTransaction(customer, 'due')}><PlusCircle size={17} /></button>
                          <button title={t.addPayment} className="icon-button paid" disabled={customer.dueAmount <= 0} onClick={() => openTransaction(customer, 'payment')}><WalletCards size={17} /></button>
                          <button title={t.edit} className="icon-button" onClick={() => openEditForm(customer)}><Edit3 size={16} /></button>
                          <button title={t.delete} className="icon-button danger" onClick={() => deleteCustomer(customer)}><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filteredCustomers.length && <div className="empty-state"><FileSpreadsheet size={34} /><strong>{t.noData}</strong></div>}
          </div>
          <div className="table-footer"><button className="text-button" onClick={resetData}><RotateCcw size={15} className={isSyncing ? "spin" : ""} /> {t.syncNow}</button></div>
        </section>
      </main>

      {isFormOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm(); }}>
          <div className="modal-card">
            <div className="modal-header"><div><span className="eyebrow"><Menu size={15} /> {editingId ? t.editCustomer : t.addCustomer}</span><h2>{editingId ? t.editCustomer : t.addCustomer}</h2></div><button className="icon-button" onClick={closeForm}><X size={19} /></button></div>
            <form onSubmit={handleSubmit}>
              <label className="form-field"><span>{t.name}</span><input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={t.namePlaceholder} /></label>
              {!editingId && (
                <>
                  <label className="form-field"><span>{t.openingTitle}</span><input value={form.openingTitle} onChange={(event) => setForm({ ...form, openingTitle: event.target.value })} placeholder={t.openingTitlePlaceholder} /></label>
                  <div className="form-grid">
                    <label className="form-field"><span>{t.addFirstDue}</span><input type="number" min="1" step="1" value={form.dueAmount} onChange={(event) => setForm({ ...form, dueAmount: event.target.value })} placeholder={t.amountPlaceholder} /></label>
                    <label className="form-field"><span>{t.transactionDate}</span><input type="date" value={form.lastTransactionDate} onChange={(event) => setForm({ ...form, lastTransactionDate: event.target.value })} /><small>{t.dateHelp}</small></label>
                  </div>
                </>
              )}
              {editingId && <div className="balance-info"><ReceiptText size={18} /><span>{t.dueAmountInfo}</span><strong>{formatMoney(Number(form.dueAmount) || 0, language)}</strong></div>}
              <label className="form-field"><span>{t.phone}</span><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
              <label className="form-field"><span>{t.accountNote}</span><textarea rows={3} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
              {formError && <div className="form-error">{formError}</div>}
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={closeForm}>{t.cancel}</button><button type="submit" className="primary-button">{editingId ? t.update : t.save}</button></div>
            </form>
          </div>
        </div>
      )}

      {transactionCustomer && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeTransaction(); }}>
          <div className="modal-card transaction-modal">
            <div className="modal-header"><div><span className="eyebrow"><ReceiptText size={15} /> {t.transaction}</span><h2>{transactionType === 'due' ? t.addDue : t.addPayment}</h2><p>{transactionCustomer.name}</p></div><button className="icon-button" onClick={closeTransaction}><X size={19} /></button></div>
            <form onSubmit={handleTransactionSubmit}>
              <div className="transaction-balance"><span>{t.currentBalance}</span><strong>{formatMoney(transactionCustomer.dueAmount, language)}</strong></div>
              <div className="type-switch">
                <button type="button" className={transactionType === 'due' ? 'active' : ''} onClick={() => { setTransactionType('due'); setTransactionForm({ ...emptyTransactionForm(), date: transactionForm.date }); }}><PlusCircle size={16} />{t.dueEntry}</button>
                <button type="button" disabled={transactionCustomer.dueAmount <= 0} className={transactionType === 'payment' ? 'active' : ''} onClick={() => { setTransactionType('payment'); setTransactionForm({ ...emptyTransactionForm(), title: t.paymentReceived, amount: String(transactionCustomer.dueAmount), date: transactionForm.date }); }}><WalletCards size={16} />{t.paymentEntry}</button>
              </div>
              <label className="form-field"><span>{t.title}</span><input autoFocus value={transactionForm.title} onChange={(event) => setTransactionForm({ ...transactionForm, title: event.target.value })} placeholder={transactionType === 'due' ? t.titlePlaceholderDue : t.titlePlaceholderPayment} /></label>
              <div className="form-grid">
                <label className="form-field"><span>{t.amount}</span><input type="number" min="1" max={transactionType === 'payment' ? transactionCustomer.dueAmount : undefined} value={transactionForm.amount} onChange={(event) => setTransactionForm({ ...transactionForm, amount: event.target.value })} placeholder={t.amountPlaceholder} /></label>
                <label className="form-field"><span>{t.transactionDate}</span><input type="date" value={transactionForm.date} onChange={(event) => setTransactionForm({ ...transactionForm, date: event.target.value })} /></label>
              </div>
              <label className="form-field"><span>{t.transactionNote}</span><textarea rows={3} value={transactionForm.note} onChange={(event) => setTransactionForm({ ...transactionForm, note: event.target.value })} /></label>
              {transactionError && <div className="form-error">{transactionError}</div>}
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={closeTransaction}>{t.cancel}</button><button type="submit" className="primary-button">{t.saveTransaction}</button></div>
            </form>
          </div>
        </div>
      )}

      {statementCustomer && (
        <StatementModal
          customer={statementCustomer}
          language={language}
          onClose={() => setStatementCustomerId(null)}
          onAddDue={() => openTransaction(statementCustomer, 'due')}
          onAddPayment={() => openTransaction(statementCustomer, 'payment')}
          onCopy={() => void copyStatement(statementCustomer)}
          onDeleteTransaction={(transactionId) => deleteTransaction(statementCustomer.id, transactionId)}
        />
      )}

      {toast && <div className="toast"><CheckCircle2 size={18} /> {toast}</div>}
    </div>
  );
}


function SetupRequired({
  language,
  onToggleLanguage,
}: {
  language: Language;
  onToggleLanguage: () => void;
}) {
  const t = getCopy(language);
  return (
    <div className="auth-shell">
      <div className="auth-card setup-card">
        <div className="auth-topline">
          <div className="brand">
            <div className="brand-mark">SP1</div>
            <div><div className="company-name">{t.company}</div><div className="app-name">{t.appName}</div></div>
          </div>
          <button className="language-toggle" onClick={onToggleLanguage}><Languages size={17} /><span>{language === 'en' ? 'বাংলা' : 'English'}</span></button>
        </div>
        <div className="auth-icon"><Cloud size={28} /></div>
        <h1>{t.setupTitle}</h1>
        <p>{t.setupText}</p>
        <div className="env-box">
          <code>VITE_SUPABASE_URL</code>
          <code>VITE_SUPABASE_ANON_KEY</code>
        </div>
        <small>{t.setupGuide}</small>
      </div>
    </div>
  );
}

function LoginScreen({
  language,
  onToggleLanguage,
  onLogin,
}: {
  language: Language;
  onToggleLanguage: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
}) {
  const t = getCopy(language);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setLoginError(t.required);
      return;
    }
    setLoggingIn(true);
    setLoginError('');
    try {
      await onLogin(email.trim(), password);
    } catch (error) {
      setLoginError(errorMessage(error));
    } finally {
      setLoggingIn(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-topline">
          <div className="brand">
            <div className="brand-mark">SP1</div>
            <div><div className="company-name">{t.company}</div><div className="app-name">{t.appName}</div></div>
          </div>
          <button className="language-toggle" onClick={onToggleLanguage}><Languages size={17} /><span>{language === 'en' ? 'বাংলা' : 'English'}</span></button>
        </div>
        <div className="auth-icon"><ShieldCheck size={28} /></div>
        <h1>{t.loginTitle}</h1>
        <p>{t.loginSubtitle}</p>
        <form onSubmit={submit}>
          <label className="form-field"><span>{t.email}</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@example.com" /></label>
          <label className="form-field"><span>{t.password}</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" /></label>
          {loginError && <div className="form-error">{loginError}</div>}
          <button className="primary-button auth-submit" type="submit" disabled={loggingIn}>{loggingIn ? t.loggingIn : t.login}</button>
        </form>
      </div>
    </div>
  );
}

function LoadingScreen({ language }: { language: Language }) {
  const t = getCopy(language);
  return (
    <div className="auth-shell">
      <div className="loading-card">
        <RefreshCw size={24} className="spin" />
        <strong>{t.loadingCloud}</strong>
      </div>
    </div>
  );
}

function buildLedgerRows(transactions: LedgerTransaction[]) {
  let balance = 0;
  return [...transactions]
    .sort((a, b) => {
      const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    })
    .map((transaction) => {
      balance += transaction.type === 'due' ? transaction.amount : -transaction.amount;
      return { transaction, balance: Math.max(0, balance) };
    })
    .reverse();
}

function StatementModal({
  customer,
  language,
  onClose,
  onAddDue,
  onAddPayment,
  onCopy,
  onDeleteTransaction,
}: {
  customer: CustomerDue;
  language: Language;
  onClose: () => void;
  onAddDue: () => void;
  onAddPayment: () => void;
  onCopy: () => void;
  onDeleteTransaction: (transactionId: string) => void;
}) {
  const t = getCopy(language);
  const rows = buildLedgerRows(customer.transactions);
  const totalDueEntries = customer.transactions.filter((transaction) => transaction.type === 'due').reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalPayments = customer.transactions.filter((transaction) => transaction.type === 'payment').reduce((sum, transaction) => sum + transaction.amount, 0);
  return (
    <div className="modal-backdrop statement-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="statement-modal">
        <div className="statement-topbar no-print">
          <div><span className="eyebrow"><ReceiptText size={15} /> {t.customerStatement}</span><h2>{customer.name}</h2><p>{t.shareHint}</p></div>
          <div className="statement-actions">
            <button className="secondary-button" onClick={onCopy}><ClipboardCopy size={16} />{t.copyDetails}</button>
            <button className="secondary-button" onClick={() => window.print()}><Printer size={16} />{t.printPdf}</button>
            <button className="icon-button" onClick={onClose}><X size={19} /></button>
          </div>
        </div>
        <div className="statement-sheet print-area">
          <div className="statement-brand-row">
            <div className="statement-brand"><div className="brand-mark">SP1</div><div><strong>{t.company}</strong><span>{t.customerStatement}</span></div></div>
            <div className="statement-generated"><span>{t.generatedOn}</span><strong>{formatDate(todayIso(), language)}</strong></div>
          </div>
          <div className="statement-customer-grid">
            <div><span>{t.customer}</span><strong>{customer.name}</strong>{customer.phone && <small>{customer.phone}</small>}</div>
            <div className="statement-balance"><span>{t.currentBalance}</span><strong>{formatMoney(customer.dueAmount, language)}</strong><small>{customer.dueAmount > 0 ? formatDate(customer.lastTransactionDate, language) : t.paid}</small></div>
          </div>
          <div className="statement-summary-grid">
            <div><span>{t.totalDueEntries}</span><strong>{formatMoney(totalDueEntries, language)}</strong></div>
            <div><span>{t.totalPayments}</span><strong>{formatMoney(totalPayments, language)}</strong></div>
            <div><span>{t.transactionHistory}</span><strong>{formatNumber(customer.transactions.length, language)}</strong></div>
          </div>
          <div className="statement-section-heading"><div><h3>{t.transactionHistory}</h3><p>{t.statementSub}</p></div></div>
          <div className="statement-table-wrap">
            <table className="statement-table">
              <thead><tr><th>{t.date}</th><th>{t.details}</th><th>{t.dueColumn}</th><th>{t.paymentColumn}</th><th>{t.balance}</th><th className="no-print"></th></tr></thead>
              <tbody>
                {rows.map(({ transaction, balance }) => (
                  <tr key={transaction.id}>
                    <td>{formatDate(transaction.date, language)}</td>
                    <td><strong>{transaction.title}</strong>{transaction.note && <small>{transaction.note}</small>}</td>
                    <td className="ledger-due">{transaction.type === 'due' ? formatMoney(transaction.amount, language) : '—'}</td>
                    <td className="ledger-payment">{transaction.type === 'payment' ? formatMoney(transaction.amount, language) : '—'}</td>
                    <td className="ledger-balance">{formatMoney(balance, language)}</td>
                    <td className="no-print"><button className="icon-button danger tiny" title={t.deleteTransaction} onClick={() => onDeleteTransaction(transaction.id)}><Trash2 size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <div className="empty-state compact"><ReceiptText size={28} /><strong>{t.noTransactions}</strong></div>}
          </div>
          {customer.note && <div className="statement-note"><strong>{t.accountNote}</strong><p>{customer.note}</p></div>}
          <div className="statement-footer"><span>{t.company}</span><span>{t.currentBalance}: <strong>{formatMoney(customer.dueAmount, language)}</strong></span></div>
        </div>
        <div className="statement-bottom-actions no-print">
          <button className="secondary-button" onClick={onAddDue}><PlusCircle size={17} />{t.addDue}</button>
          <button className="primary-button" disabled={customer.dueAmount <= 0} onClick={onAddPayment}><WalletCards size={17} />{t.addPayment}</button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, detail, icon, tone }: { label: string; value: string; detail: string; icon: React.ReactNode; tone: string }) {
  return <article className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div className="stat-content"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>;
}

function PriorityBadge({ priority, label }: { priority: Priority; label: string }) {
  return <span className={`priority-badge ${priority}`}><i />{label}</span>;
}

export default App;
