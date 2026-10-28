import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import type { BillingFrequency, Client, MaintenancePlan, MaintenancePlanInput } from '../../types/database';
import { errorMessage, todayISO } from '../../utils/format';
import { addInterval, frequencyLabels } from '../../utils/maintenance';
import { ClientPicker } from '../clients/ClientPicker';
import { Button } from '../ui/Button';
import { Field, Input, Select, Textarea, Toggle } from '../ui/FormControls';
import { Modal } from '../ui/Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (plan: MaintenancePlan) => void;
  clients: Client[];
  onClientCreated: (client: Client) => void;
  plan?: MaintenancePlan | null;
  presetClientId?: string | null;
}

export function MaintenancePlanModal({ open, onClose, onSaved, clients, onClientCreated, plan, presetClientId }: Props) {
  const { api, user } = useAuth();
  const { settings, members } = useWorkspace();
  const [form, setForm] = useState<MaintenancePlanInput | null>(null);
  const [autoNext, setAutoNext] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !settings) return;
    setError(null);
    if (plan) {
      const { id, company_id: _c, created_by: _b, created_at: _a, updated_at: _u, ...rest } = plan;
      setForm({ ...rest, id });
      setAutoNext(false);
      return;
    }
    const start = todayISO();
    setAutoNext(true);
    setForm({
      client_id: presetClientId ?? '',
      project_name: '',
      project_url: '',
      service_type: 'Website Maintenance',
      description: settings.maintenance_default_description,
      start_date: start,
      last_maintenance_date: null,
      next_maintenance_date: addInterval(start, settings.maintenance_default_frequency, null),
      charge: 0,
      currency: settings.maintenance_default_currency || 'LKR',
      billing_frequency: settings.maintenance_default_frequency,
      custom_interval_days: settings.maintenance_default_frequency === 'custom' ? 30 : null,
      payment_terms: settings.maintenance_default_terms,
      assigned_to: user?.id ?? null,
      status: 'active',
      notes: ''
    });
  }, [open, plan, settings, presetClientId, user]);

  if (!form) return null;

  function patch(p: Partial<MaintenancePlanInput>) {
    setForm((f) => {
      if (!f) return f;
      const next = { ...f, ...p };
      if (autoNext && ('start_date' in p || 'last_maintenance_date' in p || 'billing_frequency' in p || 'custom_interval_days' in p)) {
        const base = next.last_maintenance_date || next.start_date;
        if (base) next.next_maintenance_date = addInterval(base, next.billing_frequency, next.custom_interval_days);
      }
      return next;
    });
  }

  async function save() {
    if (!form) return;
    setError(null);
    if (!form.client_id) return setError('Select a client.');
    if (!form.project_name.trim()) return setError('Enter the project name.');
    if (!form.service_type.trim()) return setError('Enter the service type.');
    if (!(form.charge >= 0)) return setError('The charge cannot be negative.');
    if (form.billing_frequency === 'custom' && !(Number(form.custom_interval_days) > 0)) return setError('Enter the custom interval in days.');
    if (form.next_maintenance_date && form.next_maintenance_date < form.start_date) return setError('The next maintenance date cannot be before the start date.');
    setSaving(true);
    try {
      const saved = await api.savePlan({ ...form, project_name: form.project_name.trim() });
      toast.success(plan ? 'Maintenance plan updated' : 'Maintenance plan added');
      onSaved(saved);
      onClose();
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
      size="lg"
      title={plan ? 'Edit maintenance plan' : 'Add maintenance plan'}
      description="Recurring maintenance services and charges for a client project."
      footer={
      <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} loading={saving}>Save plan</Button>
        </>
      }>
      
      <div className="space-y-5">
        <ClientPicker clients={clients} value={form.client_id} onChange={(client_id) => patch({ client_id })} onClientCreated={onClientCreated} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project name" htmlFor="m-name" required>
            <Input id="m-name" value={form.project_name} onChange={(e) => patch({ project_name: e.target.value })} />
          </Field>
          <Field label="Project URL" htmlFor="m-url">
            <Input id="m-url" type="url" value={form.project_url} onChange={(e) => patch({ project_url: e.target.value })} placeholder="https://" />
          </Field>
          <Field label="Service type" htmlFor="m-type" required>
            <Input id="m-type" list="service-types" value={form.service_type} onChange={(e) => patch({ service_type: e.target.value })} />
            <datalist id="service-types">
              {['Website Maintenance', 'Hosting & Maintenance', 'CRM Support', 'POS Support', 'Software Maintenance', 'Domain Renewal'].map((s) => <option key={s} value={s} />)}
            </datalist>
          </Field>
          <Field label="Responsible director" htmlFor="m-owner">
            <Select id="m-owner" value={form.assigned_to ?? ''} onChange={(e) => patch({ assigned_to: e.target.value || null })}>
              <option value="">Unassigned</option>
              {members.filter((m) => m.status === 'active').map((m) =>
              <option key={m.user_id} value={m.user_id}>{m.profile?.display_name || m.profile?.email}</option>
              )}
            </Select>
          </Field>
          <Field label="Service description" htmlFor="m-desc" className="sm:col-span-2" hint="Used as the line-item details on maintenance invoices.">
            <Textarea id="m-desc" value={form.description} onChange={(e) => patch({ description: e.target.value })} className="min-h-[64px]" />
          </Field>
        </div>

        <div className="grid gap-4 border-t border-line pt-5 sm:grid-cols-3">
          <Field label="Maintenance charge" htmlFor="m-charge" required>
            <Input id="m-charge" type="number" min={0} step="any" value={form.charge} onChange={(e) => patch({ charge: Number(e.target.value) })} className="tabular" />
          </Field>
          <Field label="Currency" htmlFor="m-cur">
            <Select id="m-cur" value={form.currency} onChange={(e) => patch({ currency: e.target.value })}>
              {['LKR', 'USD', 'EUR', 'GBP', 'AUD'].map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Billing frequency" htmlFor="m-freq">
            <Select id="m-freq" value={form.billing_frequency} onChange={(e) => patch({ billing_frequency: e.target.value as BillingFrequency, custom_interval_days: e.target.value === 'custom' ? form.custom_interval_days ?? 30 : null })}>
              {Object.entries(frequencyLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          {form.billing_frequency === 'custom' &&
          <Field label="Interval (days)" htmlFor="m-days" required>
              <Input id="m-days" type="number" min={1} value={form.custom_interval_days ?? ''} onChange={(e) => patch({ custom_interval_days: Number(e.target.value) || null })} />
            </Field>
          }
          <Field label="Payment terms" htmlFor="m-terms" className={form.billing_frequency === 'custom' ? 'sm:col-span-2' : 'sm:col-span-3'}>
            <Input id="m-terms" value={form.payment_terms} onChange={(e) => patch({ payment_terms: e.target.value })} placeholder="e.g. Payment within 14 days" />
          </Field>
        </div>

        <div className="border-t border-line pt-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">Schedule</p>
            <Toggle id="auto-next" checked={autoNext} onChange={setAutoNext} label="Calculate next date automatically" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Start date" htmlFor="m-start" required>
              <Input id="m-start" type="date" value={form.start_date} onChange={(e) => patch({ start_date: e.target.value })} />
            </Field>
            <Field label="Last maintenance" htmlFor="m-last">
              <Input id="m-last" type="date" value={form.last_maintenance_date ?? ''} onChange={(e) => patch({ last_maintenance_date: e.target.value || null })} />
            </Field>
            <Field label="Next maintenance" htmlFor="m-next" hint={autoNext ? 'From last (or start) date + frequency' : undefined}>
              <Input id="m-next" type="date" value={form.next_maintenance_date ?? ''} onChange={(e) => {setAutoNext(false);setForm({ ...form, next_maintenance_date: e.target.value || null });}} />
            </Field>
          </div>
        </div>

        <Field label="Notes" htmlFor="m-notes">
          <Textarea id="m-notes" value={form.notes} onChange={(e) => patch({ notes: e.target.value })} className="min-h-[60px]" />
        </Field>
      </div>
      {error && <p className="mt-4 text-sm text-danger" role="alert">{error}</p>}
    </Modal>);

}