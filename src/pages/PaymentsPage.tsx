import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PlusIcon, SearchIcon, WalletIcon } from 'lucide-react';
import { RecordPaymentModal } from '../components/payments/RecordPaymentModal';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Input, Select } from '../components/ui/FormControls';
import { PageHeader } from '../components/ui/PageHeader';
import { ErrorState, SkeletonRows } from '../components/ui/States';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { paymentMethodLabels } from '../data/navigation';
import { useAsync } from '../hooks/useAsync';
import { isOutstanding } from '../utils/calculations';
import { formatDate, formatMoney, todayISO } from '../utils/format';

export function PaymentsPage() {
  const { api, can } = useAuth();
  const { memberName } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [method, setMethod] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data, loading, error, reload } = useAsync(() => Promise.all([api.listPayments(), api.listInvoices(), api.listClients()]), [api]);

  const view = useMemo(() => {
    if (!data) return null;
    const [payments, invoices, clients] = data;
    const invoiceMap = new Map(invoices.map((i) => [i.id, i]));
    const clientMap = new Map(clients.map((c) => [c.id, c]));
    const q = query.trim().toLowerCase();
    const rows = payments.filter((p) => {
      if (method && p.method !== method) return false;
      if (from && p.payment_date < from) return false;
      if (to && p.payment_date > to) return false;
      if (!q) return true;
      const inv = invoiceMap.get(p.invoice_id);
      const client = inv ? clientMap.get(inv.client_id) : undefined;
      return [inv?.number, client?.name, client?.business_name, p.reference, p.notes].join(' ').toLowerCase().includes(q);
    });
    const month = todayISO().slice(0, 7);
    return {
      rows,
      invoiceMap,
      clientMap,
      invoices,
      clients,
      total: rows.reduce((s, p) => s + p.amount, 0),
      thisMonth: payments.filter((p) => p.payment_date.startsWith(month)).reduce((s, p) => s + p.amount, 0),
      awaiting: invoices.filter((i) => isOutstanding(i) && i.currency === 'LKR').reduce((s, i) => s + i.balance_due, 0)
    };
  }, [data, query, method, from, to]);

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Full, partial and advance payments recorded against invoices."
        actions={can('payments.write') && <Button icon={<PlusIcon className="h-4 w-4" />} onClick={() => setOpen(true)}>Record payment</Button>} />
      

      {view &&
      <div className="mb-6 grid gap-px overflow-hidden rounded-xl border border-line bg-line shadow-card sm:grid-cols-3">
          <div className="bg-surface px-5 py-4"><p className="text-xs text-muted">Received this month</p><p className="mt-1 text-xl font-semibold tabular">{formatMoney(view.thisMonth)}</p></div>
          <div className="bg-surface px-5 py-4"><p className="text-xs text-muted">Awaiting payment</p><p className="mt-1 text-xl font-semibold tabular">{formatMoney(view.awaiting)}</p></div>
          <div className="bg-surface px-5 py-4"><p className="text-xs text-muted">Total in current view</p><p className="mt-1 text-xl font-semibold tabular">{formatMoney(view.total)}</p></div>
        </div>
      }

      <div className="rounded-xl border border-line bg-surface shadow-card">
        <div className="flex flex-col gap-2 border-b border-line p-3 md:flex-row">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search invoice, client or reference" className="h-9 pl-9" aria-label="Search payments" />
          </div>
          <div className="grid grid-cols-3 gap-2 md:flex">
            <Select value={method} onChange={(e) => setMethod(e.target.value)} className="h-9 md:w-40" aria-label="Payment method">
              <option value="">All methods</option>
              {Object.entries(paymentMethodLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 md:w-36" aria-label="From date" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 md:w-36" aria-label="To date" />
          </div>
        </div>

        {error ?
        <ErrorState message={error} onRetry={reload} /> :
        loading && !data ?
        <SkeletonRows /> :
        !view || view.rows.length === 0 ?
        <EmptyState icon={WalletIcon} title="No payments recorded" description="Record a payment against an issued invoice and the balance updates automatically." /> :

        <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="px-5 py-2.5 font-medium">Date</th>
                  <th className="px-3 py-2.5 font-medium">Invoice</th>
                  <th className="px-3 py-2.5 font-medium">Client</th>
                  <th className="px-3 py-2.5 font-medium">Method</th>
                  <th className="px-3 py-2.5 font-medium">Recorded by</th>
                  <th className="px-5 py-2.5 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {view.rows.map((p) => {
                const inv = view.invoiceMap.get(p.invoice_id);
                const client = inv ? view.clientMap.get(inv.client_id) : undefined;
                return (
                  <tr key={p.id}>
                      <td className="whitespace-nowrap px-5 py-3 text-muted">{formatDate(p.payment_date)}</td>
                      <td className="px-3 py-3">{inv ? <Link to={`/invoices/${inv.id}`} className="font-medium text-ink hover:text-brand tabular">{inv.number}</Link> : '—'}</td>
                      <td className="max-w-[200px] truncate px-3 py-3 text-ink/80">{client?.name ?? '—'}</td>
                      <td className="px-3 py-3 text-muted">{paymentMethodLabels[p.method]}{p.reference ? <span className="block text-xs">{p.reference}</span> : null}</td>
                      <td className="px-3 py-3 text-muted">{memberName(p.recorded_by)}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-right font-semibold tabular">{formatMoney(p.amount, inv?.currency)}</td>
                    </tr>);

              })}
              </tbody>
            </table>
          </div>
        }
      </div>

      <RecordPaymentModal open={open} onClose={() => setOpen(false)} onRecorded={reload} invoices={view?.invoices ?? []} clients={view?.clients ?? []} />
    </div>);

}