import type {
  ActivityEntry,
  BillingPeriod,
  Client,
  ClientInput,
  CompanySettings,
  DocumentKind,
  HealthResult,
  InviteInput,
  Invoice,
  InvoiceInput,
  MaintenanceActivity,
  MaintenanceActivityInput,
  MaintenancePlan,
  MaintenancePlanInput,
  Member,
  MemberStatus,
  Payment,
  PaymentInput,
  Quotation,
  QuotationInput,
  QuotationStatus,
  Role } from
'./database';

export type ApiMode = 'supabase' | 'local';

/**
 * Every data operation the UI performs. Two implementations exist:
 * - supabaseApi: the production backend (Postgres + RLS + RPC functions)
 * - localApi: a clearly-labelled browser-only preview used when Supabase is not configured
 */
export interface Api {
  mode: ApiMode;
  getSettings(): Promise<CompanySettings>;
  updateSettings(patch: Partial<CompanySettings>): Promise<CompanySettings>;
  uploadLogo(file: File): Promise<CompanySettings>;
  getLogoDataUrl(settings: CompanySettings): Promise<string | null>;

  listMembers(): Promise<Member[]>;
  updateMyProfile(patch: {display_name: string;job_title: string;}): Promise<void>;
  /** Stores the signed-in director's signature (transparent PNG). Replaces any previous one. */
  saveMySignature(png: Blob): Promise<void>;
  removeMySignature(): Promise<void>;
  /** Returns the signature as a data URL, ready to be placed on a PDF. */
  getSignatureDataUrl(path: string | null | undefined): Promise<string | null>;
  inviteMember(input: InviteInput): Promise<void>;
  updateMember(userId: string, patch: {role: Role;status: MemberStatus;}): Promise<void>;

  listClients(): Promise<Client[]>;
  saveClient(input: ClientInput): Promise<Client>;

  listInvoices(): Promise<Invoice[]>;
  getInvoice(id: string): Promise<Invoice | null>;
  saveInvoice(input: InvoiceInput): Promise<Invoice>;
  setInvoiceStatus(id: string, status: 'issued' | 'cancelled'): Promise<void>;

  listQuotations(): Promise<Quotation[]>;
  getQuotation(id: string): Promise<Quotation | null>;
  saveQuotation(input: QuotationInput): Promise<Quotation>;
  setQuotationStatus(id: string, status: Exclude<QuotationStatus, 'converted'>): Promise<void>;
  convertQuotation(id: string): Promise<string>;

  setArchived(kind: DocumentKind, id: string, archived: boolean): Promise<void>;

  listPayments(): Promise<Payment[]>;
  recordPayment(input: PaymentInput): Promise<string>;

  listPlans(): Promise<MaintenancePlan[]>;
  savePlan(input: MaintenancePlanInput): Promise<MaintenancePlan>;
  listMaintenanceActivities(planId?: string): Promise<MaintenanceActivity[]>;
  listBillingPeriods(planId?: string): Promise<BillingPeriod[]>;
  recordMaintenanceActivity(input: MaintenanceActivityInput): Promise<void>;
  createMaintenanceInvoice(input: {
    plan_id: string;
    period_start: string;
    period_end: string;
    due_date: string;
  }): Promise<string>;

  listActivity(options?: {limit?: number;entityId?: string;}): Promise<ActivityEntry[]>;
  healthCheck(): Promise<HealthResult>;
}