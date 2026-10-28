import React from 'react';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand' | 'muted';

const statusMap: Record<string, {label: string;tone: Tone;}> = {
  draft: { label: 'Draft', tone: 'neutral' },
  issued: { label: 'Issued', tone: 'info' },
  partially_paid: { label: 'Partially paid', tone: 'warning' },
  paid: { label: 'Paid', tone: 'success' },
  overdue: { label: 'Overdue', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
  sent: { label: 'Sent', tone: 'info' },
  accepted: { label: 'Accepted', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  expired: { label: 'Expired', tone: 'muted' },
  converted: { label: 'Converted', tone: 'brand' },
  active: { label: 'Active', tone: 'success' },
  due_soon: { label: 'Due soon', tone: 'warning' },
  due: { label: 'Due today', tone: 'warning' },
  completed: { label: 'Completed', tone: 'neutral' },
  on_hold: { label: 'On hold', tone: 'muted' },
  invoiced: { label: 'Invoiced', tone: 'info' },
  void: { label: 'Void', tone: 'muted' },
  invited: { label: 'Invited', tone: 'warning' },
  suspended: { label: 'Suspended', tone: 'danger' },
  archived: { label: 'Archived', tone: 'muted' }
};

const tones: Record<Tone, {pill: string;dot: string;}> = {
  neutral: { pill: 'bg-ink/[0.05] text-ink/70 ring-ink/10', dot: 'bg-ink/40' },
  info: { pill: 'bg-info/[0.07] text-info ring-info/20', dot: 'bg-info' },
  success: { pill: 'bg-success/[0.08] text-success ring-success/20', dot: 'bg-success' },
  warning: { pill: 'bg-warning/[0.08] text-warning ring-warning/25', dot: 'bg-warning' },
  danger: { pill: 'bg-danger/[0.07] text-danger ring-danger/20', dot: 'bg-danger' },
  brand: { pill: 'bg-brand-soft text-brand ring-brand/20', dot: 'bg-brand' },
  muted: { pill: 'bg-ink/[0.04] text-muted ring-ink/10', dot: 'bg-muted/60' }
};

export function StatusBadge({ status, label }: {status: string;label?: string;}) {
  const entry = statusMap[status] ?? { label: status.replace(/_/g, ' '), tone: 'neutral' as Tone };
  const tone = tones[entry.tone];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone.pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden />
      {label ?? entry.label}
    </span>);

}