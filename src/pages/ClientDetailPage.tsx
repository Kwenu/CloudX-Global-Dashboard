import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeftIcon, FilePlus2Icon, FileSignatureIcon, PencilIcon, WrenchIcon } from 'lucide-react';
import { ClientFormModal } from '../components/clients/ClientFormModal';
import { Button, buttonStyles } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { Panel } from '../components/ui/Panel';
import { ErrorState, LoadingState } from '../components/ui/States';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useAsync } from '../hooks/useAsync';
import { invoiceDisplayStatus, isOutstanding, quotationDisplayStatus } from '../utils/calculations';
import { formatDate, formatMoney } from '../utils/format';
import { frequencyLabels, scheduleStatus } from '../utils/maintenance';

type Tab = 'invoices' | 'quotations' | 'maintenance';

export function ClientDetailPage() {
  const { id = '' } = useParams();
  const { api, can } = useAuth();
  const { settings } = useWorkspace();
  const [tab, setTab] = useState<Tab>('invoices');
  const [editing, setEditing] = useState(false);

  const { data, loading, error, reload } = useAsync(async () => {
    const [clients, invoices, quotations, plans] = await Promise.all([api.listClients(), api.listInvoices(), api.listQuotations(), api.listPlans()]);
    const client = clients.find((c) => c.id === id);
    if (!client) throw new Error('This client could not be found.');
    return {
      clients,
      client,
      invoices: invoices.filter((i) => i.client_id === id),
      quotations: quotations.filter((q) => q.client_id === id),
      plans: plans.filter((p) => p.client_id === id)
    };
  }, [api, id]);

  if (loading && !data) return <LoadingState label="Loading client…" />;
  if (error || !data) return <ErrorState message={error ?? 'Unavailable'} onRetry={reload} />;

  const { client, invoices, quotations, plans } = data;
  const lkr = invoices.filter((i) => i.currency === 'LKR' && i.status !== 'draft' && i.status !== 'cancelled');
  const invoiced = lkr.reduce((s, i) => s + i.total, 0);
  const paid = lkr.reduce((s, i) => s + i.amount_paid, 0);
  const outstanding = lkr.filter(isOutstanding).reduce((s, i) => s + i.balance_due, 0);

  const tabs: {id: Tab;label: string;count: number;}[] = [
  { id: 'invoices', label: 'Invoices', count: invoices.length },
  { id: 'quotations', label: 'Quotations', count: quotations.length },
  { id: 'maintenance', label: 'Maintenance', count: plans.length }];


  return (
    <div>
      <PageHeader
        back={<Link to="/clients" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink"><ArrowLeftIcon className="h-3.5 w-3.5" /> Clients</Link>}
        title={client.name}
        description={client.business_name || undefined}
        actions={
        <>
            {can('clients.write') && <Button variant="secondary" icon={<PencilIcon className="h-4 w-4" />} onClick={() => setEditing(true)}>Edit</Button>}
            {can('documents.write') &&
          <>
                <Link to={`/quotations/new?client=${client.id}`} className={buttonStyles('secondary')}><FileSignatureIcon className="h-4 w-4" /> Quotation</Link>
                <Link to={`/invoices/new?client=${client.id}`} className={buttonStyles('primary')}><FilePlus2Icon className="h-4 w-4" /> Invoice</Link>
              </>
          }
          </>
        } />
      

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-5">
          <Panel bodyClassName="p-5">
            <p className="text-xs text-muted">Outstanding</p>
            <p className="mt-0.5 text-[28px] font-semibold tracking-tight tabular">{formatMoney(outstanding)}</p>
            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4 text-[13px]">
              <div><p className="text-muted">Invoiced</p><p className="font-medium tabular">{formatMoney(invoiced)}</p></div>
              <div><p className="text-muted">Paid</p><p className="font-medium tabular">{formatMoney(paid)}</p></div>
            </div>
          </Panel>
          <Panel title="Details" bodyClassName="p-5">
            <dl className="space-y-3 text-[13px]">
              {[
              ['Email', client.email],
              ['Phone', client.phone],
              ['Billing address', client.billing_address],
              ['Registration / tax ID', client.tax_id],
              ['Notes', client.notes]].
              map(([label, value]) =>
              <div key={label}>
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="mt-0.5 whitespace-pre-line text-ink">{value || '—'}</dd>
                </div>
              )}
            </dl>
          </Panel>
        </div>

        <div className="rounded-xl border border-line bg-surface shadow-card">
          <div className="flex gap-1 border-b border-line px-3" role="tablist">
            {tabs.map((t) =>
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`relative px-3 py-3 text-[13px] font-medium transition-colors duration-150 ${tab === t.id ? 'text-ink' : 'text-muted hover:text-ink'}`}>
                {t.label} <span className="ml-1 text-xs text-muted tabular">{t.count}</span>
                {tab === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />}
              </button>
            )}
          </div>
          <ul className="divide-y divide-line">
            {tab === 'invoices' && invoices.map((i) =>
            <li key={i.id}>
                <Link to={`/invoices/${i.id}`} className="flex items-center justify-between gap-3 px-5 py-3 transition-colors duration-150 hover:bg-ink/[0.02]">
                  <div className="min-w-0"><p className="text-sm font-medium tabular">{i.number}</p><p className="truncate text-xs text-muted">{i.project_reference || '—'} · due {formatDate(i.due_date)}</p></div>
                  <div className="flex items-center gap-3"><span className="text-sm tabular">{formatMoney(i.total, i.currency)}</span><StatusBadge status={invoiceDisplayStatus(i)} /></div>
                </Link>
              </li>
            )}
            {tab === 'quotations' && quotations.map((q) =>
            <li key={q.id}>
                <Link to={`/quotations/${q.id}`} className="flex items-center justify-between gap-3 px-5 py-3 transition-colors duration-150 hover:bg-ink/[0.02]">
                  <div className="min-w-0"><p className="text-sm font-medium tabular">{q.number}</p><p className="truncate text-xs text-muted">{q.project_title || '—'} · valid until {formatDate(q.valid_until)}</p></div>
                  <div className="flex items-center gap-3"><span className="text-sm tabular">{formatMoney(q.total, q.currency)}</span><StatusBadge status={quotationDisplayStatus(q)} /></div>
                </Link>
              </li>
            )}
            {tab === 'maintenance' && plans.map((p) =>
            <li key={p.id}>
                <Link to={`/maintenance/${p.id}`} className="flex items-center justify-between gap-3 px-5 py-3 transition-colors duration-150 hover:bg-ink/[0.02]">
                  <div className="min-w-0"><p className="text-sm font-medium">{p.project_name}</p><p className="truncate text-xs text-muted">{formatMoney(p.charge, p.currency)} · {frequencyLabels[p.billing_frequency]} · next {formatDate(p.next_maintenance_date)}</p></div>
                  <StatusBadge status={scheduleStatus(p, settings?.maintenance_due_soon_days ?? 7)} />
                </Link>
              </li>
            )}
          </ul>
          {tabs.find((t) => t.id === tab)?.count === 0 &&
          <div className="px-5 py-10 text-center text-[13px] text-muted">
              No {tab === 'maintenance' ? 'maintenance plans' : tab} for this client yet.
              {tab === 'maintenance' && can('maintenance.write') &&
            <Link to={`/maintenance?new=1&client=${client.id}`} className="ml-1 inline-flex items-center gap-1 font-medium text-brand hover:underline"><WrenchIcon className="h-3.5 w-3.5" /> Add plan</Link>
            }
            </div>
          }
        </div>
      </div>

      <ClientFormModal open={editing} onClose={() => setEditing(false)} existing={data.clients} client={client} onSaved={reload} />
    </div>);

}