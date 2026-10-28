import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import type { Client, DocumentKind, Invoice, LineItemInput, Quotation } from '../types/database';
import { computeTotals, lineGross } from '../utils/calculations';
import { addDaysISO, errorMessage, todayISO } from '../utils/format';

export interface EditorForm {
  client_id: string;
  issue_date: string;
  secondary_date: string;
  currency: string;
  project_title: string;
  project_description: string;
  scope_of_work: string;
  deliverables: string;
  payment_schedule: string;
  payment_terms: string;
  additional_charges: number;
  notes: string;
  terms: string;
  items: LineItemInput[];
}

const blankItem: LineItemInput = { description: '', details: '', quantity: 1, unit_price: 0, discount: 0, tax_rate: 0 };

function fromDocument(doc: Invoice | Quotation): EditorForm {
  const isInvoice = doc.kind === 'invoice';
  return {
    client_id: doc.client_id,
    issue_date: doc.issue_date,
    secondary_date: isInvoice ? doc.due_date : doc.valid_until,
    currency: doc.currency,
    project_title: isInvoice ? doc.project_reference : doc.project_title,
    project_description: isInvoice ? '' : doc.project_description,
    scope_of_work: isInvoice ? '' : doc.scope_of_work,
    deliverables: isInvoice ? '' : doc.deliverables,
    payment_schedule: isInvoice ? '' : doc.payment_schedule,
    payment_terms: isInvoice ? doc.payment_terms : '',
    additional_charges: doc.additional_charges,
    notes: doc.notes,
    terms: doc.terms,
    items: doc.items.map(({ description, details, quantity, unit_price, discount, tax_rate }) => ({
      description,
      details,
      quantity,
      unit_price,
      discount,
      tax_rate
    }))
  };
}

interface Options {
  kind: DocumentKind;
  id?: string;
  duplicateId?: string | null;
  presetClientId?: string | null;
}

