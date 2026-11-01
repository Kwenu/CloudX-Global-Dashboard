import type { PdfDocumentInput } from '../services/pdf/documentLayout';
import type { Client, CompanySettings, Invoice, LineItemInput, Quotation } from '../types/database';
import { companyContact } from '../data/brand';
import { computeTotals, lineGross } from './calculations';

export function paymentLines(settings: CompanySettings | null): string[] {
  if (!settings) return [];
  const lines: string[] = [];
  if (settings.bank_name) lines.push(`Bank : ${settings.bank_name}`);
  if (settings.bank_account_name) lines.push(`Account Name : ${settings.bank_account_name}`);
  if (settings.bank_account_number) lines.push(`Account No : ${settings.bank_account_number}`);
  if (settings.bank_branch) lines.push(`Branch : ${settings.bank_branch}`);
  if (settings.payment_instructions) lines.push(...settings.payment_instructions.split('\n'));
  return lines;
}

export interface Signatory {
  name: string;
  title: string;
  /** The director's saved signature image (transparent PNG), if any */
  signature?: {src: string;aspect: number;} | null;
}

/** Address, email, phone and tax id of the client, one entry per printed line. */
export function clientDetailLines(client: Client | null): string[] {
  if (!client) return [];
  const lines: string[] = [];
  for (const part of (client.billing_address || '').replace(/\r/g, '').split('\n')) {
    if (part.trim()) lines.push(part.trim());
  }
  if (client.email) lines.push(client.email);
  if (client.phone) lines.push(client.phone);
  if (client.tax_id) lines.push(`Tax ID: ${client.tax_id}`);
  return lines;
}

/** Company details printed in the footer of every page (the email is the official CloudX contact address). */
export function footerLines(settings: CompanySettings | null): string[] {
  if (!settings) return ['CloudX Global (Pvt) Ltd', companyContact.email];
  const address = settings.address.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean).join(', ');
  const contact = [companyContact.email, settings.phone, settings.website, settings.registration_number ? `Reg. No. ${settings.registration_number}` : ''].
  filter(Boolean).
  join('   |   ');
  const lines = [address, contact].filter(Boolean);
  return lines.length ? lines : [settings.company_name || 'CloudX Global (Pvt) Ltd'];
}

interface DraftFields {
  kind: 'invoice' | 'quotation';
  number: string;
  issueDate: string;
  secondaryDate: string | null;
  currency: string;
  projectTitle: string;
  projectDescription: string;
  scope?: string;
  deliverables?: string;
  paymentSchedule?: string;
  items: LineItemInput[];
  paymentTerms?: string;
  additionalCharges: number;
  amountPaid: number;
  notes: string;
  terms: string;
}

export function buildPdfInput(
fields: DraftFields,
client: Client | null,
settings: CompanySettings | null,
signatory: Signatory,
logo: {src: string;aspect: number;} | null)
: PdfDocumentInput {
  const totals = computeTotals(fields.items, fields.additionalCharges);
  return {
    kind: fields.kind,
    number: fields.number,
    issueDate: fields.issueDate,
    secondaryDate: fields.secondaryDate,
    clientName: client ? client.business_name || client.name : 'Select a client',
    clientContact: client && client.business_name && client.name !== client.business_name ? client.name : '',
    clientLines: clientDetailLines(client),
    projectTitle: fields.projectTitle,
    projectDescription: fields.projectDescription,
    extraSections:
    fields.kind === 'quotation' ?
    [
    { title: 'Scope of Work', body: fields.scope ?? '' },
    { title: 'Deliverables', body: fields.deliverables ?? '' },
    { title: 'Payment Schedule', body: fields.paymentSchedule ?? '' }] :

    [],
    items: fields.items.
    filter((i) => i.description.trim() || Number(i.unit_price) > 0).
    map((i) => ({
      description: i.description,
      details: i.details,
      quantity: Number(i.quantity) || 0,
      unit_price: Number(i.unit_price) || 0,
      line_total: lineGross(i)
    })),
    currency: fields.currency,
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    additionalCharges: totals.additionalCharges,
    total: totals.total,
    advance: fields.amountPaid,
    balance: Math.max(0, totals.total - fields.amountPaid),
    paymentTerms: fields.paymentTerms ?? '',
    paymentLines: paymentLines(settings),
    notes: fields.notes,
    terms: fields.terms,
    signatoryName: signatory.name,
    signatoryTitle: signatory.title,
    signature: signatory.signature ?? null,
    companyName: settings?.company_name ?? 'CloudX Global (Pvt) Ltd',
    slogan: fields.kind === 'quotation' ? settings?.quotation_slogan ?? '' : '',
    footerLines: footerLines(settings),
    logo
  };
}

export function pdfInputFromDocument(
doc: Invoice | Quotation,
client: Client | null,
settings: CompanySettings | null,
signatory: Signatory,
logo: {src: string;aspect: number;} | null)
: PdfDocumentInput {
  const isInvoice = doc.kind === 'invoice';
  return buildPdfInput(
    {
      kind: doc.kind,
      number: doc.number,
      issueDate: doc.issue_date,
      secondaryDate: isInvoice ? doc.due_date : doc.valid_until,
      currency: doc.currency,
      projectTitle: isInvoice ? doc.project_reference : doc.project_title,
      projectDescription: isInvoice ? '' : doc.project_description,
      scope: isInvoice ? '' : doc.scope_of_work,
      deliverables: isInvoice ? '' : doc.deliverables,
      paymentSchedule: isInvoice ? '' : doc.payment_schedule,
      items: doc.items,
      paymentTerms: isInvoice ? doc.payment_terms : '',
      additionalCharges: doc.additional_charges,
      amountPaid: isInvoice ? doc.amount_paid : 0,
      notes: doc.notes,
      terms: doc.terms
    },
    client,
    settings,
    signatory,
    logo
  );
}

export function documentPath(kind: 'invoice' | 'quotation', id: string): string {
  return `/${kind === 'invoice' ? 'invoices' : 'quotations'}/${id}`;
}