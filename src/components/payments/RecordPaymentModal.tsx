import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { paymentMethodLabels } from '../../data/navigation';
import type { Client, Invoice, PaymentMethod } from '../../types/database';
import { isOutstanding } from '../../utils/calculations';
import { errorMessage, formatMoney, newId, todayISO } from '../../utils/format';
import { Button } from '../ui/Button';
import { Field, Input, Select, Textarea } from '../ui/FormControls';
import { Modal } from '../ui/Modal';

interface RecordPaymentModalProps {
  open: boolean;
  onClose: () => void;
  onRecorded: () => void;
  invoices: Invoice[];
  clients: Client[];
  invoiceId?: string;
}

export function RecordPaymentModal({ open, onClose, onRecorded, invoices, clients, invoiceId }: RecordPaymentModalProps) {
  const { api } = useAuth();
  const outstanding = useMemo(
    () => invoices.filter((i) => isOutstanding(i) || i.status === 'draft' && i.balance_due > 0),
    [invoices]
  );
  const [selected, setSelected] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per modal session: retries and double-clicks can never create a second payment.
  const [idempotencyKey, setKey] = useState(newId());

  const invoice = invoices.find((i) => i.id === selected) ?? null;

  useEffect(() => {
    if (!open) return;
    const initial = invoiceId ?? '';
    setSelected(initial);
    const inv = invoices.find((i) => i.id === initial);
    setAmount(inv ? String(inv.balance_due) : '');
    setDate(todayISO());
    setMethod('bank_transfer');
    setReference('');
    setNotes('');
    setError(null);
    setKey(newId());
  }, [open, invoiceId, invoices]);

  async function submit() {
    setError(null);
    const value = Number(amount);
    if (!invoice) return setError('Select an invoice.');
    if (!(value > 0)) return setError('Enter an amount greater than zero.');
    if (value > invoice.balance_due + 0.001) return setError(`The outstanding balance is ${formatMoney(invoice.balance_due, invoice.currency)}.`);
    setSaving(true);
    try {
      await api.recordPayment({ invoice_id: invoice.id, amount: value, payment_date: date, method, reference: reference.trim(), notes: notes.trim(), idempotency_key: idempotencyKey });
      toast.success(`Payment of ${formatMoney(value, invoice.currency)} recorded`);
      onRecorded();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record payment"
      description="Payments are the source of truth for amounts received."
      footer={
      <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            Record payment
          </Button>
        </>
      }>
      
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Invoice" htmlFor="p-invoice" required className="sm:col-span-2">
          <Select
            id="p-invoice"
            value={selected}
            disabled={Boolean(invoiceId)}
            onChange={(e) => {
              setSelected(e.target.value);
              const inv = invoices.find((i) => i.id === e.target.value);
              setAmount(inv ? String(inv.balance_due) : '');
            }}>
            
            <option value="">Select an invoice with a balance…</option>
            {(invoiceId ? invoices.filter((i) => i.id === invoiceId) : outstanding).map((i) =>
            <option key={i.id} value={i.id}>
                {i.number} · {clientName(i.client_id)} · {formatMoney(i.balance_due, i.currency)} due
              </option>
            )}
          </Select>
        </Field>
        {invoice &&
        <div className="grid grid-cols-3 gap-3 rounded-lg bg-canvas px-4 py-3 text-[13px] sm:col-span-2">
            <div><p className="text-muted">Total</p><p className="font-medium tabular">{formatMoney(invoice.total, invoice.currency)}</p></div>
            <div><p className="text-muted">Paid</p><p className="font-medium tabular">{formatMoney(invoice.amount_paid, invoice.currency)}</p></div>
            <div><p className="text-muted">Outstanding</p><p className="font-semibold text-brand tabular">{formatMoney(invoice.balance_due, invoice.currency)}</p></div>
          </div>
        }
        <Field label="Amount" htmlFor="p-amount" required>
          <Input id="p-amount" type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className="tabular" />
        </Field>
        <Field label="Payment date" htmlFor="p-date" required>
          <Input id="p-date" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Method" htmlFor="p-method">
          <Select id="p-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {Object.entries(paymentMethodLabels).map(([k, v]) =>
            <option key={k} value={k}>{v}</option>
            )}
          </Select>
        </Field>
        <Field label="Transaction reference" htmlFor="p-ref">
          <Input id="p-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label="Notes" htmlFor="p-notes" className="sm:col-span-2">
          <Textarea id="p-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[60px]" />
        </Field>
      </div>
      {error && <p className="mt-4 text-sm text-danger" role="alert">{error}</p>}
    </Modal>);

}