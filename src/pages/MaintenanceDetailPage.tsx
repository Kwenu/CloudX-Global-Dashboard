import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftIcon, CheckCircle2Icon, ExternalLinkIcon, FilePlus2Icon, PauseIcon, PencilIcon, PlayIcon, XCircleIcon } from 'lucide-react';
import { toast } from 'sonner';
import { ActivityFeed } from '../components/activity/ActivityFeed';
import { MaintenanceInvoiceModal } from '../components/maintenance/MaintenanceInvoiceModal';
import { MaintenancePlanModal } from '../components/maintenance/MaintenancePlanModal';
import { RecordActivityModal } from '../components/maintenance/RecordActivityModal';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { PageHeader } from '../components/ui/PageHeader';
import { Panel } from '../components/ui/Panel';
import { RowMenu } from '../components/ui/RowMenu';
import { ErrorState, LoadingState } from '../components/ui/States';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useAsync } from '../hooks/useAsync';
import type { MaintenanceLifecycle } from '../types/database';
import { invoiceDisplayStatus } from '../utils/calculations';
import { errorMessage, formatDate, formatMoney } from '../utils/format';
import { frequencyLabels, scheduleStatus } from '../utils/maintenance';

export function MaintenanceDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { api, can } = useAuth();
  const { settings, memberName } = useWorkspace();
  const [recording, setRecording] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [lifecycle, setLifecycle] = useState<MaintenanceLifecycle | null>(null);
  const [working, setWorking] = useState(false);

  const { data, loading, error, reload } = useAsync(async () => {
    const [plans, clients, activities, periods, invoices, log] = await Promise.all([
    api.listPlans(),
    api.listClients(),
    api.listMaintenanceActivities(id),
    api.listBillingPeriods(id),
    api.listInvoices(),
    api.listActivity({ entityId: id, limit: 30 })]
    );
    const plan = plans.find((p) => p.id === id);
    if (!plan) throw new Error('This maintenance plan could not be found.');
    return { plan, clients, client: clients.find((c) => c.id === plan.client_id) ?? null, activities, periods, invoices: invoices.filter((i) => i.maintenance_plan_id === id), log };
  }, [api, id]);

  if (loading && !data) return <LoadingState label="Loading plan…" />;
  if (error || !data) return <ErrorState message={error ?? 'Unavailable'} onRetry={reload} />;

  const { plan, client, activities, periods, invoices, log } = data;
  const status = scheduleStatus(plan, settings?.maintenance_due_soon_days ?? 7);
  const canMaint = can('maintenance.write');

  async function changeLifecycle() {
    if (!lifecycle) return;
    setWorking(true);
    try {
      const { id: planId, company_id: _c, created_by: _b, created_at: _a, updated_at: _u, ...rest } = plan;
      await api.savePlan({ ...rest, id: planId, status: lifecycle });
      toast.success('Plan status updated');
      setLifecycle(null);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setWorking(false);
    }
  }

  const lifecycleCopy: Record<MaintenanceLifecycle, string> = {
    active: 'Resume this plan? Schedule statuses will be calculated from its next maintenance date again.',
    on_hold: 'Put this plan on hold? It will stop appearing as due or overdue until resumed.',
    completed: 'Mark this plan as completed? Use this when the maintenance engagement has ended.',
    cancelled: 'Cancel this plan? It can no longer be invoiced. History is kept.'
  };

  return (
    <div>
      <PageHeader
        back={<Link to="/maintenance" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink"><ArrowLeftIcon className="h-3.5 w-3.5" /> Maintenance</Link>}
        title={plan.project_name}
        description={
        <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            <span>{plan.service_type}</span>
            {client && <><span aria-hidden>·</span><Link to={`/clients/${client.id}`} className="text-brand hover:underline">{client.name}</Link></>}
          </span>
        }
        actions={
        <>
            {canMaint && plan.status === 'active' && <Button variant="secondary" icon={<CheckCircle2Icon className="h-4 w-4" />} onClick={() => setRecording(true)}>Record maintenance</Button>}
            {can('documents.write') && plan.status !== 'cancelled' && <Button icon={<FilePlus2Icon className="h-4 w-4" />} onClick={() => setInvoicing(true)}>Generate invoice</Button>}
            {canMaint &&
          <RowMenu
            items={[
            { label: 'Edit plan', icon: PencilIcon, onSelect: () => setEditing(true) },
            { label: 'Put on hold', icon: PauseIcon, onSelect: () => setLifecycle('on_hold'), hidden: plan.status !== 'active' },
            { label: 'Resume', icon: PlayIcon, onSelect: () => setLifecycle('active'), hidden: plan.status === 'active' || plan.status === 'cancelled' },
            { label: 'Mark completed', icon: CheckCircle2Icon, onSelect: () => setLifecycle('completed'), hidden: plan.status === 'completed' || plan.status === 'cancelled' },
            { label: 'Cancel plan', icon: XCircleIcon, tone: 'danger', onSelect: () => setLifecycle('cancelled'), hidden: plan.status === 'cancelled' }]
            } />

          }
          </>
        } />
      

      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-5">
          <Panel bodyClassName="p-5">
            <p className="text-xs text-muted">Next maintenance</p>
            <p className="mt-0.5 text-2xl font-semibold tracking-tight">{formatDate(plan.next_maintenance_date)}</p>
            <dl className="mt-4 space-y-2.5 border-t border-line pt-4 text-[13px]">
              <div className="flex justify-between"><dt className="text-muted">Charge</dt><dd className="font-medium tabular">{formatMoney(plan.charge, plan.currency)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Billing</dt><dd>{frequencyLabels[plan.billing_frequency]}{plan.billing_frequency === 'custom' ? ` (${plan.custom_interval_days} days)` : ''}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Last maintenance</dt><dd>{formatDate(plan.last_maintenance_date)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Started</dt><dd>{formatDate(plan.start_date)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Responsible</dt><dd>{plan.assigned_to ? memberName(plan.assigned_to) : '—'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">Payment terms</dt><dd className="text-right">{plan.payment_terms || '—'}</dd></div>
              {plan.project_url &&
              <div className="flex justify-between gap-4"><dt className="text-muted">URL</dt><dd className="truncate"><a href={plan.project_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">{plan.project_url.replace(/^https?:\/\//, '')} <ExternalLinkIcon className="h-3 w-3" /></a></dd></div>
              }
            </dl>
            {(plan.description || plan.notes) &&
            <div className="mt-4 space-y-2 border-t border-line pt-4 text-[13px]">
                {plan.description && <p className="whitespace-pre-line text-ink/80">{plan.description}</p>}
                {plan.notes && <p className="whitespace-pre-line text-muted">{plan.notes}</p>}
              </div>
            }
          </Panel>

          <Panel title="Changes" bodyClassName="px-5 pt-4">
            {log.length === 0 ? <p className="pb-4 text-[13px] text-muted">No changes recorded.</p> : <ActivityFeed entries={log} compact />}
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Billing periods" description="Each period can be invoiced once. Payment status comes from the linked invoice." bodyClassName="py-1">
            {periods.length === 0 ?
            <p className="px-5 py-6 text-[13px] text-muted">No periods invoiced yet. Use “Generate invoice” to bill the first period.</p> :

            <ul className="divide-y divide-line">
                {periods.map((p) => {
                const inv = invoices.find((i) => i.id === p.invoice_id);
                return (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-[13px]">
                      <div>
                        <p className="font-medium">{formatDate(p.period_start)} – {formatDate(p.period_end)}</p>
                        {inv ? <Link to={`/invoices/${inv.id}`} className="text-xs text-brand hover:underline">{inv.number} · {formatMoney(inv.total, inv.currency)}</Link> : <p className="text-xs text-muted">Invoice removed</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={p.status} />
                        {inv && inv.status !== 'paid' && <StatusBadge status={invoiceDisplayStatus(inv)} />}
                      </div>
                    </li>);

              })}
              </ul>
            }
          </Panel>

          <Panel title="Maintenance history" description={`${activities.length} visit${activities.length === 1 ? '' : 's'} recorded`} bodyClassName="py-1">
            {activities.length === 0 ?
            <p className="px-5 py-6 text-[13px] text-muted">No maintenance recorded yet.</p> :

            <ol className="divide-y divide-line">
                {activities.map((a) =>
              <li key={a.id} className="px-5 py-3.5 text-[13px]">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium">{formatDate(a.completed_on)}</p>
                      <p className="text-xs text-muted">{a.assigned_to ? memberName(a.assigned_to) : '—'}{a.next_scheduled_date ? ` · next ${formatDate(a.next_scheduled_date)}` : ''}</p>
                    </div>
                    <p className="mt-1 whitespace-pre-line text-ink/80">{a.work_performed}</p>
                    {a.notes && <p className="mt-1 text-xs text-muted">{a.notes}</p>}
                  </li>
              )}
              </ol>
            }
          </Panel>
        </div>
      </div>

      <RecordActivityModal open={recording} onClose={() => setRecording(false)} onSaved={reload} plan={plan} />
      <MaintenanceInvoiceModal open={invoicing} onClose={() => setInvoicing(false)} plan={plan} periods={periods} onCreated={(invoiceId) => navigate(`/invoices/${invoiceId}/edit`)} />
      <MaintenancePlanModal open={editing} onClose={() => setEditing(false)} plan={plan} clients={data.clients} onClientCreated={reload} onSaved={reload} />
      <ConfirmDialog
        open={Boolean(lifecycle)}
        title="Change plan status?"
        message={lifecycle ? lifecycleCopy[lifecycle] : ''}
        confirmLabel="Confirm"
        tone={lifecycle === 'cancelled' ? 'danger' : 'primary'}
        loading={working}
        onConfirm={() => void changeLifecycle()}
        onClose={() => setLifecycle(null)} />
      
    </div>);

}