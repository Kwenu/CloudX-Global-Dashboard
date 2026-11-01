import type { Api } from '../types/api';
import type {
  ActivityEntry,
  BillingPeriod,
  Client,
  CompanySettings,
  HealthLevel,
  HealthResult,
  Invoice,
  LineItem,
  MaintenanceActivity,
  MaintenancePlan,
  Member,
  Payment,
  Quotation } from
'../types/database';
import { errorMessage } from '../utils/format';
import { supabase, supabaseAnonKey, supabaseUrl } from './supabaseClient';

type Row = Record<string, unknown>;

const str = (v: unknown): string => v == null ? '' : String(v);
const strOrNull = (v: unknown): string | null => v == null || v === '' ? null : String(v);
const num = (v: unknown): number => v == null ? 0 : Number(v);

function db() {
  if (!supabase) throw new Error('Supabase is not configured for this deployment.');
  return supabase;
}

function check(error: {message: string;} | null): void {
  if (!error) return;
  const msg = error.message;
  if (/Failed to fetch|NetworkError|network/i.test(msg)) {
    throw new Error('Could not reach the CloudX database. Your changes were not saved — please retry.');
  }
  if (/permission denied|row-level security/i.test(msg)) {
    throw new Error('You do not have permission to perform this action.');
  }
  throw new Error(msg);
}

