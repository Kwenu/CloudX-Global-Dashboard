import type { Api } from '../types/api';
import { addDaysISO, newId, todayISO } from '../utils/format';
import { PREVIEW_USER_ID } from './localApi';

/** Loads clearly fictional sample records into the LOCAL PREVIEW only. Never used with Supabase. */
export async function seedPreviewData(api: Api): Promise<void> {
  if (api.mode !== 'local') throw new Error('Sample data is only available in local preview.');
  const today = todayISO();

  const a = await api.saveClient({ name: 'Sample Client A', business_name: 'Example Retail (Pvt) Ltd', email: 'accounts@example.com', phone: '', billing_address: 'Colombo', tax_id: '', notes: 'Sample record' });
  const b = await api.saveClient({ name: 'Sample Client B', business_name: 'Example Hospitality', email: 'hello@example.org', phone: '', billing_address: 'Kandy', tax_id: '', notes: 'Sample record' });

  const inv1 = await api.saveInvoice({
    client_id: a.id,
    issue_date: addDaysISO(today, -40),
    due_date: addDaysISO(today, -10),
    currency: 'LKR',
    project_reference: 'Corporate website',
    payment_terms: 'Payment within 30 days',
    additional_charges: 0,
    notes: '',
    terms: '',
    status: 'issued',
    items: [
    { description: 'Website Design & Development', details: 'Five-page responsive website with CMS.', quantity: 1, unit_price: 185000, discount: 0, tax_rate: 0 },
    { description: 'Web Hosting (12 months)', details: 'Managed hosting with SSL.', quantity: 1, unit_price: 24000, discount: 0, tax_rate: 0 }]

  });
  await api.recordPayment({ invoice_id: inv1.id, payment_date: addDaysISO(today, -35), amount: 100000, method: 'bank_transfer', reference: 'ADV-001', notes: 'Advance', idempotency_key: newId() });

  await api.saveInvoice({
    client_id: b.id,
    issue_date: addDaysISO(today, -5),
    due_date: addDaysISO(today, 25),
    currency: 'LKR',
    project_reference: 'POS rollout',
    payment_terms: 'Payment within 30 days',
    additional_charges: 0,
    notes: '',
    terms: '',
    status: 'issued',
    items: [{ description: 'POS System', details: 'Two terminals, configuration and staff training.', quantity: 2, unit_price: 65000, discount: 5000, tax_rate: 0 }]
  });

  await api.saveQuotation({
    client_id: b.id,
    issue_date: addDaysISO(today, -3),
    valid_until: addDaysISO(today, 27),
    currency: 'LKR',
    project_title: 'Booking website',
    project_description: 'A booking-enabled website for the hotel with room galleries and enquiry forms.',
    scope_of_work: '',
    deliverables: '',
    payment_schedule: '50% advance, 50% on launch',
    additional_charges: 0,
    notes: '',
    terms: '',
    status: 'sent',
    items: [{ description: 'Website Design & Development', details: 'Booking engine integration.', quantity: 1, unit_price: 240000, discount: 0, tax_rate: 0 }]
  });

  await api.savePlan({
    client_id: a.id,
    project_name: 'Corporate website',
    project_url: 'https://example.com',
    service_type: 'Website Maintenance',
    description: 'Monthly updates, backups and security patches.',
    start_date: addDaysISO(today, -60),
    last_maintenance_date: addDaysISO(today, -27),
    next_maintenance_date: addDaysISO(today, 3),
    charge: 12000,
    currency: 'LKR',
    billing_frequency: 'monthly',
    custom_interval_days: null,
    payment_terms: 'Payment within 14 days',
    assigned_to: PREVIEW_USER_ID,
    status: 'active',
    notes: ''
  });
}