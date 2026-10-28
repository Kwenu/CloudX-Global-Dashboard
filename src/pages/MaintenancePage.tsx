import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PlusIcon, SearchIcon, WrenchIcon } from 'lucide-react';
import { MaintenancePlanModal } from '../components/maintenance/MaintenancePlanModal';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Input, Select } from '../components/ui/FormControls';
import { PageHeader } from '../components/ui/PageHeader';
import { ErrorState, SkeletonRows } from '../components/ui/States';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useAsync } from '../hooks/useAsync';
import type { Client, MaintenanceScheduleStatus } from '../types/database';
import { isOutstanding } from '../utils/calculations';
import { formatDate, formatMoney } from '../utils/format';
import { daysUntil, frequencyLabels, monthlyValue, scheduleStatus } from '../utils/maintenance';

type Range = 'all' | '7' | '30' | '90';

export function MaintenancePage() {
  const { api, can } = useAuth();
  const { settings, memberName } = useWorkspace();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [range, setRange] = useState<Range>('all');
  const [statusFilter, setStatusFilter] = useState<'' | MaintenanceScheduleStatus>('');
  const [query, setQuery] = useState('');
  const [extraClients, setExtraClients] = useState<Client[]>([]);
  const adding = params.get('new') === '1';

  const { data, loading, error, reload } = useAsync(() => Promise.all([api.listPlans(), api.listClients(), api.listInvoices()]), [api]);
  const dueSoonDays = settings?.maintenance_due_soon_days ?? 7;

  const view = useMemo(() => {
    if (!data) return null;
    const [plans, clients, invoices] = data;
    const clientMap = new Map(clients.map((c) => [c.id, c]));
    const enriched = plans.map((p) => ({ plan: p, status: scheduleStatus(p, dueSoonDays) }));
    const q = query.trim().toLowerCase();
    const rows = enriched.
    filter(({ plan, status }) => {
      if (statusFilter && status !== statusFilter) return false;
      if (range !== 'all') {
        if (!plan.next_maintenance_date || plan.status !== 'active') return false;
        const d = daysUntil(plan.next_maintenance_date);
        if (d > Number(range)) return false;
      }
      if (!q) return true;
      const c = clientMap.get(plan.client_id);
      return [plan.project_name, plan.service_type, plan.project_url, c?.name, c?.business_name].join(' ').toLowerCase().includes(q);
    }).
    sort((a, b) => (a.plan.next_maintenance_date ?? '9999').localeCompare(b.plan.next_maintenance_date ?? '9999'));
    const count = (s: MaintenanceScheduleStatus) => enriched.filter((e) => e.status === s).length;
    const activePlans = plans.filter((p) => p.status === 'active');
    return {
      clients,
      clientMap,
      rows,
      active: activePlans.length,
      dueToday: count('due'),
      dueSoon: count('due_soon'),
      overdue: count('overdue'),
      recurring: activePlans.filter((p) => p.currency === 'LKR').reduce((s, p) => s + monthlyValue(p), 0),
      outstandingInvoices: invoices.filter((i) => i.maintenance_plan_id && isOutstanding(i))
    };
  }, [data, dueSoonDays, query, range, statusFilter]);

  const closeModal = () => {
    params.delete('new');
    params.delete('client');
    setParams(params, { replace: true });
  };

  const metric = (label: string, value: string, tone?: 'danger' | 'warning', onClick?: () => void) =>
  <button type="button" onClick={onClick} disabled={!onClick} className="bg-surface px-5 py-4 text-left transition-colors duration-150 enabled:hover:bg-ink/[0.02]">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular ${tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-ink'}`}>{value}</p>
    </button>;


  return (
    <div>
      <PageHeader
        title="Maintenance"
        description="Recurring maintenance schedules, completed work and billing for client projects."
        actions={can('maintenance.write') && <Button icon={<PlusIcon className="h-4 w-4" />} onClick={() => setParams({ new: '1' })}>Add plan</Button>} />
      

      {view &&
      <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line shadow-card md:grid-cols-3 xl:grid-cols-6">
          {metric('Active plans', String(view.active), undefined, () => {setStatusFilter('');setRange('all');})}
          {metric('Due today', String(view.dueToday), view.dueToday ? 'warning' : undefined, () => setStatusFilter('due'))}
          {metric('Due soon', String(view.dueSoon), undefined, () => setStatusFilter('due_soon'))}
          {metric('Overdue', String(view.overdue), view.overdue ? 'danger' : undefined, () => setStatusFilter('overdue'))}
          {metric('Recurring value / month', formatMoney(view.recurring))}
          {metric('Unpaid maintenance invoices', String(view.outstandingInvoices.length), undefined, view.outstandingInvoices.length ? () => navigate('/invoices') : undefined)}
        </div>
      }

      <div className="rounded-xl border border-line bg-surface shadow-card">
        <div className="flex flex-col gap-2 border-b border-line p-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search project, client or service" className="h-9 pl-9" aria-label="Search plans" />
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex rounded-lg border border-line p-0.5" role="group" aria-label="Upcoming range">
              {(['all', '7', '30', '90'] as Range[]).map((r) =>
              <button key={r} type="button" onClick={() => setRange(r)} className={`rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors duration-150 ${range === r ? 'bg-ink text-on-ink' : 'text-muted hover:text-ink'}`}>
                  {r === 'all' ? 'All' : `Next ${r} days`}
                </button>
              )}
            </div>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as MaintenanceScheduleStatus | '')} className="h-9 w-40" aria-label="Status">
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="due_soon">Due soon</option>
              <option value="due">Due today</option>
              <option value="overdue">Overdue</option>
              <option value="on_hold">On hold</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </div>
        </div>

        {error ?
        <ErrorState message={error} onRetry={reload} /> :
        loading && !data ?
        <SkeletonRows /> :
        !view || view.rows.length === 0 ?
        <EmptyState
          icon={WrenchIcon}
          title={data?.[0].length ? 'No plans match these filters' : 'No maintenance plans yet'}
          description={data?.[0].length ? 'Adjust the range or status filter.' : 'Track recurring maintenance for client websites and systems, then invoice each billing period.'}
          action={!data?.[0].length && can('maintenance.write') ? <Button onClick={() => setParams({ new: '1' })}>Add maintenance plan</Button> : undefined} /> :


        <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="px-5 py-2.5 font-medium">Project</th>
                  <th className="px-3 py-2.5 font-medium">Client</th>
                  <th className="px-3 py-2.5 font-medium">Charge</th>
                  <th className="px-3 py-2.5 font-medium">Last</th>
                  <th className="px-3 py-2.5 font-medium">Next</th>
                  <th className="px-3 py-2.5 font-medium">Responsible</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {view.rows.map(({ plan, status }) => {
                const d = plan.next_maintenance_date ? daysUntil(plan.next_maintenance_date) : null;
                return (
                  <tr key={plan.id} onClick={() => navigate(`/maintenance/${plan.id}`)} className="cursor-pointer transition-colors duration-150 hover:bg-ink/[0.02]">
                      <td className="px-5 py-3"><p className="font-medium">{plan.project_name}</p><p className="text-xs text-muted">{plan.service_type}</p></td>
                      <td className="max-w-[180px] truncate px-3 py-3 text-ink/80">{view.clientMap.get(plan.client_id)?.name ?? '—'}</td>
                      <td className="whitespace-nowrap px-3 py-3"><span className="tabular">{formatMoney(plan.charge, plan.currency)}</span><span className="block text-xs text-muted">{frequencyLabels[plan.billing_frequency]}{plan.billing_frequency === 'custom' ? ` · ${plan.custom_interval_days}d` : ''}</span></td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted">{formatDate(plan.last_maintenance_date)}</td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {formatDate(plan.next_maintenance_date)}
                        {d !== null && plan.status === 'active' && <span className={`block text-xs ${d < 0 ? 'text-danger' : 'text-muted'}`}>{d < 0 ? `${Math.abs(d)} days overdue` : d === 0 ? 'Today' : `in ${d} days`}</span>}
                      </td>
                      <td className="px-3 py-3 text-muted">{plan.assigned_to ? memberName(plan.assigned_to) : '—'}</td>
                      <td className="px-5 py-3"><StatusBadge status={status} /></td>
                    </tr>);

              })}
              </tbody>
            </table>
          </div>
        }
      </div>

      <MaintenancePlanModal
        open={adding}
        onClose={closeModal}
        clients={[...(view?.clients ?? []), ...extraClients]}
        onClientCreated={(c) => setExtraClients((list) => [...list, c])}
        presetClientId={params.get('client')}
        onSaved={(p) => navigate(`/maintenance/${p.id}`)} />
      
    </div>);

}