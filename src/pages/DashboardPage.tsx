import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRightIcon, DatabaseIcon, FilePlus2Icon, FileSignatureIcon, UserPlusIcon, WrenchIcon } from 'lucide-react';
import { ActivityFeed } from '../components/activity/ActivityFeed';
import { CashflowChart } from '../components/dashboard/CashflowChart';
import { buttonStyles } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Panel } from '../components/ui/Panel';
import { ErrorState, LoadingState } from '../components/ui/States';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useAsync } from '../hooks/useAsync';
import { invoiceDisplayStatus, isOutstanding, quotationDisplayStatus } from '../utils/calculations';
import { formatDate, formatMoney } from '../utils/format';
import { daysUntil, monthlyValue, scheduleStatus } from '../utils/maintenance';

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** The signed-in director's name for the greeting: profile name, otherwise a tidy version of their email. */
function directorName(displayName: string | undefined, email: string | undefined): string {
  const name = (displayName ?? '').trim();
  if (name) return name;
  return (email ?? '').
  split('@')[0].
  replace(/[._-]+/g, ' ').
  replace(/\b\w/g, (c) => c.toUpperCase()).
  trim();
}

function Figure({ label, value, hint, tone }: {label: string;value: string;hint?: string;tone?: 'danger';}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 truncate text-lg font-semibold tracking-tight tabular ${tone === 'danger' ? 'text-danger' : 'text-ink'}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>);

}

