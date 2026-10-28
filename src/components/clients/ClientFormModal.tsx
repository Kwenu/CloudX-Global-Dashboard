import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangleIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import type { Client, ClientInput } from '../../types/database';
import { errorMessage } from '../../utils/format';
import { Button } from '../ui/Button';
import { Field, Input, Textarea } from '../ui/FormControls';
import { Modal } from '../ui/Modal';

interface ClientFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (client: Client) => void;
  existing: Client[];
  client?: Client | null;
}

const empty: ClientInput = { name: '', business_name: '', email: '', phone: '', billing_address: '', tax_id: '', notes: '' };

const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');

export function ClientFormModal({ open, onClose, onSaved, existing, client }: ClientFormModalProps) {
  const { api } = useAuth();
  const [form, setForm] = useState<ClientInput>(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(client ? { ...client } : empty);
      setError(null);
    }
  }, [open, client]);

  const duplicates = useMemo(() => {
    const name = norm(form.name);
    const business = norm(form.business_name);
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.replace(/\D/g, '');
    if (!name && !email && !phone && !business) return [];
    return existing.filter((c) => {
      if (client && c.id === client.id) return false;
      return (
        name.length > 2 && norm(c.name) === name ||
        business.length > 2 && norm(c.business_name) === business ||
        email && c.email.trim().toLowerCase() === email ||
        phone.length >= 7 && c.phone.replace(/\D/g, '').endsWith(phone.slice(-9)));

    });
  }, [form, existing, client]);

  const set = (key: keyof ClientInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
  setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save() {
    if (!form.name.trim()) {
      setError('Client name is required.');
      return;
    }
    if (form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await api.saveClient({ ...form, id: client?.id });
      toast.success(client ? 'Client updated' : 'Client added');
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
      title={client ? 'Edit client' : 'Add client'}
      description="Client details are reused on invoices, quotations and maintenance plans."
      footer={
      <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            {duplicates.length && !client ? 'Save anyway' : 'Save client'}
          </Button>
        </>
      }>
      
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact name" htmlFor="c-name" required>
          <Input id="c-name" value={form.name} onChange={set('name')} autoFocus />
        </Field>
        <Field label="Business name" htmlFor="c-business" hint="Shown on documents when provided.">
          <Input id="c-business" value={form.business_name} onChange={set('business_name')} />
        </Field>
        <Field label="Email" htmlFor="c-email">
          <Input id="c-email" type="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Phone" htmlFor="c-phone">
          <Input id="c-phone" value={form.phone} onChange={set('phone')} />
        </Field>
        <Field label="Billing address" htmlFor="c-address" className="sm:col-span-2">
          <Textarea id="c-address" value={form.billing_address} onChange={set('billing_address')} className="min-h-[64px]" />
        </Field>
        <Field label="Registration / tax ID" htmlFor="c-tax">
          <Input id="c-tax" value={form.tax_id} onChange={set('tax_id')} />
        </Field>
        <Field label="Notes" htmlFor="c-notes">
          <Input id="c-notes" value={form.notes} onChange={set('notes')} />
        </Field>
      </div>

      {duplicates.length > 0 &&
      <div className="mt-5 rounded-lg border border-warning/30 bg-warning/[0.06] p-3 text-[13px]">
          <p className="flex items-center gap-2 font-medium text-warning">
            <AlertTriangleIcon className="h-4 w-4" /> Possible duplicate
          </p>
          <ul className="mt-1.5 space-y-0.5 text-ink/75">
            {duplicates.slice(0, 3).map((d) =>
          <li key={d.id}>
                {d.name}
                {d.business_name ? ` · ${d.business_name}` : ''}
                {d.email ? ` · ${d.email}` : ''}
              </li>
          )}
          </ul>
        </div>
      }
      {error && <p className="mt-4 text-sm text-danger" role="alert">{error}</p>}
    </Modal>);

}