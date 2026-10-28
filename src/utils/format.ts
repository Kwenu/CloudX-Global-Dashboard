import { addDays, format, formatDistanceToNowStrict, parseISO } from 'date-fns';

const numberFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

export function formatAmount(amount: number): string {
  return numberFormatter.format(Number.isFinite(amount) ? amount : 0);
}

/** "Rs. 12,500.00" for LKR, "USD 12,500.00" otherwise */
export function formatMoney(amount: number, currency = 'LKR'): string {
  const prefix = currency === 'LKR' ? 'Rs.' : currency;
  return `${prefix} ${formatAmount(amount)}`;
}

export function formatCompactMoney(amount: number, currency = 'LKR'): string {
  const prefix = currency === 'LKR' ? 'Rs.' : currency;
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `${prefix} ${(amount / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${prefix} ${(amount / 1_000).toFixed(1)}K`;
  return formatMoney(amount, currency);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'd MMM yyyy');
  } catch {
    return iso;
  }
}

/** dd/MM/yyyy — matches the document templates */
export function formatDocDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'dd/MM/yyyy');
  } catch {
    return iso;
  }
}

export function formatRelative(iso: string): string {
  try {
    return `${formatDistanceToNowStrict(parseISO(iso))} ago`;
  } catch {
    return iso;
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'd MMM yyyy, h:mm a');
  } catch {
    return iso;
  }
}

export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function addDaysISO(iso: string, days: number): string {
  return format(addDays(parseISO(iso), days), 'yyyy-MM-dd');
}

export function initials(name: string): string {
  return (
    name.
    split(/\s+/).
    filter(Boolean).
    slice(0, 2).
    map((p) => p[0]?.toUpperCase()).
    join('') || '?');

}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as {message: unknown;}).message);
  }
  return 'Something went wrong. Please try again.';
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : r & 0x3 | 0x8).toString(16);
  });
}