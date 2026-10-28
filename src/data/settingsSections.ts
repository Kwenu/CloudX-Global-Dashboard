import type { CompanySettings } from '../types/database';

export type SettingsSectionId = 'company' | 'invoice' | 'quotation' | 'payment' | 'maintenance' | 'access' | 'system';

export type SettingsFieldType = 'text' | 'textarea' | 'number' | 'select' | 'toggle' | 'email' | 'url';

export interface SettingsField {
  key: keyof CompanySettings;
  label: string;
  type: SettingsFieldType;
  hint?: string;
  options?: {value: string;label: string;}[];
  wide?: boolean;
  min?: number;
  max?: number;
}

export interface SettingsSection {
  id: SettingsSectionId;
  label: string;
  description: string;
  fields?: SettingsField[];
}

const currencyOptions = ['LKR', 'USD', 'EUR', 'GBP', 'AUD', 'INR'].map((c) => ({ value: c, label: c === 'LKR' ? 'LKR — Rs.' : c }));

export const settingsSections: SettingsSection[] = [
{
  id: 'company',
  label: 'Company profile',
  description: 'Shown in document footers and headers.',
  fields: [
  { key: 'company_name', label: 'Company name', type: 'text' },
  { key: 'registration_number', label: 'Registration number', type: 'text' },
  { key: 'email', label: 'Official email', type: 'email' },
  { key: 'phone', label: 'Phone number', type: 'text' },
  { key: 'website', label: 'Website', type: 'url' },
  { key: 'address', label: 'Address', type: 'textarea', wide: true }]

},
{
  id: 'invoice',
  label: 'Invoices',
  description: 'Numbering and defaults for new invoices.',
  fields: [
  { key: 'invoice_prefix', label: 'Invoice prefix', type: 'text', hint: 'e.g. CX → CX-2026-0001' },
  { key: 'number_padding', label: 'Number digits', type: 'number', min: 3, max: 8, hint: 'Shared by invoices and quotations.' },
  { key: 'number_include_year', label: 'Include year in numbers', type: 'toggle' },
  { key: 'default_currency', label: 'Default currency', type: 'select', options: currencyOptions },
  { key: 'default_payment_terms', label: 'Default payment terms', type: 'text', wide: true },
  { key: 'default_invoice_notes', label: 'Default notes', type: 'textarea' },
  { key: 'default_invoice_terms', label: 'Default terms and conditions', type: 'textarea' }]

},
{
  id: 'quotation',
  label: 'Quotations',
  description: 'Numbering, validity and defaults for new quotations.',
  fields: [
  { key: 'quotation_prefix', label: 'Quotation prefix', type: 'text', hint: 'e.g. CXQ → CXQ-2026-0001' },
  { key: 'quotation_validity_days', label: 'Validity period (days)', type: 'number', min: 1, max: 365 },
  { key: 'quotation_slogan', label: 'Slogan', type: 'text', wide: true, hint: 'Printed under the logo on quotations. Leave empty to hide.' },
  { key: 'default_quotation_notes', label: 'Default notes', type: 'textarea' },
  { key: 'default_quotation_terms', label: 'Default terms and pricing notes', type: 'textarea' }]

},
{
  id: 'payment',
  label: 'Payment details',
  description: 'Printed in the Payment Method area of every invoice and quotation.',
  fields: [
  { key: 'bank_name', label: 'Bank name', type: 'text' },
  { key: 'bank_branch', label: 'Branch', type: 'text' },
  { key: 'bank_account_name', label: 'Account holder', type: 'text' },
  { key: 'bank_account_number', label: 'Account number', type: 'text' },
  { key: 'payment_instructions', label: 'Payment instructions', type: 'textarea', wide: true }]

},
{
  id: 'maintenance',
  label: 'Maintenance',
  description: 'Defaults for new maintenance plans and due-soon warnings.',
  fields: [
  {
    key: 'maintenance_default_frequency',
    label: 'Default billing frequency',
    type: 'select',
    options: [
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'half_yearly', label: 'Half-yearly' },
    { value: 'annually', label: 'Annually' },
    { value: 'custom', label: 'Custom interval' }]

  },
  { key: 'maintenance_default_currency', label: 'Default currency', type: 'select', options: currencyOptions },
  { key: 'maintenance_due_soon_days', label: 'Due-soon warning (days)', type: 'number', min: 1, max: 90 },
  { key: 'maintenance_default_terms', label: 'Default payment terms', type: 'text' },
  { key: 'maintenance_default_description', label: 'Default service description', type: 'textarea', wide: true }]

},
{ id: 'access', label: 'Users & access', description: 'Director accounts, invitations and roles.' },
{ id: 'system', label: 'System & database', description: 'Live backend connection health.' }];