export type Role = 'owner' | 'admin' | 'director' | 'accountant' | 'staff' | 'viewer';
export type MemberStatus = 'active' | 'invited' | 'suspended';
export type InvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted';
export type BillingFrequency = 'monthly' | 'quarterly' | 'half_yearly' | 'annually' | 'custom';
export type MaintenanceLifecycle = 'active' | 'completed' | 'on_hold' | 'cancelled';
export type MaintenanceScheduleStatus =
'active' |
'due_soon' |
'due' |
'overdue' |
'completed' |
'on_hold' |
'cancelled';
export type PaymentMethod = 'bank_transfer' | 'cash' | 'cheque' | 'card' | 'online' | 'other';
export type DocumentKind = 'invoice' | 'quotation';
export type BillingPeriodStatus = 'invoiced' | 'paid' | 'void';
export type Permission =
'workspace.read' |
'clients.write' |
'documents.write' |
'payments.write' |
'maintenance.write' |
'settings.write' |
'members.manage';

export interface CompanySettings {
  company_id: string;
  company_name: string;
  logo_path: string | null;
  address: string;
  email: string;
  phone: string;
  website: string;
  registration_number: string;
  default_currency: string;
  default_payment_terms: string;
  bank_name: string;
  bank_account_name: string;
  bank_account_number: string;
  bank_branch: string;
  payment_instructions: string;
  default_invoice_notes: string;
  default_invoice_terms: string;
  default_quotation_notes: string;
  default_quotation_terms: string;
  quotation_validity_days: number;
  quotation_slogan: string;
  invoice_prefix: string;
  quotation_prefix: string;
  number_padding: number;
  number_include_year: boolean;
  maintenance_default_frequency: BillingFrequency;
  maintenance_default_currency: string;
  maintenance_due_soon_days: number;
  maintenance_default_terms: string;
  maintenance_default_description: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  display_name: string;
  job_title: string | null;
  email: string | null;
  status: 'active' | 'disabled';
}

export interface Member {
  company_id: string;
  user_id: string;
  role: Role;
  status: MemberStatus;
  created_at: string;
  profile: Profile | null;
}

export interface InviteInput {
  email: string;
  display_name: string;
  job_title: string;
  role: Role;
}

export interface Client {
  id: string;
  company_id: string;
  name: string;
  business_name: string;
  email: string;
  phone: string;
  billing_address: string;
  tax_id: string;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ClientInput = Pick<
  Client,
  'name' | 'business_name' | 'email' | 'phone' | 'billing_address' | 'tax_id' | 'notes'> &
{id?: string;};

export interface LineItem {
  id?: string;
  description: string;
  details: string;
  quantity: number;
  unit_price: number;
  discount: number;
  tax_rate: number;
  line_total: number;
  position: number;
}

export type LineItemInput = Pick<
  LineItem,
  'description' | 'details' | 'quantity' | 'unit_price' | 'discount' | 'tax_rate'>;


interface DocumentCommon {
  id: string;
  company_id: string;
  number: string;
  client_id: string;
  issue_date: string;
  currency: string;
  subtotal: number;
  discount: number;
  tax: number;
  additional_charges: number;
  total: number;
  notes: string;
  terms: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  items: LineItem[];
}

export interface Invoice extends DocumentCommon {
  kind: 'invoice';
  status: InvoiceStatus;
  due_date: string;
  project_reference: string;
  payment_terms: string;
  amount_paid: number;
  balance_due: number;
  quotation_id: string | null;
  maintenance_plan_id: string | null;
  billing_period_id: string | null;
}

export interface Quotation extends DocumentCommon {
  kind: 'quotation';
  status: QuotationStatus;
  valid_until: string;
  project_title: string;
  project_description: string;
  scope_of_work: string;
  deliverables: string;
  payment_schedule: string;
  converted_invoice_id: string | null;
}

export type AnyDocument = Invoice | Quotation;

export interface InvoiceInput {
  id?: string;
  client_id: string;
  issue_date: string;
  due_date: string;
  currency: string;
  project_reference: string;
  payment_terms: string;
  additional_charges: number;
  notes: string;
  terms: string;
  status: 'draft' | 'issued';
  items: LineItemInput[];
}

export interface QuotationInput {
  id?: string;
  client_id: string;
  issue_date: string;
  valid_until: string;
  currency: string;
  project_title: string;
  project_description: string;
  scope_of_work: string;
  deliverables: string;
  payment_schedule: string;
  additional_charges: number;
  notes: string;
  terms: string;
  status: 'draft' | 'sent';
  items: LineItemInput[];
}

export interface Payment {
  id: string;
  company_id: string;
  invoice_id: string;
  payment_date: string;
  amount: number;
  method: PaymentMethod;
  reference: string;
  notes: string;
  recorded_by: string | null;
  created_at: string;
}

export interface PaymentInput {
  invoice_id: string;
  payment_date: string;
  amount: number;
  method: PaymentMethod;
  reference: string;
  notes: string;
  idempotency_key: string;
}

export interface MaintenancePlan {
  id: string;
  company_id: string;
  client_id: string;
  project_name: string;
  project_url: string;
  service_type: string;
  description: string;
  start_date: string;
  last_maintenance_date: string | null;
  next_maintenance_date: string | null;
  charge: number;
  currency: string;
  billing_frequency: BillingFrequency;
  custom_interval_days: number | null;
  payment_terms: string;
  assigned_to: string | null;
  status: MaintenanceLifecycle;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type MaintenancePlanInput = Omit<
  MaintenancePlan,
  'id' | 'company_id' | 'created_by' | 'created_at' | 'updated_at'> &
{id?: string;};

export interface MaintenanceActivity {
  id: string;
  plan_id: string;
  completed_on: string;
  work_performed: string;
  assigned_to: string | null;
  notes: string;
  next_scheduled_date: string | null;
  created_by: string | null;
  created_at: string;
}

export interface MaintenanceActivityInput {
  plan_id: string;
  completed_on: string;
  work_performed: string;
  assigned_to: string | null;
  notes: string;
  next_scheduled_date: string | null;
}

export interface BillingPeriod {
  id: string;
  plan_id: string;
  period_start: string;
  period_end: string;
  invoice_id: string | null;
  status: BillingPeriodStatus;
  created_at: string;
}

export type ActivityEntity =
'invoice' |
'quotation' |
'client' |
'payment' |
'maintenance_plan' |
'settings' |
'member';

export interface ActivityEntry {
  id: string;
  entity_type: ActivityEntity;
  entity_id: string | null;
  action: string;
  summary: string;
  actor_id: string | null;
  created_at: string;
}

export type HealthLevel = 'connected' | 'checking' | 'degraded' | 'failed' | 'not_configured';

export interface HealthResult {
  overall: HealthLevel;
  database: HealthLevel;
  auth: HealthLevel;
  checkedAt: string;
  latencyMs: number | null;
  error: string | null;
}