export function useDocumentEditor({ kind, id, duplicateId, presetClientId }: Options) {
  const { api } = useAuth();
  const { settings } = useWorkspace();
  const [form, setForm] = useState<EditorForm | null>(null);
  const [existing, setExisting] = useState<Invoice | Quotation | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<false | 'draft' | 'final'>(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [restored, setRestored] = useState(false);
  const dirty = useRef(false);

  const draftKey = `cloudx.draft.${kind}.${id ?? (duplicateId ? `dup-${duplicateId}` : 'new')}`;

  useEffect(() => {
    if (!settings) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const clientList = await api.listClients();
        let base: EditorForm;
        const sourceId = id ?? duplicateId;
        if (sourceId) {
          const doc = kind === 'invoice' ? await api.getInvoice(sourceId) : await api.getQuotation(sourceId);
          if (!doc) throw new Error(`This ${kind} could not be found.`);
          base = fromDocument(doc);
          if (id) setExisting(doc);else
          {
            const today = todayISO();
            base.issue_date = today;
            base.secondary_date = addDaysISO(today, kind === 'invoice' ? 30 : settings.quotation_validity_days);
          }
        } else {
          const today = todayISO();
          base = {
            client_id: presetClientId ?? '',
            issue_date: today,
            secondary_date: addDaysISO(today, kind === 'invoice' ? 30 : settings.quotation_validity_days),
            currency: settings.default_currency || 'LKR',
            project_title: '',
            project_description: '',
            scope_of_work: '',
            deliverables: '',
            payment_schedule: '',
            payment_terms: settings.default_payment_terms,
            additional_charges: 0,
            notes: kind === 'invoice' ? settings.default_invoice_notes : settings.default_quotation_notes,
            terms: kind === 'invoice' ? settings.default_invoice_terms : settings.default_quotation_terms,
            items: [{ ...blankItem }]
          };
        }
        const stored = sessionStorage.getItem(draftKey);
        if (stored) {
          try {
            base = { ...base, ...(JSON.parse(stored) as EditorForm) };
            setRestored(true);
            dirty.current = true;
          } catch {
            sessionStorage.removeItem(draftKey);
          }
        }
        if (!alive) return;
        setClients(clientList);
        setForm(base);
      } catch (e) {
        if (alive) setLoadError(errorMessage(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, kind, id, duplicateId, presetClientId, settings, draftKey]);

  // Preserve unsaved input across reloads and connection failures.
  useEffect(() => {
    if (!form || !dirty.current) return;
    const t = window.setTimeout(() => sessionStorage.setItem(draftKey, JSON.stringify(form)), 300);
    return () => window.clearTimeout(t);
  }, [form, draftKey]);

  const update = useCallback((patch: Partial<EditorForm>) => {
    dirty.current = true;
    setForm((f) => f ? { ...f, ...patch } : f);
  }, []);

  const updateItem = useCallback((index: number, patch: Partial<LineItemInput>) => {
    dirty.current = true;
    setForm((f) => f ? { ...f, items: f.items.map((it, i) => i === index ? { ...it, ...patch } : it) } : f);
  }, []);

  const addItem = useCallback((item?: Partial<LineItemInput>) => {
    dirty.current = true;
    setForm((f) => {
      if (!f) return f;
      const last = f.items[f.items.length - 1];
      const replaceBlank = last && !last.description.trim() && !Number(last.unit_price) && item;
      const next = { ...blankItem, ...item };
      return { ...f, items: replaceBlank ? [...f.items.slice(0, -1), next] : [...f.items, next] };
    });
  }, []);

  const removeItem = useCallback((index: number) => {
    dirty.current = true;
    setForm((f) => f && f.items.length > 1 ? { ...f, items: f.items.filter((_, i) => i !== index) } : f);
  }, []);

  const moveItem = useCallback((index: number, direction: -1 | 1) => {
    dirty.current = true;
    setForm((f) => {
      if (!f) return f;
      const items = [...f.items];
      const target = index + direction;
      if (target < 0 || target >= items.length) return f;
      [items[index], items[target]] = [items[target], items[index]];
      return { ...f, items };
    });
  }, []);

  const totals = useMemo(() => form ? computeTotals(form.items, form.additional_charges) : null, [form]);

  const locked = Boolean(
    existing && (
    existing.kind === 'invoice' && (existing.status === 'paid' || existing.status === 'cancelled') ||
    existing.kind === 'quotation' && existing.status === 'converted')
  );

  function validate(f: EditorForm): Record<string, string> {
    const e: Record<string, string> = {};
    if (!f.client_id) e.client_id = 'Select a client.';
    if (!f.issue_date) e.issue_date = 'Required.';
    if (!f.secondary_date) e.secondary_date = 'Required.';else
    if (f.secondary_date < f.issue_date) e.secondary_date = kind === 'invoice' ? 'Must be on or after the invoice date.' : 'Must be on or after the quotation date.';
    if (!f.items.length || f.items.some((i) => !i.description.trim())) e.items = 'Every line item needs a description.';else
    if (f.items.some((i) => !(Number(i.quantity) > 0))) e.items = 'Quantities must be greater than zero.';else
    if (f.items.some((i) => Number(i.unit_price) < 0 || Number(i.discount) > lineGross(i))) e.items = 'Check prices and discounts.';
    if (Number(f.additional_charges) < 0) e.additional_charges = 'Cannot be negative.';
    return e;
  }

  const save = useCallback(
    async (final: boolean): Promise<Invoice | Quotation | null> => {
      if (!form) return null;
      const v = validate(form);
      setErrors(v);
      if (Object.keys(v).length) return null;
      setSaving(final ? 'final' : 'draft');
      try {
        let saved: Invoice | Quotation;
        if (kind === 'invoice') {
          saved = await api.saveInvoice({
            id: existing?.id,
            client_id: form.client_id,
            issue_date: form.issue_date,
            due_date: form.secondary_date,
            currency: form.currency,
            project_reference: form.project_title,
            payment_terms: form.payment_terms,
            additional_charges: Number(form.additional_charges) || 0,
            notes: form.notes,
            terms: form.terms,
            status: final ? 'issued' : 'draft',
            items: form.items
          });
        } else {
          saved = await api.saveQuotation({
            id: existing?.id,
            client_id: form.client_id,
            issue_date: form.issue_date,
            valid_until: form.secondary_date,
            currency: form.currency,
            project_title: form.project_title,
            project_description: form.project_description,
            scope_of_work: form.scope_of_work,
            deliverables: form.deliverables,
            payment_schedule: form.payment_schedule,
            additional_charges: Number(form.additional_charges) || 0,
            notes: form.notes,
            terms: form.terms,
            status: final ? 'sent' : 'draft',
            items: form.items
          });
        }
        sessionStorage.removeItem(draftKey);
        dirty.current = false;
        return saved;
      } finally {
        setSaving(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form, kind, existing, api, draftKey]
  );

  const discardDraft = useCallback(() => {
    sessionStorage.removeItem(draftKey);
    dirty.current = false;
    window.location.reload();
  }, [draftKey]);

  return {
    form,
    existing,
    clients,
    setClients,
    loading,
    loadError,
    saving,
    errors,
    restored,
    locked,
    totals,
    update,
    updateItem,
    addItem,
    removeItem,
    moveItem,
    save,
    discardDraft
  };
}