async function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms / 1000}s`)), ms);
  });
  try {
    return await Promise.race([Promise.resolve(promise), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- mappers
function mapSettings(r: Row): CompanySettings {
  return {
    company_id: str(r.company_id),
    company_name: str(r.company_name),
    logo_path: strOrNull(r.logo_path),
    address: str(r.address),
    email: str(r.email),
    phone: str(r.phone),
    website: str(r.website),
    registration_number: str(r.registration_number),
    default_currency: str(r.default_currency) || 'LKR',
    default_payment_terms: str(r.default_payment_terms),
    bank_name: str(r.bank_name),
    bank_account_name: str(r.bank_account_name),
    bank_account_number: str(r.bank_account_number),
    bank_branch: str(r.bank_branch),
    payment_instructions: str(r.payment_instructions),
    default_invoice_notes: str(r.default_invoice_notes),
    default_invoice_terms: str(r.default_invoice_terms),
    default_quotation_notes: str(r.default_quotation_notes),
    default_quotation_terms: str(r.default_quotation_terms),
    quotation_validity_days: num(r.quotation_validity_days) || 30,
    quotation_slogan: str(r.quotation_slogan),
    invoice_prefix: str(r.invoice_prefix) || 'CX',
    quotation_prefix: str(r.quotation_prefix) || 'CXQ',
    number_padding: num(r.number_padding) || 4,
    number_include_year: r.number_include_year !== false,
    maintenance_default_frequency: (str(r.maintenance_default_frequency) || 'monthly') as CompanySettings['maintenance_default_frequency'],
    maintenance_default_currency: str(r.maintenance_default_currency) || 'LKR',
    maintenance_due_soon_days: num(r.maintenance_due_soon_days),
    maintenance_default_terms: str(r.maintenance_default_terms),
    maintenance_default_description: str(r.maintenance_default_description),
    updated_at: str(r.updated_at)
  };
}

function mapItem(r: Row): LineItem {
  return {
    id: str(r.id),
    description: str(r.description),
    details: str(r.details),
    quantity: num(r.quantity),
    unit_price: num(r.unit_price),
    discount: num(r.discount),
    tax_rate: num(r.tax_rate),
    line_total: num(r.line_total),
    position: num(r.position)
  };
}

function mapItems(v: unknown): LineItem[] {
  return (v as Row[] | null ?? []).map(mapItem).sort((a, b) => a.position - b.position);
}

function mapCommon(r: Row) {
  return {
    id: str(r.id),
    company_id: str(r.company_id),
    client_id: str(r.client_id),
    issue_date: str(r.issue_date),
    currency: str(r.currency) || 'LKR',
    subtotal: num(r.subtotal),
    discount: num(r.discount),
    tax: num(r.tax),
    additional_charges: num(r.additional_charges),
    total: num(r.total),
    notes: str(r.notes),
    terms: str(r.terms),
    created_by: strOrNull(r.created_by),
    updated_by: strOrNull(r.updated_by),
    created_at: str(r.created_at),
    updated_at: str(r.updated_at),
    archived_at: strOrNull(r.archived_at),
    items: mapItems(r.items)
  };
}

function mapInvoice(r: Row): Invoice {
  return {
    ...mapCommon(r),
    kind: 'invoice',
    number: str(r.invoice_number),
    status: str(r.status) as Invoice['status'],
    due_date: str(r.due_date),
    project_reference: str(r.project_reference),
    payment_terms: str(r.payment_terms),
    amount_paid: num(r.amount_paid),
    balance_due: num(r.balance_due),
    quotation_id: strOrNull(r.quotation_id),
    maintenance_plan_id: strOrNull(r.maintenance_plan_id),
    billing_period_id: strOrNull(r.billing_period_id)
  };
}

function mapQuotation(r: Row): Quotation {
  return {
    ...mapCommon(r),
    kind: 'quotation',
    number: str(r.quotation_number),
    status: str(r.status) as Quotation['status'],
    valid_until: str(r.valid_until),
    project_title: str(r.project_title),
    project_description: str(r.project_description),
    scope_of_work: str(r.scope_of_work),
    deliverables: str(r.deliverables),
    payment_schedule: str(r.payment_schedule),
    converted_invoice_id: strOrNull(r.converted_invoice_id)
  };
}

function mapClient(r: Row): Client {
  return {
    id: str(r.id),
    company_id: str(r.company_id),
    name: str(r.name),
    business_name: str(r.business_name),
    email: str(r.email),
    phone: str(r.phone),
    billing_address: str(r.billing_address),
    tax_id: str(r.tax_id),
    notes: str(r.notes),
    created_by: strOrNull(r.created_by),
    created_at: str(r.created_at),
    updated_at: str(r.updated_at)
  };
}

function mapPlan(r: Row): MaintenancePlan {
  return {
    id: str(r.id),
    company_id: str(r.company_id),
    client_id: str(r.client_id),
    project_name: str(r.project_name),
    project_url: str(r.project_url),
    service_type: str(r.service_type),
    description: str(r.description),
    start_date: str(r.start_date),
    last_maintenance_date: strOrNull(r.last_maintenance_date),
    next_maintenance_date: strOrNull(r.next_maintenance_date),
    charge: num(r.charge),
    currency: str(r.currency) || 'LKR',
    billing_frequency: str(r.billing_frequency) as MaintenancePlan['billing_frequency'],
    custom_interval_days: r.custom_interval_days == null ? null : num(r.custom_interval_days),
    payment_terms: str(r.payment_terms),
    assigned_to: strOrNull(r.assigned_to),
    status: str(r.status) as MaintenancePlan['status'],
    notes: str(r.notes),
    created_by: strOrNull(r.created_by),
    created_at: str(r.created_at),
    updated_at: str(r.updated_at)
  };
}

function itemsPayload(items: {description: string;details: string;quantity: number;unit_price: number;discount: number;tax_rate: number;}[]) {
  return items.map((i) => ({
    description: i.description.trim(),
    details: i.details ?? '',
    quantity: Number(i.quantity),
    unit_price: Number(i.unit_price),
    discount: Number(i.discount) || 0,
    tax_rate: Number(i.tax_rate) || 0
  }));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// ---------------------------------------------------------------- implementation
export function createSupabaseApi(): Api {
  let companyIdCache: string | null = null;

  async function companyId(): Promise<string> {
    if (companyIdCache) return companyIdCache;
    const { data, error } = await db().rpc('current_company_id');
    check(error);
    if (!data) throw new Error('Your account is not an active member of the CloudX workspace.');
    companyIdCache = String(data);
    return companyIdCache;
  }

  async function currentUserId(): Promise<string> {
    const { data } = await db().auth.getUser();
    if (!data.user) throw new Error('Your session has expired. Please sign in again.');
    return data.user.id;
  }

  const api: Api = {
    mode: 'supabase',

    async getSettings() {
      const { data, error } = await db().from('company_settings').select('*').single();
      check(error);
      return mapSettings(data as Row);
    },

    async getNextNumbers() {
      const { data, error } = await db().rpc('get_next_document_numbers');
      check(error);
      const r = (data ?? {}) as Row;
      return { invoice: num(r.invoice) || 1, quotation: num(r.quotation) || 1 };
    },

    async setNextNumber(kind, next) {
      const { error } = await db().rpc('set_next_document_number', { p_type: kind, p_next: next });
      check(error);
    },

    async updateSettings(patch) {
      const id = await companyId();
      const { company_id: _ignored, updated_at: _ts, ...rest } = patch;
      const { data, error } = await db().
      from('company_settings').
      update(rest).
      eq('company_id', id).
      select('*').
      single();
      check(error);
      return mapSettings(data as Row);
    },

    async uploadLogo(file) {
      const id = await companyId();
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const path = `${id}/logo-${Date.now()}.${ext}`;
      const { error } = await db().storage.from('company-assets').upload(path, file, { upsert: true, contentType: file.type });
      check(error);
      return api.updateSettings({ logo_path: path });
    },

    async getLogoDataUrl(settings) {
      if (!settings.logo_path) return null;
      const { data, error } = await db().storage.from('company-assets').download(settings.logo_path);
      if (error || !data) return null;
      return blobToDataUrl(data);
    },

    async listMembers() {
      const { data, error } = await db().
      from('company_members').
      select('company_id, user_id, role, status, created_at, profile:profiles!company_members_user_id_fkey(id, display_name, job_title, email, status, signature_path)').
      order('created_at');
      check(error);
      return (data as Row[] ?? []).map((r) => ({
        company_id: str(r.company_id),
        user_id: str(r.user_id),
        role: str(r.role) as Member['role'],
        status: str(r.status) as Member['status'],
        created_at: str(r.created_at),
        profile: r.profile ? r.profile as Member['profile'] : null
      }));
    },

    async updateMyProfile(patch) {
      const uid = await currentUserId();
      const { error } = await db().from('profiles').update(patch).eq('id', uid);
      check(error);
    },

    async saveMySignature(png) {
      const [cid, uid] = await Promise.all([companyId(), currentUserId()]);
      const { data: before } = await db().from('profiles').select('signature_path').eq('id', uid).maybeSingle();
      const oldPath = strOrNull((before as Row | null)?.signature_path);
      // A new file name per upload avoids stale browser caches; the old file is removed afterwards.
      const path = `${cid}/${uid}-${Date.now()}.png`;
      const { error: uploadError } = await db().storage.from('signatures').upload(path, png, { contentType: 'image/png', upsert: false });
      check(uploadError);
      const { error } = await db().from('profiles').update({ signature_path: path }).eq('id', uid);
      if (error) {
        await db().storage.from('signatures').remove([path]);
        check(error);
      }
      if (oldPath && oldPath !== path) await db().storage.from('signatures').remove([oldPath]);
    },

    async removeMySignature() {
      const uid = await currentUserId();
      const { data: before } = await db().from('profiles').select('signature_path').eq('id', uid).maybeSingle();
      const oldPath = strOrNull((before as Row | null)?.signature_path);
      const { error } = await db().from('profiles').update({ signature_path: null }).eq('id', uid);
      check(error);
      if (oldPath) await db().storage.from('signatures').remove([oldPath]);
    },

    async getSignatureDataUrl(path) {
      if (!path) return null;
      const { data, error } = await db().storage.from('signatures').download(path);
      if (error || !data) return null;
      return blobToDataUrl(data);
    },

    async inviteMember(input) {
      const { data, error } = await db().functions.invoke('invite-director', { body: input });
      if (error) {
        throw new Error(
          'The invitation service did not respond. Make sure the invite-director Edge Function is deployed (see supabase/README.md).'
        );
      }
      if (data && typeof data === 'object' && 'error' in data) throw new Error(String((data as Row).error));
    },

    async updateMember(userId, patch) {
      const { error } = await db().rpc('update_member', { p_user_id: userId, p_role: patch.role, p_status: patch.status });
      check(error);
    },

    async listClients() {
      const { data, error } = await db().from('clients').select('*').order('name');
      check(error);
      return (data as Row[] ?? []).map(mapClient);
    },

    async saveClient(input) {
      const payload = {
        name: input.name.trim(),
        business_name: input.business_name,
        email: input.email,
        phone: input.phone,
        billing_address: input.billing_address,
        tax_id: input.tax_id,
        notes: input.notes
      };
      if (input.id) {
        const { data, error } = await db().from('clients').update(payload).eq('id', input.id).select('*').single();
        check(error);
        return mapClient(data as Row);
      }
      const [cid, uid] = await Promise.all([companyId(), currentUserId()]);
      const { data, error } = await db().
      from('clients').
      insert({ ...payload, company_id: cid, created_by: uid }).
      select('*').
      single();
      check(error);
      return mapClient(data as Row);
    },

    async listInvoices() {
      const { data, error } = await db().
      from('invoices').
      select('*, items:invoice_items(*)').
      order('created_at', { ascending: false });
      check(error);
      return (data as Row[] ?? []).map(mapInvoice);
    },

    async getInvoice(id) {
      const { data, error } = await db().from('invoices').select('*, items:invoice_items(*)').eq('id', id).maybeSingle();
      check(error);
      return data ? mapInvoice(data as Row) : null;
    },

    async saveInvoice(input) {
      const { items, id, ...rest } = input;
      const { data, error } = await db().rpc('save_invoice', {
        p_id: id ?? null,
        p_payload: rest,
        p_items: itemsPayload(items)
      });
      check(error);
      const saved = await api.getInvoice(String(data));
      if (!saved) throw new Error('The invoice was saved but could not be reloaded.');
      return saved;
    },

    async setInvoiceStatus(id, status) {
      const { error } = await db().rpc('set_invoice_status', { p_id: id, p_status: status });
      check(error);
    },

    async listQuotations() {
      const { data, error } = await db().
      from('quotations').
      select('*, items:quotation_items(*)').
      order('created_at', { ascending: false });
      check(error);
      return (data as Row[] ?? []).map(mapQuotation);
    },

    async getQuotation(id) {
      const { data, error } = await db().from('quotations').select('*, items:quotation_items(*)').eq('id', id).maybeSingle();
      check(error);
      return data ? mapQuotation(data as Row) : null;
    },

    async saveQuotation(input) {
      const { items, id, ...rest } = input;
      const { data, error } = await db().rpc('save_quotation', {
        p_id: id ?? null,
        p_payload: rest,
        p_items: itemsPayload(items)
      });
      check(error);
      const saved = await api.getQuotation(String(data));
      if (!saved) throw new Error('The quotation was saved but could not be reloaded.');
      return saved;
    },

    async setQuotationStatus(id, status) {
      const { error } = await db().rpc('set_quotation_status', { p_id: id, p_status: status });
      check(error);
    },

    async convertQuotation(id) {
      const { data, error } = await db().rpc('convert_quotation_to_invoice', { p_id: id });
      check(error);
      return String(data);
    },

    async setArchived(kind, id, archived) {
      const { error } = await db().rpc('set_document_archived', { p_kind: kind, p_id: id, p_archived: archived });
      check(error);
    },

    async listPayments() {
      const { data, error } = await db().from('payments').select('*').order('payment_date', { ascending: false });
      check(error);
      return (data as Row[] ?? []).map(
        (r): Payment => ({
          id: str(r.id),
          company_id: str(r.company_id),
          invoice_id: str(r.invoice_id),
          payment_date: str(r.payment_date),
          amount: num(r.amount),
          method: str(r.method) as Payment['method'],
          reference: str(r.reference),
          notes: str(r.notes),
          recorded_by: strOrNull(r.recorded_by),
          created_at: str(r.created_at)
        })
      );
    },

    async recordPayment(input) {
      const { data, error } = await db().rpc('record_payment', {
        p_invoice_id: input.invoice_id,
        p_amount: input.amount,
        p_payment_date: input.payment_date,
        p_method: input.method,
        p_reference: input.reference,
        p_notes: input.notes,
        p_idempotency_key: input.idempotency_key
      });
      check(error);
      return String(data);
    },

    async listPlans() {
      const { data, error } = await db().from('maintenance_plans').select('*').order('next_maintenance_date', { ascending: true, nullsFirst: false });
      check(error);
      return (data as Row[] ?? []).map(mapPlan);
    },

    async savePlan(input) {
      const { id, ...rest } = input;
      const payload = {
        ...rest,
        custom_interval_days: rest.billing_frequency === 'custom' ? rest.custom_interval_days : null
      };
      if (id) {
        const { data, error } = await db().from('maintenance_plans').update(payload).eq('id', id).select('*').single();
        check(error);
        return mapPlan(data as Row);
      }
      const [cid, uid] = await Promise.all([companyId(), currentUserId()]);
      const { data, error } = await db().
      from('maintenance_plans').
      insert({ ...payload, company_id: cid, created_by: uid }).
      select('*').
      single();
      check(error);
      return mapPlan(data as Row);
    },

    async listMaintenanceActivities(planId) {
      let query = db().from('maintenance_activities').select('*').order('completed_on', { ascending: false });
      if (planId) query = query.eq('plan_id', planId);
      const { data, error } = await query;
      check(error);
      return (data as Row[] ?? []).map(
        (r): MaintenanceActivity => ({
          id: str(r.id),
          plan_id: str(r.plan_id),
          completed_on: str(r.completed_on),
          work_performed: str(r.work_performed),
          assigned_to: strOrNull(r.assigned_to),
          notes: str(r.notes),
          next_scheduled_date: strOrNull(r.next_scheduled_date),
          created_by: strOrNull(r.created_by),
          created_at: str(r.created_at)
        })
      );
    },

    async listBillingPeriods(planId) {
      let query = db().from('maintenance_billing_periods').select('*').order('period_start', { ascending: false });
      if (planId) query = query.eq('plan_id', planId);
      const { data, error } = await query;
      check(error);
      return (data as Row[] ?? []).map(
        (r): BillingPeriod => ({
          id: str(r.id),
          plan_id: str(r.plan_id),
          period_start: str(r.period_start),
          period_end: str(r.period_end),
          invoice_id: strOrNull(r.invoice_id),
          status: str(r.status) as BillingPeriod['status'],
          created_at: str(r.created_at)
        })
      );
    },

    async recordMaintenanceActivity(input) {
      const { error } = await db().rpc('record_maintenance_activity', {
        p_plan_id: input.plan_id,
        p_completed_on: input.completed_on,
        p_work: input.work_performed,
        p_assigned_to: input.assigned_to,
        p_notes: input.notes,
        p_next_date: input.next_scheduled_date
      });
      check(error);
    },

    async createMaintenanceInvoice(input) {
      const { data, error } = await db().rpc('create_maintenance_invoice', {
        p_plan_id: input.plan_id,
        p_period_start: input.period_start,
        p_period_end: input.period_end,
        p_due_date: input.due_date
      });
      check(error);
      return String(data);
    },

    async listActivity(options) {
      let query = db().
      from('document_activity').
      select('id, entity_type, entity_id, action, summary, actor_id, created_at').
      order('created_at', { ascending: false }).
      limit(options?.limit ?? 50);
      if (options?.entityId) query = query.eq('entity_id', options.entityId);
      const { data, error } = await query;
      check(error);
      return (data as Row[] ?? []).map(
        (r): ActivityEntry => ({
          id: str(r.id),
          entity_type: str(r.entity_type) as ActivityEntry['entity_type'],
          entity_id: strOrNull(r.entity_id),
          action: str(r.action),
          summary: str(r.summary),
          actor_id: strOrNull(r.actor_id),
          created_at: str(r.created_at)
        })
      );
    },

    async healthCheck(): Promise<HealthResult> {
      const started = performance.now();
      const errors: string[] = [];
      let database: HealthLevel = 'failed';
      let auth: HealthLevel = 'failed';

      await Promise.all([
      (async () => {
        try {
          const { error } = await withTimeout(db().rpc('health_check'), 8000);
          if (error) errors.push(`Database: ${error.message}`);else
          database = 'connected';
        } catch (e) {
          errors.push(`Database: ${errorMessage(e)}`);
        }
      })(),
      (async () => {
        try {
          const res = await withTimeout(
            fetch(`${supabaseUrl}/auth/v1/health`, { headers: { apikey: supabaseAnonKey } }),
            8000
          );
          if (res.ok) auth = 'connected';else
          errors.push(`Authentication: service responded with HTTP ${res.status}`);
        } catch (e) {
          errors.push(`Authentication: ${errorMessage(e)}`);
        }
      })()]
      );

      const overall: HealthLevel =
      database === 'connected' && auth === 'connected' ?
      'connected' :
      database === 'connected' || auth === 'connected' ?
      'degraded' :
      'failed';

      return {
        overall,
        database,
        auth,
        checkedAt: new Date().toISOString(),
        latencyMs: Math.round(performance.now() - started),
        error: errors.length ? errors.join(' · ') : null
      };
    }
  };

  return api;
}