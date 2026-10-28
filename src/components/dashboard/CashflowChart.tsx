import React, { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { format, parseISO, startOfMonth, subMonths } from 'date-fns';
import type { Invoice, Payment } from '../../types/database';
import { formatCompactMoney, formatMoney } from '../../utils/format';

/** Last six months: amounts invoiced (issued, not cancelled) vs payments received. LKR only. */
export function CashflowChart({ invoices, payments }: {invoices: Invoice[];payments: Payment[];}) {
  const data = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => startOfMonth(subMonths(new Date(), 5 - i)));
    return months.map((m) => {
      const key = format(m, 'yyyy-MM');
      const invoiced = invoices.
      filter((i) => i.currency === 'LKR' && i.status !== 'draft' && i.status !== 'cancelled' && i.issue_date.startsWith(key)).
      reduce((s, i) => s + i.total, 0);
      const received = payments.filter((p) => p.payment_date.startsWith(key)).reduce((s, p) => s + p.amount, 0);
      return { month: format(m, 'MMM'), invoiced, received };
    });
  }, [invoices, payments]);

  const hasData = data.some((d) => d.invoiced || d.received);

  return (
    <div className="h-[180px] w-full">
      {hasData ?
      <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={3} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }} />
            <YAxis tickLine={false} axisLine={false} width={64} tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }} tickFormatter={(v: number) => formatCompactMoney(v)} />
            <Tooltip
            cursor={{ fill: 'rgba(17,17,22,0.03)' }}
            contentStyle={{ borderRadius: 10, border: '1px solid rgb(var(--line))', fontSize: 12, boxShadow: '0 8px 24px -8px rgba(0,0,0,0.15)' }}
            formatter={(value: number, name: string) => [formatMoney(value), name === 'invoiced' ? 'Invoiced' : 'Received']} />
          
            <Bar dataKey="invoiced" fill="rgb(var(--ink))" radius={[3, 3, 0, 0]} maxBarSize={18} />
            <Bar dataKey="received" fill="rgb(var(--brand))" radius={[3, 3, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer> :

      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-line text-[13px] text-muted">
          Monthly invoicing and payments will chart here.
        </div>
      }
    </div>);

}