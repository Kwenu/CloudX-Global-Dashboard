import type { Invoice, InvoiceStatus, LineItemInput, Quotation, QuotationStatus } from '../types/database';
import { todayISO } from './format';

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Line total = quantity × unit price (gross, before line discount and tax). */
export function lineGross(item: Pick<LineItemInput, 'quantity' | 'unit_price'>): number {
  return round2((Number(item.quantity) || 0) * (Number(item.unit_price) || 0));
}

export interface Totals {
  subtotal: number;
  discount: number;
  tax: number;
  additionalCharges: number;
  total: number;
}

/**
 * Subtotal = Σ line totals
 * Total    = Subtotal − Discounts + Taxes + Additional charges
 * Tax is calculated on each line after its discount. Mirrors the SQL in save_invoice / save_quotation.
 */
export function computeTotals(items: LineItemInput[], additionalCharges: number): Totals {
  let subtotal = 0;
  let discount = 0;
  let tax = 0;
  for (const item of items) {
    const gross = lineGross(item);
    const lineDiscount = Math.min(round2(Number(item.discount) || 0), gross);
    subtotal += gross;
    discount += lineDiscount;
    tax += round2((gross - lineDiscount) * (Number(item.tax_rate) || 0) / 100);
  }
  const charges = round2(Number(additionalCharges) || 0);
  subtotal = round2(subtotal);
  discount = round2(discount);
  tax = round2(tax);
  return {
    subtotal,
    discount,
    tax,
    additionalCharges: charges,
    total: round2(subtotal - discount + tax + charges)
  };
}

export function invoiceDisplayStatus(invoice: Invoice, today = todayISO()): InvoiceStatus {
  const open =
  invoice.status === 'issued' ||
  invoice.status === 'partially_paid' ||
  invoice.status === 'overdue';
  if (open && invoice.balance_due > 0 && invoice.due_date < today) return 'overdue';
  if (invoice.status === 'overdue') return invoice.amount_paid > 0 ? 'partially_paid' : 'issued';
  return invoice.status;
}

export function quotationDisplayStatus(quotation: Quotation, today = todayISO()): QuotationStatus {
  if (quotation.status === 'sent' && quotation.valid_until && quotation.valid_until < today) {
    return 'expired';
  }
  return quotation.status;
}

export function isOutstanding(invoice: Invoice): boolean {
  return invoice.status !== 'draft' && invoice.status !== 'cancelled' && invoice.balance_due > 0;
}