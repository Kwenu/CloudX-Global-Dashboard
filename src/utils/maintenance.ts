import { addDays, addMonths, differenceInCalendarDays, format, parseISO } from 'date-fns';
import type {
  BillingFrequency,
  MaintenancePlan,
  MaintenanceScheduleStatus } from
'../types/database';
import { todayISO } from './format';

export const frequencyLabels: Record<BillingFrequency, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  half_yearly: 'Half-yearly',
  annually: 'Annually',
  custom: 'Custom interval'
};

export function addInterval(
iso: string,
frequency: BillingFrequency,
customDays: number | null)
: string {
  const date = parseISO(iso);
  const months: Record<Exclude<BillingFrequency, 'custom'>, number> = {
    monthly: 1,
    quarterly: 3,
    half_yearly: 6,
    annually: 12
  };
  const next =
  frequency === 'custom' ?
  addDays(date, Math.max(1, customDays ?? 30)) :
  addMonths(date, months[frequency]);
  return format(next, 'yyyy-MM-dd');
}

export function periodEndFor(
start: string,
frequency: BillingFrequency,
customDays: number | null)
: string {
  return format(addDays(parseISO(addInterval(start, frequency, customDays)), -1), 'yyyy-MM-dd');
}

/** Normalises a plan's charge to a monthly value for recurring-value totals. */
export function monthlyValue(plan: Pick<MaintenancePlan, 'charge' | 'billing_frequency' | 'custom_interval_days'>): number {
  const months =
  plan.billing_frequency === 'monthly' ?
  1 :
  plan.billing_frequency === 'quarterly' ?
  3 :
  plan.billing_frequency === 'half_yearly' ?
  6 :
  plan.billing_frequency === 'annually' ?
  12 :
  Math.max(1, plan.custom_interval_days ?? 30) / 30.4375;
  return plan.charge / months;
}

export function daysUntil(iso: string, today = todayISO()): number {
  return differenceInCalendarDays(parseISO(iso), parseISO(today));
}

/** Schedule statuses are derived from dates; lifecycle statuses (on hold, completed, cancelled) are preserved. */
export function scheduleStatus(
plan: Pick<MaintenancePlan, 'status' | 'next_maintenance_date'>,
dueSoonDays: number,
today = todayISO())
: MaintenanceScheduleStatus {
  if (plan.status !== 'active') return plan.status;
  if (!plan.next_maintenance_date) return 'active';
  const diff = daysUntil(plan.next_maintenance_date, today);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'due';
  if (diff <= dueSoonDays) return 'due_soon';
  return 'active';
}