import React, { useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useAsync } from '../../hooks/useAsync';
import { invoiceDisplayStatus } from '../../utils/calculations';
import { formatDate, formatMoney } from '../../utils/format';
import { scheduleStatus } from '../../utils/maintenance';
import { Sidebar } from './Sidebar';
import { TopBar, type AlertItem } from './TopBar';

export function AppShell() {
  const { api } = useAuth();
  const { settings } = useWorkspace();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data } = useAsync(
    () => Promise.all([api.listInvoices(), api.listPlans(), api.listClients()]),
    [api, location.pathname]
  );

  const alerts = useMemo<AlertItem[]>(() => {
    if (!data) return [];
    const [invoices, plans, clients] = data;
    const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? 'Client';
    const overdue: AlertItem[] = invoices.
    filter((i) => !i.archived_at && invoiceDisplayStatus(i) === 'overdue').
    map((i) => ({
      id: `inv-${i.id}`,
      title: `${i.number} is overdue`,
      detail: `${clientName(i.client_id)} · ${formatMoney(i.balance_due, i.currency)} due ${formatDate(i.due_date)}`,
      to: `/invoices/${i.id}`,
      tone: 'danger'
    }));
    const maintenance: AlertItem[] = plans.
    map((p) => ({ p, s: scheduleStatus(p, settings?.maintenance_due_soon_days ?? 7) })).
    filter(({ s }) => s === 'overdue' || s === 'due').
    map(({ p, s }) => ({
      id: `plan-${p.id}`,
      title: `${p.project_name} maintenance ${s === 'overdue' ? 'overdue' : 'due today'}`,
      detail: `${clientName(p.client_id)} · scheduled ${formatDate(p.next_maintenance_date)}`,
      to: `/maintenance/${p.id}`,
      tone: s === 'overdue' ? 'danger' : 'warning'
    }));
    return [...overdue, ...maintenance];
  }, [data, settings]);

  return (
    <div className="flex min-h-screen w-full bg-canvas">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] lg:block">
        <Sidebar />
      </aside>

      <AnimatePresence>
        {mobileOpen &&
        <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
            className="absolute inset-0 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setMobileOpen(false)} />
          
            <motion.aside
            className="absolute inset-y-0 left-0 w-[260px]"
            initial={{ x: -260 }}
            animate={{ x: 0 }}
            exit={{ x: -260 }}
            transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}>
            
              <Sidebar onNavigate={() => setMobileOpen(false)} />
            </motion.aside>
          </div>
        }
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-[248px]">
        <TopBar onMenu={() => setMobileOpen(true)} alerts={alerts} />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>);

}