import type { Api } from '../types/api';
import type {
  ActivityEntity,
  ActivityEntry,
  BillingPeriod,
  Client,
  CompanySettings,
  Invoice,
  LineItem,
  LineItemInput,
  MaintenanceActivity,
  MaintenancePlan,
  Member,
  Payment,
  Quotation } from
'../types/database';
import { computeTotals, lineGross, round2 } from '../utils/calculations';
import { addDaysISO, formatAmount, newId, todayISO } from '../utils/format';

/**
 * Browser-only preview backend. Used ONLY when Supabase environment variables are missing,
 * and always labelled as "Local preview" in the UI. Mirrors the business rules of the SQL functions.
 */

const STORAGE_KEY = 'cloudx.preview.store.v1';
export const PREVIEW_USER_ID = 'preview-director';
const COMPANY_ID = 'preview-company';

interface Store {
  settings: CompanySettings;
  members: Member[];
  clients: Client[];
  invoices: Invoice[];
  quotations: Quotation[];
  payments: (Payment & {idempotency_key: string;})[];
  plans: MaintenancePlan[];
  activities: MaintenanceActivity[];
  periods: BillingPeriod[];
  log: ActivityEntry[];
  sequences: Record<string, number>;
}

function now(): string {
  return new Date().toISOString();
}

function defaultStore(): Store {
  return {
    settings: {
      company_id: COMPANY_ID,
      company_name: 'CloudX Global (Pvt) Ltd',
      logo_path: null,
      address: '',
      email: '',
      phone: '',
      website: '',
      registration_number: '',
      default_currency: 'LKR',
      default_payment_terms: '',
      bank_name: '',
      bank_account_name: '',
      bank_account_number: '',
      bank_branch: '',
      payment_instructions: '',
      default_invoice_notes: '',
      default_invoice_terms: '',
      default_quotation_notes: '',
      default_quotation_terms: '',
      quotation_validity_days: 30,
      quotation_slogan: '',
      invoice_prefix: 'CX',
      quotation_prefix: 'CXQ',
      number_padding: 4,
      number_include_year: true,
      maintenance_default_frequency: 'monthly',
      maintenance_default_currency: 'LKR',
      maintenance_due_soon_days: 7,
      maintenance_default_terms: '',
      maintenance_default_description: '',
      updated_at: now()
    },
    members: [
    {
      company_id: COMPANY_ID,
      user_id: PREVIEW_USER_ID,
      role: 'owner',
      status: 'active',
      created_at: now(),
      profile: {
        id: PREVIEW_USER_ID,
        display_name: 'Director',
        job_title: 'Director / Co-Founder',
        email: 'preview@local',
        status: 'active'
      }
    }],

    clients: [],
    invoices: [],
    quotations: [],
    payments: [],
    plans: [],
    activities: [],
    periods: [],
    log: [],
    sequences: {}
  };
}

function load(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultStore();
    return { ...defaultStore(), ...(JSON.parse(raw) as Store) };
  } catch {
    return defaultStore();
  }
}

