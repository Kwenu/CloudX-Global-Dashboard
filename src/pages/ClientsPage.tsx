import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PlusIcon, SearchIcon, UsersIcon } from 'lucide-react';
import { ClientFormModal } from '../components/clients/ClientFormModal';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Input, Select } from '../components/ui/FormControls';
import { PageHeader } from '../components/ui/PageHeader';
import { ErrorState, SkeletonRows } from '../components/ui/States';
import { useAuth } from '../contexts/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { isOutstanding } from '../utils/calculations';
import { formatMoney, initials } from '../utils/format';

type Filter = 'all' | 'outstanding' | 'maintenance';

export function ClientsPage() {
  const { api, can } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const adding = params.get('new') === '1';

  const { data, loading, error, reload } = useAsync(
    () => Promise.all([api.listClients(), api.listInvoices(), api.listPlans()]),
    [api]
  );

  const rows = useMemo(() => {
    if (!data) return [];
    const [clients, invoices, plans] = data;
    const q = query.trim().toLowerCase();
    return clients.
    map((c) => {
      const own = invoices.filter((i) => i.client_id === c.id);
      return {
        client: c,
        outstanding: own.filter((i) => isOutstanding(i) && i.currency === 'LKR').reduce((s, i) => s + i.balance_due, 0),
        invoiceCount: own.length,
        activePlans: plans.filter((p) => p.client_id === c.id && p.status === 'active').length
      };
    }).
    filter((r) => {
      if (filter === 'outstanding' && r.outstanding <= 0) return false;
      if (filter === 'maintenance' && r.activePlans === 0) return false;
      if (!q) return true;
      return [r.client.name, r.client.business_name, r.client.email, r.client.phone].join(' ').toLowerCase().includes(q);
    });
  }, [data, query, filter]);

  const closeModal = () => {
    params.delete('new');
    setParams(params, { replace: true });
  };

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Shared client records used across invoices, quotations and maintenance."
        actions={can('clients.write') && <Button icon={<PlusIcon className="h-4 w-4" />} onClick={() => setParams({ new: '1' })}>Add client</Button>} />
      

      <div className="rounded-xl border border-line bg-surface shadow-card">
        <div className="flex flex-col gap-2 border-b border-line p-3 sm:flex-row">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, business, email or phone" className="h-9 pl-9" aria-label="Search clients" />
          </div>
          <Select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="h-9 sm:w-52" aria-label="Filter clients">
            <option value="all">All clients</option>
            <option value="outstanding">With outstanding balance</option>
            <option value="maintenance">With active maintenance</option>
          </Select>
        </div>

        {error ?
        <ErrorState message={error} onRetry={reload} /> :
        loading && !data ?
        <SkeletonRows /> :
        rows.length === 0 ?
        <EmptyState
          icon={UsersIcon}
          title={data?.[0].length ? 'No matching clients' : 'No clients yet'}
          description={data?.[0].length ? 'Try a different search or filter.' : 'Add a client to start creating quotations, invoices and maintenance plans.'}
          action={!data?.[0].length && can('clients.write') ? <Button onClick={() => setParams({ new: '1' })}>Add client</Button> : undefined} /> :


        <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="px-5 py-2.5 font-medium">Client</th>
                  <th className="px-3 py-2.5 font-medium">Contact</th>
                  <th className="px-3 py-2.5 text-right font-medium">Invoices</th>
                  <th className="px-3 py-2.5 text-right font-medium">Active plans</th>
                  <th className="px-5 py-2.5 text-right font-medium">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map(({ client, outstanding, invoiceCount, activePlans }) =>
              <tr key={client.id} onClick={() => navigate(`/clients/${client.id}`)} className="cursor-pointer transition-colors duration-150 hover:bg-ink/[0.02]">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand">{initials(client.name)}</span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{client.name}</p>
                          {client.business_name && <p className="truncate text-xs text-muted">{client.business_name}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-muted">
                      <p className="truncate">{client.email || '—'}</p>
                      {client.phone && <p className="text-xs">{client.phone}</p>}
                    </td>
                    <td className="px-3 py-3 text-right tabular">{invoiceCount}</td>
                    <td className="px-3 py-3 text-right tabular">{activePlans}</td>
                    <td className={`px-5 py-3 text-right font-medium tabular ${outstanding > 0 ? 'text-ink' : 'text-muted'}`}>{formatMoney(outstanding)}</td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>
        }
      </div>

      <ClientFormModal open={adding} onClose={closeModal} existing={data?.[0] ?? []} onSaved={(c) => navigate(`/clients/${c.id}`)} />
    </div>);

}