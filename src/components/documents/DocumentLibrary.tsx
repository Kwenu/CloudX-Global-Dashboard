import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArchiveIcon, ArchiveRestoreIcon, CopyIcon, DownloadIcon, EyeIcon, FileTextIcon, PencilIcon, PrinterIcon, SearchIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentPdf } from '../../hooks/useDocumentPdf';
import type { AnyDocument, Client } from '../../types/database';
import { invoiceDisplayStatus, isOutstanding, quotationDisplayStatus } from '../../utils/calculations';
import { documentPath } from '../../utils/documents';
import { errorMessage, formatDate, formatMoney } from '../../utils/format';
import { buttonStyles } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Input, Select } from '../ui/FormControls';
import { RowMenu } from '../ui/RowMenu';
import { ErrorState, SkeletonRows } from '../ui/States';
import { StatusBadge } from '../ui/StatusBadge';

type Scope = 'invoice' | 'quotation' | 'all';

interface Tab {
  id: string;
  label: string;
  match: (d: AnyDocument, status: string) => boolean;
}

const notArchived = (d: AnyDocument) => !d.archived_at;

const tabsByScope: Record<Scope, Tab[]> = {
  invoice: [
  { id: 'all', label: 'All', match: notArchived },
  { id: 'draft', label: 'Drafts', match: (d, s) => notArchived(d) && s === 'draft' },
  { id: 'outstanding', label: 'Outstanding', match: (d, s) => notArchived(d) && d.kind === 'invoice' && isOutstanding(d) && s !== 'overdue' },
  { id: 'overdue', label: 'Overdue', match: (d, s) => notArchived(d) && s === 'overdue' },
  { id: 'paid', label: 'Paid', match: (d, s) => notArchived(d) && s === 'paid' },
  { id: 'cancelled', label: 'Cancelled', match: (d, s) => notArchived(d) && s === 'cancelled' },
  { id: 'archived', label: 'Archived', match: (d) => Boolean(d.archived_at) }],

  quotation: [
  { id: 'all', label: 'All', match: notArchived },
  { id: 'draft', label: 'Drafts', match: (d, s) => notArchived(d) && s === 'draft' },
  { id: 'sent', label: 'Awaiting decision', match: (d, s) => notArchived(d) && s === 'sent' },
  { id: 'accepted', label: 'Accepted', match: (d, s) => notArchived(d) && s === 'accepted' },
  { id: 'converted', label: 'Converted', match: (d, s) => notArchived(d) && s === 'converted' },
  { id: 'closed', label: 'Rejected / expired', match: (d, s) => notArchived(d) && (s === 'rejected' || s === 'expired') },
  { id: 'archived', label: 'Archived', match: (d) => Boolean(d.archived_at) }],

  all: [
  { id: 'all', label: 'All documents', match: notArchived },
  { id: 'invoices', label: 'Invoices', match: (d) => notArchived(d) && d.kind === 'invoice' },
  { id: 'quotations', label: 'Quotations', match: (d) => notArchived(d) && d.kind === 'quotation' },
  { id: 'drafts', label: 'Drafts', match: (d, s) => notArchived(d) && s === 'draft' },
  { id: 'issued', label: 'Issued', match: (d, s) => notArchived(d) && s !== 'draft' && s !== 'cancelled' },
  { id: 'paid', label: 'Paid', match: (d, s) => notArchived(d) && s === 'paid' },
  { id: 'outstanding', label: 'Outstanding', match: (d) => notArchived(d) && d.kind === 'invoice' && isOutstanding(d) },
  { id: 'overdue', label: 'Overdue', match: (d, s) => notArchived(d) && s === 'overdue' },
  { id: 'accepted', label: 'Accepted quotations', match: (d, s) => notArchived(d) && s === 'accepted' },
  { id: 'archived', label: 'Archived', match: (d) => Boolean(d.archived_at) }]

};

function displayStatus(d: AnyDocument): string {
  return d.kind === 'invoice' ? invoiceDisplayStatus(d) : quotationDisplayStatus(d);
}