function persist(store: Store): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function resetPreviewStore(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function createLocalApi(): Api {
  let store = load();

  function mutate<T>(fn: (s: Store) => T): T {
    store = load();
    const result = fn(store);
    persist(store);
    return result;
  }

  function log(s: Store, entity: ActivityEntity, entityId: string | null, action: string, summary: string) {
    s.log.unshift({ id: newId(), entity_type: entity, entity_id: entityId, action, summary, actor_id: PREVIEW_USER_ID, created_at: now() });
  }

  function nextNumber(s: Store, kind: 'invoice' | 'quotation'): string {
    const { invoice_prefix, quotation_prefix, number_padding, number_include_year } = s.settings;
    const year = number_include_year ? new Date().getFullYear() : 0;
    const key = `${kind}-${year}`;
    const prefix = kind === 'invoice' ? invoice_prefix : quotation_prefix;
    const existing = new Set((kind === 'invoice' ? s.invoices : s.quotations).map((d) => d.number));
    let candidate = '';
    do {
      s.sequences[key] = (s.sequences[key] ?? 0) + 1;
      candidate = `${prefix}-${number_include_year ? `${year}-` : ''}${String(s.sequences[key]).padStart(number_padding, '0')}`;
    } while (existing.has(candidate));
    return candidate;
  }

  function validateItems(items: LineItemInput[]): LineItem[] {
    if (!items.length) throw new Error('Add at least one line item');
    return items.map((item, position) => {
      if (!item.description.trim()) throw new Error('Every line item needs a description');
      if (!(Number(item.quantity) > 0)) throw new Error('Quantity must be greater than zero');
      if (Number(item.unit_price) < 0 || Number(item.discount) < 0 || Number(item.tax_rate) < 0 || Number(item.tax_rate) > 100) {
        throw new Error('Invalid price, discount or tax rate');
      }
      const gross = lineGross(item);
      if (Number(item.discount) > gross) throw new Error('A line discount cannot exceed the line amount');
      return {
        id: newId(),
        description: item.description.trim(),
        details: item.details ?? '',
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        discount: Number(item.discount) || 0,
        tax_rate: Number(item.tax_rate) || 0,
        line_total: gross,
        position
      };
    });
  }

  function refreshInvoice(s: Store, inv: Invoice) {
    const paid = round2(s.payments.filter((p) => p.invoice_id === inv.id).reduce((sum, p) => sum + p.amount, 0));
    inv.amount_paid = paid;
    inv.balance_due = round2(inv.total - paid);
    if (inv.status !== 'cancelled' && !(inv.status === 'draft' && paid === 0)) {
      inv.status = paid >= inv.total && inv.total > 0 ? 'paid' : paid > 0 ? 'partially_paid' : 'issued';
    }
    s.periods.forEach((p) => {
      if (p.invoice_id === inv.id) p.status = inv.status === 'paid' ? 'paid' : inv.status === 'cancelled' ? 'void' : 'invoiced';
    });
  }

  function requireClient(s: Store, id: string) {
    if (!s.clients.some((c) => c.id === id)) throw new Error('Select a valid client');
  }

  const api: Api = {
    mode: 'local',

    async getSettings() {
      return clone(load().settings);
    },
    async updateSettings(patch) {
      return mutate((s) => {
        if (patch.invoice_prefix !== undefined && patch.quotation_prefix !== undefined && patch.invoice_prefix === patch.quotation_prefix) {
          throw new Error('Invoice and quotation prefixes must be different');
        }
        s.settings = { ...s.settings, ...patch, company_id: COMPANY_ID, updated_at: now() };
        log(s, 'settings', null, 'updated', 'Updated company settings');
        return clone(s.settings);
      });
    },
    async uploadLogo(file) {
      if (file.size > 600_000) throw new Error('In local preview, logos must be under 600 KB.');
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      return api.updateSettings({ logo_path: dataUrl });
    },
    async getLogoDataUrl(settings) {
      return settings.logo_path && settings.logo_path.startsWith('data:') ? settings.logo_path : null;
    },

    async listMembers() {
      return clone(load().members);
    },
    async updateMyProfile(patch) {
      mutate((s) => {
        const me = s.members.find((m) => m.user_id === PREVIEW_USER_ID);
        if (me?.profile) {
          me.profile.display_name = patch.display_name;
          me.profile.job_title = patch.job_title;
        }
      });
    },
    async inviteMember() {
      throw new Error('Invitations require Supabase. Configure the backend to invite the other directors.');
    },
    async updateMember() {
      throw new Error('Member management requires Supabase.');
    },

    async listClients() {
      return clone(load().clients).sort((a, b) => a.name.localeCompare(b.name));
    },
    async saveClient(input) {
      return mutate((s) => {
        if (!input.name.trim()) throw new Error('Client name is required');
        if (input.id) {
          const client = s.clients.find((c) => c.id === input.id);
          if (!client) throw new Error('Client not found');
          Object.assign(client, { ...input, name: input.name.trim(), updated_at: now() });
          log(s, 'client', client.id, 'updated', `Updated client ${client.name}`);
          return clone(client);
        }
        const client: Client = {
          ...input,
          id: newId(),
          name: input.name.trim(),
          company_id: COMPANY_ID,
          created_by: PREVIEW_USER_ID,
          created_at: now(),
          updated_at: now()
        };
        s.clients.push(client);
        log(s, 'client', client.id, 'created', `Added client ${client.name}`);
        return clone(client);
      });
    },

    async listInvoices() {
      return clone(load().invoices).sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    async getInvoice(id) {
      return clone(load().invoices.find((i) => i.id === id) ?? null);
    },
    async saveInvoice(input) {
      return mutate((s) => {
        requireClient(s, input.client_id);
        if (input.due_date < input.issue_date) throw new Error('The due date cannot be before the invoice date');
        const items = validateItems(input.items);
        const totals = computeTotals(items, input.additional_charges);
        const base = {
          client_id: input.client_id,
          issue_date: input.issue_date,
          due_date: input.due_date,
          currency: input.currency || 'LKR',
          project_reference: input.project_reference,
          payment_terms: input.payment_terms,
          notes: input.notes,
          terms: input.terms,
          subtotal: totals.subtotal,
          discount: totals.discount,
          tax: totals.tax,
          additional_charges: totals.additionalCharges,
          total: totals.total,
          items,
          updated_by: PREVIEW_USER_ID,
          updated_at: now()
        };
        if (input.id) {
          const inv = s.invoices.find((i) => i.id === input.id);
          if (!inv) throw new Error('Invoice not found');
          if (inv.status === 'paid' || inv.status === 'cancelled') throw new Error('Paid or cancelled invoices cannot be edited');
          if (totals.total < inv.amount_paid) throw new Error(`The total cannot be lower than payments already recorded (${formatAmount(inv.amount_paid)})`);
          const wasDraft = inv.status === 'draft';
          Object.assign(inv, base);
          if (wasDraft) inv.status = input.status;
          refreshInvoice(s, inv);
          log(s, 'invoice', inv.id, 'updated', `Updated invoice ${inv.number}`);
          if (wasDraft && input.status === 'issued') log(s, 'invoice', inv.id, 'issued', `Issued invoice ${inv.number}`);
          return clone(inv);
        }
        const inv: Invoice = {
          ...base,
          kind: 'invoice',
          id: newId(),
          company_id: COMPANY_ID,
          number: nextNumber(s, 'invoice'),
          status: input.status,
          amount_paid: 0,
          balance_due: totals.total,
          quotation_id: null,
          maintenance_plan_id: null,
          billing_period_id: null,
          archived_at: null,
          created_by: PREVIEW_USER_ID,
          created_at: now()
        };
        s.invoices.push(inv);
        log(s, 'invoice', inv.id, 'created', `Created invoice ${inv.number}`);
        if (input.status === 'issued') log(s, 'invoice', inv.id, 'issued', `Issued invoice ${inv.number}`);
        return clone(inv);
      });
    },
    async setInvoiceStatus(id, status) {
      mutate((s) => {
        const inv = s.invoices.find((i) => i.id === id);
        if (!inv) throw new Error('Invoice not found');
        if (status === 'issued') {
          if (inv.status !== 'draft') throw new Error('Only draft invoices can be issued');
          inv.status = 'issued';
          refreshInvoice(s, inv);
        } else {
          if (inv.amount_paid > 0) throw new Error('Invoices with recorded payments cannot be cancelled');
          inv.status = 'cancelled';
          refreshInvoice(s, inv);
        }
        inv.updated_at = now();
        log(s, 'invoice', id, status, `${status === 'issued' ? 'Issued' : 'Cancelled'} invoice ${inv.number}`);
      });
    },

    async listQuotations() {
      return clone(load().quotations).sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    async getQuotation(id) {
      return clone(load().quotations.find((q) => q.id === id) ?? null);
    },
    async saveQuotation(input) {
      return mutate((s) => {
        requireClient(s, input.client_id);
        if (input.valid_until < input.issue_date) throw new Error('Valid-until cannot be before the quotation date');
        const items = validateItems(input.items);
        const totals = computeTotals(items, input.additional_charges);
        const base = {
          client_id: input.client_id,
          issue_date: input.issue_date,
          valid_until: input.valid_until,
          currency: input.currency || 'LKR',
          project_title: input.project_title,
          project_description: input.project_description,
          scope_of_work: input.scope_of_work,
          deliverables: input.deliverables,
          payment_schedule: input.payment_schedule,
          notes: input.notes,
          terms: input.terms,
          subtotal: totals.subtotal,
          discount: totals.discount,
          tax: totals.tax,
          additional_charges: totals.additionalCharges,
          total: totals.total,
          items,
          updated_by: PREVIEW_USER_ID,
          updated_at: now()
        };
        if (input.id) {
          const q = s.quotations.find((x) => x.id === input.id);
          if (!q) throw new Error('Quotation not found');
          if (q.status === 'converted') throw new Error('Converted quotations cannot be edited');
          const wasDraft = q.status === 'draft';
          Object.assign(q, base);
          if (wasDraft) q.status = input.status;
          log(s, 'quotation', q.id, 'updated', `Updated quotation ${q.number}`);
          return clone(q);
        }
        const q: Quotation = {
          ...base,
          kind: 'quotation',
          id: newId(),
          company_id: COMPANY_ID,
          number: nextNumber(s, 'quotation'),
          status: input.status,
          converted_invoice_id: null,
          archived_at: null,
          created_by: PREVIEW_USER_ID,
          created_at: now()
        };
        s.quotations.push(q);
        log(s, 'quotation', q.id, 'created', `Created quotation ${q.number}`);
        return clone(q);
      });
    },
    async setQuotationStatus(id, status) {
      mutate((s) => {
        const q = s.quotations.find((x) => x.id === id);
        if (!q) throw new Error('Quotation not found');
        if (q.status === 'converted') throw new Error('Converted quotations are locked');
        q.status = status;
        q.updated_at = now();
        log(s, 'quotation', id, 'status_changed', `Marked quotation ${q.number} as ${status}`);
      });
    },
    async convertQuotation(id) {
      return mutate((s) => {
        const q = s.quotations.find((x) => x.id === id);
        if (!q) throw new Error('Quotation not found');
        if (q.converted_invoice_id) throw new Error('This quotation has already been converted to an invoice');
        if (q.status !== 'accepted') throw new Error('Only accepted quotations can be converted');
        const today = todayISO();
        const inv: Invoice = {
          kind: 'invoice',
          id: newId(),
          company_id: COMPANY_ID,
          number: nextNumber(s, 'invoice'),
          client_id: q.client_id,
          issue_date: today,
          due_date: addDaysISO(today, 30),
          currency: q.currency,
          project_reference: q.project_title,
          payment_terms: s.settings.default_payment_terms,
          subtotal: q.subtotal,
          discount: q.discount,
          tax: q.tax,
          additional_charges: q.additional_charges,
          total: q.total,
          amount_paid: 0,
          balance_due: q.total,
          status: 'draft',
          notes: s.settings.default_invoice_notes || q.notes,
          terms: s.settings.default_invoice_terms || q.terms,
          quotation_id: q.id,
          maintenance_plan_id: null,
          billing_period_id: null,
          items: q.items.map((i) => ({ ...i, id: newId() })),
          archived_at: null,
          created_by: PREVIEW_USER_ID,
          updated_by: PREVIEW_USER_ID,
          created_at: now(),
          updated_at: now()
        };
        s.invoices.push(inv);
        q.converted_invoice_id = inv.id;
        q.status = 'converted';
        log(s, 'quotation', q.id, 'converted', `Converted quotation ${q.number} to invoice ${inv.number}`);
        log(s, 'invoice', inv.id, 'created', `Created invoice ${inv.number} from quotation ${q.number}`);
        return inv.id;
      });
    },
    async setArchived(kind, id, archived) {
      mutate((s) => {
        const list: (Invoice | Quotation)[] = kind === 'invoice' ? s.invoices : s.quotations;
        const doc = list.find((d) => d.id === id);
        if (!doc) throw new Error('Document not found');
        doc.archived_at = archived ? now() : null;
        log(s, kind, id, archived ? 'archived' : 'restored', `${archived ? 'Archived' : 'Restored'} ${doc.number}`);
      });
    },

    async listPayments() {
      return clone(load().payments).sort((a, b) => b.payment_date.localeCompare(a.payment_date));
    },
    async recordPayment(input) {
      return mutate((s) => {
        const dup = s.payments.find((p) => p.idempotency_key === input.idempotency_key);
        if (dup) return dup.id;
        const inv = s.invoices.find((i) => i.id === input.invoice_id);
        if (!inv) throw new Error('Invoice not found');
        if (inv.status === 'cancelled') throw new Error('Payments cannot be recorded against a cancelled invoice');
        const amount = round2(Number(input.amount));
        if (!(amount > 0)) throw new Error('Payment amount must be greater than zero');
        if (amount > round2(inv.total - inv.amount_paid)) {
          throw new Error(`Payment exceeds the outstanding balance of ${formatAmount(inv.total - inv.amount_paid)}`);
        }
        const payment = {
          id: newId(),
          company_id: COMPANY_ID,
          invoice_id: inv.id,
          payment_date: input.payment_date,
          amount,
          method: input.method,
          reference: input.reference,
          notes: input.notes,
          recorded_by: PREVIEW_USER_ID,
          created_at: now(),
          idempotency_key: input.idempotency_key
        };
        s.payments.push(payment);
        refreshInvoice(s, inv);
        log(s, 'payment', payment.id, 'payment_recorded', `Recorded payment of ${inv.currency} ${formatAmount(amount)} for ${inv.number}`);
        return payment.id;
      });
    },

    async listPlans() {
      return clone(load().plans);
    },
    async savePlan(input) {
      return mutate((s) => {
        requireClient(s, input.client_id);
        if (!input.project_name.trim()) throw new Error('Project name is required');
        const payload = { ...input, custom_interval_days: input.billing_frequency === 'custom' ? input.custom_interval_days : null };
        if (input.id) {
          const plan = s.plans.find((p) => p.id === input.id);
          if (!plan) throw new Error('Maintenance plan not found');
          const statusChanged = plan.status !== input.status;
          Object.assign(plan, payload, { updated_at: now() });
          log(s, 'maintenance_plan', plan.id, statusChanged ? 'status_changed' : 'updated',
          statusChanged ? `Changed ${plan.project_name} to ${plan.status.replace('_', ' ')}` : `Updated maintenance plan ${plan.project_name}`);
          return clone(plan);
        }
        const plan: MaintenancePlan = {
          ...payload,
          id: newId(),
          company_id: COMPANY_ID,
          created_by: PREVIEW_USER_ID,
          created_at: now(),
          updated_at: now()
        };
        s.plans.push(plan);
        log(s, 'maintenance_plan', plan.id, 'created', `Added maintenance plan ${plan.project_name}`);
        return clone(plan);
      });
    },
    async listMaintenanceActivities(planId) {
      return clone(load().activities.filter((a) => !planId || a.plan_id === planId)).sort((a, b) =>
      b.completed_on.localeCompare(a.completed_on)
      );
    },
    async listBillingPeriods(planId) {
      return clone(load().periods.filter((p) => !planId || p.plan_id === planId)).sort((a, b) =>
      b.period_start.localeCompare(a.period_start)
      );
    },
    async recordMaintenanceActivity(input) {
      mutate((s) => {
        const plan = s.plans.find((p) => p.id === input.plan_id);
        if (!plan) throw new Error('Maintenance plan not found');
        if (!input.work_performed.trim()) throw new Error('Describe the work performed');
        if (input.next_scheduled_date && input.next_scheduled_date < input.completed_on) {
          throw new Error('The next date cannot be before the completion date');
        }
        s.activities.push({ ...input, id: newId(), created_by: PREVIEW_USER_ID, created_at: now() });
        if (!plan.last_maintenance_date || input.completed_on > plan.last_maintenance_date) {
          plan.last_maintenance_date = input.completed_on;
        }
        if (input.next_scheduled_date) plan.next_maintenance_date = input.next_scheduled_date;
        plan.updated_at = now();
        log(s, 'maintenance_plan', plan.id, 'maintenance_completed', `Completed maintenance for ${plan.project_name}`);
      });
    },
    async createMaintenanceInvoice(input) {
      return mutate((s) => {
        const plan = s.plans.find((p) => p.id === input.plan_id);
        if (!plan) throw new Error('Maintenance plan not found');
        if (plan.status === 'cancelled') throw new Error('Cancelled plans cannot be invoiced');
        if (input.period_end < input.period_start) throw new Error('The billing period end must be after its start');
        if (s.periods.some((p) => p.plan_id === plan.id && p.period_start === input.period_start)) {
          throw new Error('An invoice already exists for this plan and billing period');
        }
        const period: BillingPeriod = {
          id: newId(),
          plan_id: plan.id,
          period_start: input.period_start,
          period_end: input.period_end,
          invoice_id: null,
          status: 'invoiced',
          created_at: now()
        };
        const fmt = (iso: string) => iso.split('-').reverse().join('/');
        const inv: Invoice = {
          kind: 'invoice',
          id: newId(),
          company_id: COMPANY_ID,
          number: nextNumber(s, 'invoice'),
          client_id: plan.client_id,
          issue_date: todayISO(),
          due_date: input.due_date,
          currency: plan.currency,
          project_reference: plan.project_name,
          payment_terms: plan.payment_terms || s.settings.maintenance_default_terms,
          subtotal: plan.charge,
          discount: 0,
          tax: 0,
          additional_charges: 0,
          total: plan.charge,
          amount_paid: 0,
          balance_due: plan.charge,
          status: 'draft',
          notes: s.settings.default_invoice_notes,
          terms: s.settings.default_invoice_terms,
          quotation_id: null,
          maintenance_plan_id: plan.id,
          billing_period_id: period.id,
          items: [
          {
            id: newId(),
            description: `${plan.project_name} — ${plan.service_type}`,
            details: `${plan.description ? `${plan.description}\n` : ''}Service period: ${fmt(input.period_start)} – ${fmt(input.period_end)}`,
            quantity: 1,
            unit_price: plan.charge,
            discount: 0,
            tax_rate: 0,
            line_total: plan.charge,
            position: 0
          }],

          archived_at: null,
          created_by: PREVIEW_USER_ID,
          updated_by: PREVIEW_USER_ID,
          created_at: now(),
          updated_at: now()
        };
        period.invoice_id = inv.id;
        s.periods.push(period);
        s.invoices.push(inv);
        log(s, 'maintenance_plan', plan.id, 'invoiced', `Invoiced ${plan.project_name} (${fmt(input.period_start)} – ${fmt(input.period_end)})`);
        log(s, 'invoice', inv.id, 'created', `Created maintenance invoice ${inv.number}`);
        return inv.id;
      });
    },

    async listActivity(options) {
      const entries = load().log.filter((e) => !options?.entityId || e.entity_id === options.entityId);
      return clone(entries.slice(0, options?.limit ?? 50));
    },

    async healthCheck() {
      return {
        overall: 'not_configured',
        database: 'not_configured',
        auth: 'not_configured',
        checkedAt: now(),
        latencyMs: null,
        error: 'Supabase environment variables are not set. Data is stored only in this browser.'
      };
    }
  };

  return api;
}