export function DashboardPage() {
  const { api, member, user, can } = useAuth();
  const { settings } = useWorkspace();
  const { data, loading, error, reload } = useAsync(
    () => Promise.all([api.listInvoices(), api.listQuotations(), api.listPayments(), api.listPlans(), api.listClients(), api.listActivity({ limit: 8 })]),
    [api]
  );

  const stats = useMemo(() => {
    if (!data) return null;
    const [invoices, quotations, payments, plans, clients] = data;
    const live = invoices.filter((i) => i.status !== 'draft' && i.status !== 'cancelled' && i.currency === 'LKR');
    const overdue = invoices.filter((i) => !i.archived_at && invoiceDisplayStatus(i) === 'overdue');
    const dueSoonDays = settings?.maintenance_due_soon_days ?? 7;
    const plansWithStatus = plans.map((p) => ({ p, s: scheduleStatus(p, dueSoonDays) }));
    const activePlans = plans.filter((p) => p.status === 'active');
    return {
      clients,
      totalInvoiced: live.reduce((s, i) => s + i.total, 0),
      received: payments.reduce((s, p) => s + p.amount, 0),
      outstanding: live.filter(isOutstanding).reduce((s, i) => s + i.balance_due, 0),
      overdue,
      overdueAmount: overdue.reduce((s, i) => s + i.balance_due, 0),
      totalInvoices: invoices.filter((i) => !i.archived_at).length,
      awaiting: quotations.filter((q) => !q.archived_at && quotationDisplayStatus(q) === 'sent'),
      accepted: quotations.filter((q) => q.status === 'accepted' || q.status === 'converted').length,
      recentQuotes: quotations.filter((q) => !q.archived_at).slice(0, 4),
      activePlans: activePlans.length,
      dueSoon: plansWithStatus.filter(({ s }) => s === 'due_soon' || s === 'due').length,
      overduePlans: plansWithStatus.filter(({ s }) => s === 'overdue').length,
      outstandingMaintenance: invoices.filter((i) => i.maintenance_plan_id && isOutstanding(i)).length,
      recurring: activePlans.filter((p) => p.currency === 'LKR').reduce((s, p) => s + monthlyValue(p), 0),
      upcoming: plansWithStatus.
      filter(({ p }) => p.status === 'active' && p.next_maintenance_date).
      sort((a, b) => (a.p.next_maintenance_date ?? '').localeCompare(b.p.next_maintenance_date ?? '')).
      slice(0, 4)
    };
  }, [data, settings]);

  if (loading && !data) return <LoadingState label="Loading dashboard…" />;
  if (error || !data || !stats) return <ErrorState message={error ?? 'Unavailable'} onRetry={reload} />;

  const [invoices,, payments,,, activity] = data;
  const clientName = (id: string) => stats.clients.find((c) => c.id === id)?.name ?? 'Client';
  const isEmpty = invoices.length === 0 && data[1].length === 0 && stats.clients.length === 0;
  const name = directorName(member?.profile?.display_name, member?.profile?.email ?? user?.email);
  const jobTitle = member?.profile?.job_title?.trim();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[13px] text-muted">
            {formatDate(new Date().toISOString())}
            {jobTitle ? ` · ${jobTitle}` : ''}
          </p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">
            {greeting()}
            {name ? <>, <span className="text-brand">{name}</span></> : ''}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('documents.write') &&
          <>
              <Link to="/invoices/new" className={buttonStyles('primary')}><FilePlus2Icon className="h-4 w-4" /> Create invoice</Link>
              <Link to="/quotations/new" className={buttonStyles('secondary')}><FileSignatureIcon className="h-4 w-4" /> Create quotation</Link>
            </>
          }
          {can('clients.write') && <Link to="/clients?new=1" className={buttonStyles('secondary')}><UserPlusIcon className="h-4 w-4" /> Add client</Link>}
          {can('maintenance.write') && <Link to="/maintenance?new=1" className={buttonStyles('secondary')}><WrenchIcon className="h-4 w-4" /> Add maintenance plan</Link>}
        </div>
      </div>

      {isEmpty &&
      <Panel>
          <EmptyState
          icon={DatabaseIcon}
          title="Your CloudX workspace is ready"
          description="Start by adding a client, then create a quotation or invoice. Every figure on this dashboard is calculated from the records you create."
          action={
          <div className="flex flex-wrap justify-center gap-2">
                <Link to="/clients?new=1" className={buttonStyles('primary')}>Add your first client</Link>
                <Link to="/settings/payment" className={buttonStyles('secondary')}>Add bank details</Link>

              </div>
          } />
        
        </Panel>
      }

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel className="xl:col-span-2" bodyClassName="p-5 md:p-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-[13px] font-medium text-muted">Outstanding balance</p>
              <p className="mt-1 text-[36px] font-semibold leading-none tracking-tight tabular">{formatMoney(stats.outstanding)}</p>
              <p className="mt-2 text-[13px] text-muted">Across issued invoices in LKR</p>
            </div>
            <div className="grid grid-cols-3 gap-6 md:w-[420px]">
              <Figure label="Total invoiced" value={formatMoney(stats.totalInvoiced)} />
              <Figure label="Payments received" value={formatMoney(stats.received)} />
              <Figure label="Overdue" value={formatMoney(stats.overdueAmount)} hint={`${stats.overdue.length} invoice${stats.overdue.length === 1 ? '' : 's'}`} tone={stats.overdue.length ? 'danger' : undefined} />
            </div>
          </div>
          <div className="mt-6">
            <div className="mb-2 flex items-center gap-4 text-xs text-muted">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-ink" /> Invoiced</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-brand" /> Received</span>
            </div>
            <CashflowChart invoices={invoices} payments={payments} />
          </div>
        </Panel>

        <Panel title="Overdue invoices" action={<Link to="/invoices" className="text-xs font-medium text-brand hover:underline">View all</Link>} bodyClassName="py-1">
          {stats.overdue.length === 0 ?
          <p className="px-5 py-8 text-center text-[13px] text-muted">No overdue invoices.</p> :

          <ul className="divide-y divide-line">
              {stats.overdue.slice(0, 6).map((inv) =>
            <li key={inv.id}>
                  <Link to={`/invoices/${inv.id}`} className="flex items-center justify-between gap-3 px-5 py-3 transition-colors duration-150 hover:bg-ink/[0.02]">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium">{clientName(inv.client_id)}</p>
                      <p className="text-xs text-muted">{inv.number} · {Math.abs(daysUntil(inv.due_date))} days late</p>
                    </div>
                    <span className="whitespace-nowrap text-[13px] font-semibold text-danger tabular">{formatMoney(inv.balance_due, inv.currency)}</span>
                  </Link>
                </li>
            )}
            </ul>
          }
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Panel title="Documents" action={<Link to="/documents" className="text-xs font-medium text-brand hover:underline">Library</Link>} bodyClassName="p-5">
          <div className="grid grid-cols-3 gap-4 border-b border-line pb-4">
            <Figure label="Invoices" value={String(stats.totalInvoices)} />
            <Figure label="Awaiting decision" value={String(stats.awaiting.length)} />
            <Figure label="Accepted quotes" value={String(stats.accepted)} />
          </div>
          <p className="mb-2 mt-4 text-xs font-medium text-muted">Recent quotations</p>
          {stats.recentQuotes.length === 0 ?
          <p className="py-3 text-[13px] text-muted">No quotations yet.</p> :

          <ul className="space-y-1">
              {stats.recentQuotes.map((q) =>
            <li key={q.id}>
                  <Link to={`/quotations/${q.id}`} className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-ink/[0.03]">
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">{q.project_title || clientName(q.client_id)}</span>
                      <span className="block text-xs text-muted">{q.number} · {formatMoney(q.total, q.currency)}</span>
                    </span>
                    <StatusBadge status={quotationDisplayStatus(q)} />
                  </Link>
                </li>
            )}
            </ul>
          }
        </Panel>

        <Panel title="Maintenance" action={<Link to="/maintenance" className="text-xs font-medium text-brand hover:underline">Open</Link>} bodyClassName="p-5">
          <div className="grid grid-cols-2 gap-4 border-b border-line pb-4 sm:grid-cols-4 lg:grid-cols-2 2xl:grid-cols-4">
            <Figure label="Active plans" value={String(stats.activePlans)} />
            <Figure label="Due soon" value={String(stats.dueSoon)} />
            <Figure label="Overdue" value={String(stats.overduePlans)} tone={stats.overduePlans ? 'danger' : undefined} />
            <Figure label="Unpaid invoices" value={String(stats.outstandingMaintenance)} />
          </div>
          <div className="mt-4 flex items-center justify-between text-xs">
            <span className="font-medium text-muted">Upcoming</span>
            <span className="text-muted">Recurring ≈ {formatMoney(stats.recurring)}/mo</span>
          </div>
          {stats.upcoming.length === 0 ?
          <p className="py-3 text-[13px] text-muted">No scheduled maintenance.</p> :

          <ul className="mt-2 space-y-1">
              {stats.upcoming.map(({ p, s }) =>
            <li key={p.id}>
                  <Link to={`/maintenance/${p.id}`} className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-ink/[0.03]">
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">{p.project_name}</span>
                      <span className="block text-xs text-muted">{clientName(p.client_id)} · {formatDate(p.next_maintenance_date)}</span>
                    </span>
                    <StatusBadge status={s} />
                  </Link>
                </li>
            )}
            </ul>
          }
        </Panel>

        <Panel title="Recent activity" action={<Link to="/documents?view=audit" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">Audit trail <ArrowUpRightIcon className="h-3 w-3" /></Link>} className="lg:col-span-2 xl:col-span-1" bodyClassName="px-5 pt-4">
          {activity.length === 0 ? <p className="pb-6 pt-2 text-[13px] text-muted">Actions by any director will appear here.</p> : <ActivityFeed entries={activity} compact />}
        </Panel>
      </div>
    </div>);

}