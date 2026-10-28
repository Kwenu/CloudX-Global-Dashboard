import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import type { BillingPeriod, MaintenancePlan } from '../../types/database';
import { addDaysISO, errorMessage, formatMoney, todayISO } from '../../utils/format';
import { periodEndFor } from '../../utils/maintenance';
import { Button } from '../ui/Button';
import { Field, Input } from '../ui/FormControls';
import { Modal } from '../ui/Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (invoiceId: string) => void;
  plan: MaintenancePlan;
  periods: BillingPeriod[];
}

export function MaintenanceInvoiceModal({ open, onClose, onCreated, plan, periods }: Props) {
  const { api } = useAuth();
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [due, setDue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const latest = [...periods].filter((p) => p.status !== 'void').sort((a, b) => b.period_end.localeCompare(a.period_end))[0];
    const s = latest ? addDaysISO(latest.period_end, 1) : plan.start_date;
    setStart(s);
    setEnd(periodEndFor(s, plan.billing_frequency, plan.custom_interval_days));
    setDue(addDaysISO(todayISO(), 14));
    setError(null);
  }, [open, periods, plan]);

  const duplicate = periods.some((p) => p.period_start === start);

  async function create() {
    setError(null);
    if (!start || !end || !due) return setError('All dates are required.');
    if (end < start) return setError('The period end must be after its start.');
    if (duplicate) return setError('An invoice already exists for this billing period.');
    setSaving(true);
    try {
      const id = await api.createMaintenanceInvoice({ plan_id: plan.id, period_start: start, period_end: end, due_date: due });
      toast.success('Draft maintenance invoice created');
      onCreated(id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generate maintenance invoice"
      description="Creates a draft invoice linked to this plan and billing period. Review it before issuing."
      footer={
      <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={create} loading={saving} disabled={duplicate}>Create draft invoice</Button>
        </>
      }>
      
      <div className="mb-4 rounded-lg bg-canvas px-4 py-3 text-[13px]">
        <p className="font-medium">{plan.project_name} — {plan.service_type}</p>
        <p className="mt-0.5 text-muted">{formatMoney(plan.charge, plan.currency)} · {plan.payment_terms || 'Default payment terms'}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Period start" htmlFor="b-start" required>
          <Input id="b-start" type="date" value={start} onChange={(e) => {setStart(e.target.value);if (e.target.value) setEnd(periodEndFor(e.target.value, plan.billing_frequency, plan.custom_interval_days));}} />
        </Field>
        <Field label="Period end" htmlFor="b-end" required>
          <Input id="b-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        <Field label="Due date" htmlFor="b-due" required>
          <Input id="b-due" type="date" value={due} min={todayISO()} onChange={(e) => setDue(e.target.value)} />
        </Field>
      </div>
      {duplicate && <p className="mt-3 text-[13px] text-warning">This billing period has already been invoiced.</p>}
      {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
    </Modal>);

}