export function DocumentLibrary({ scope, initialTab }: {scope: Scope;initialTab?: string;}) {
  const { api, can } = useAuth();
  const navigate = useNavigate();
  const { download, print } = useDocumentPdf();
  const [tab, setTab] = useState(initialTab ?? 'all');
  const [query, setQuery] = useState('');
  const [clientId, setClientId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data, loading, error, reload } = useAsync(async () => {
    const [invoices, quotations, clients] = await Promise.all([
    scope === 'quotation' ? Promise.resolve([]) : api.listInvoices(),
    scope === 'invoice' ? Promise.resolve([]) : api.listQuotations(),
    api.listClients()]
    );
    const docs: AnyDocument[] = [...invoices, ...quotations].sort((a, b) => b.issue_date.localeCompare(a.issue_date) || b.created_at.localeCompare(a.created_at));
    return { docs, clients };
  }, [api, scope]);

  const clientMap = useMemo(() => new Map<string, Client>((data?.clients ?? []).map((c) => [c.id, c])), [data]);
  const tabs = tabsByScope[scope];
  const activeTab = tabs.find((t) => t.id === tab) ?? tabs[0];

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const t of tabs) out[t.id] = (data?.docs ?? []).filter((d) => t.match(d, displayStatus(d))).length;
    return out;
  }, [data, tabs]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.docs ?? []).filter((d) => {
      if (!activeTab.match(d, displayStatus(d))) return false;
      if (clientId && d.client_id !== clientId) return false;
      if (from && d.issue_date < from) return false;
      if (to && d.issue_date > to) return false;
      if (!q) return true;
      const client = clientMap.get(d.client_id);
      const project = d.kind === 'invoice' ? d.project_reference : d.project_title;
      const haystack = [d.number, client?.name, client?.business_name, project, ...d.items.map((i) => `${i.description} ${i.details}`)].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [data, activeTab, query, clientId, from, to, clientMap]);

  async function toggleArchive(d: AnyDocument) {
    try {
      await api.setArchived(d.kind, d.id, !d.archived_at);
      toast.success(d.archived_at ? `${d.number} restored` : `${d.number} archived`);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const showBalance = scope !== 'quotation';
  const filtersActive = Boolean(query || clientId || from || to);

  return (
    <div className="rounded-xl border border-line bg-surface shadow-card">
      <div className="overflow-x-auto border-b border-line px-3">
        <div className="flex min-w-max gap-1" role="tablist">
          {tabs.map((t) =>
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === activeTab.id}
            onClick={() => setTab(t.id)}
            className={`relative flex items-center gap-1.5 whitespace-nowrap px-3 py-3 text-[13px] font-medium transition-colors duration-150 ${t.id === activeTab.id ? 'text-ink' : 'text-muted hover:text-ink'}`}>
            
              {t.label}
              <span className={`rounded-full px-1.5 text-[11px] tabular ${t.id === activeTab.id ? 'bg-brand-soft text-brand' : 'bg-ink/5 text-muted'}`}>{counts[t.id] ?? 0}</span>
              {t.id === activeTab.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-b border-line p-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search number, client, project or description" className="h-9 pl-9" aria-label="Search documents" />
        </div>
        <div className="grid grid-cols-3 gap-2 md:flex">
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)} className="h-9 md:w-44" aria-label="Filter by client">
            <option value="">All clients</option>
            {(data?.clients ?? []).map((c) =>
            <option key={c.id} value={c.id}>{c.name}</option>
            )}
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 md:w-36" aria-label="From date" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 md:w-36" aria-label="To date" />
        </div>
      </div>

      {error ?
      <ErrorState message={error} onRetry={reload} /> :
      loading && !data ?
      <SkeletonRows /> :
      rows.length === 0 ?
      <EmptyState
        icon={FileTextIcon}
        title={filtersActive ? 'No matching documents' : activeTab.id === 'all' ? `No ${scope === 'all' ? 'documents' : `${scope}s`} yet` : 'Nothing here'}
        description={filtersActive ? 'Try a different search or clear the filters.' : 'Documents you create will appear here with their status and balance.'}
        action={
        !filtersActive && scope !== 'all' && activeTab.id === 'all' && can('documents.write') ?
        <button type="button" onClick={() => navigate(scope === 'invoice' ? '/invoices/new' : '/quotations/new')} className={buttonStyles('primary')}>
                Create {scope}
              </button> :
        undefined
        } /> :


      <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs font-medium text-muted">
                <th className="px-5 py-2.5 font-medium">Number</th>
                <th className="px-3 py-2.5 font-medium">Client</th>
                <th className="px-3 py-2.5 font-medium">Project</th>
                <th className="px-3 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 font-medium">{scope === 'quotation' ? 'Valid until' : scope === 'invoice' ? 'Due' : 'Due / valid'}</th>
                <th className="px-3 py-2.5 text-right font-medium">Total</th>
                {showBalance && <th className="px-3 py-2.5 text-right font-medium">Balance</th>}
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="w-12 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((d) => {
              const client = clientMap.get(d.client_id) ?? null;
              const status = displayStatus(d);
              const locked = d.kind === 'invoice' ? d.status === 'paid' || d.status === 'cancelled' : d.status === 'converted';
              return (
                <tr key={d.id} onClick={() => navigate(documentPath(d.kind, d.id))} className="cursor-pointer transition-colors duration-150 hover:bg-ink/[0.02]">
                    <td className="px-5 py-3">
                      <span className="font-medium text-ink tabular">{d.number}</span>
                      {scope === 'all' && <span className="ml-2 text-xs capitalize text-muted">{d.kind}</span>}
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-3 text-ink/80">{client?.business_name || client?.name || '—'}</td>
                    <td className="max-w-[200px] truncate px-3 py-3 text-muted">{(d.kind === 'invoice' ? d.project_reference : d.project_title) || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted">{formatDate(d.issue_date)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted">{formatDate(d.kind === 'invoice' ? d.due_date : d.valid_until)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular">{formatMoney(d.total, d.currency)}</td>
                    {showBalance &&
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular text-ink/80">{d.kind === 'invoice' ? formatMoney(d.balance_due, d.currency) : '—'}</td>
                  }
                    <td className="px-3 py-3">
                      <StatusBadge status={d.archived_at ? 'archived' : status} />
                    </td>
                    <td className="px-3 py-3">
                      <RowMenu
                      items={[
                      { label: 'View', icon: EyeIcon, onSelect: () => navigate(documentPath(d.kind, d.id)) },
                      { label: 'Edit', icon: PencilIcon, onSelect: () => navigate(`${documentPath(d.kind, d.id)}/edit`), hidden: locked || !can('documents.write') },
                      { label: 'Download PDF', icon: DownloadIcon, onSelect: () => download(d, client) },
                      { label: 'Print', icon: PrinterIcon, onSelect: () => print(d, client) },
                      { label: 'Duplicate', icon: CopyIcon, onSelect: () => navigate(`/${d.kind === 'invoice' ? 'invoices' : 'quotations'}/new?duplicate=${d.id}`), hidden: !can('documents.write') },
                      { label: d.archived_at ? 'Restore' : 'Archive', icon: d.archived_at ? ArchiveRestoreIcon : ArchiveIcon, onSelect: () => void toggleArchive(d), hidden: !can('documents.write') }]
                      } />
                    
                    </td>
                  </tr>);

            })}
            </tbody>
          </table>
        </div>
      }
    </div>);

}