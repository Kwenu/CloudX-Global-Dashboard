import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowLeftIcon,
  ArrowRightLeftIcon,
  BanknoteIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  PencilIcon,
  PrinterIcon,
  SendIcon,
  XIcon } from
'lucide-react';
import { toast } from 'sonner';
import { ActivityFeed } from '../components/activity/ActivityFeed';
import { DocumentPreview } from '../components/documents/DocumentPreview';
import { RecordPaymentModal } from '../components/payments/RecordPaymentModal';
import { Button, buttonStyles } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { PageHeader } from '../components/ui/PageHeader';
import { Panel } from '../components/ui/Panel';
import { RowMenu } from '../components/ui/RowMenu';
import { ErrorState, LoadingState } from '../components/ui/States';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { paymentMethodLabels } from '../data/navigation';
import { useAsync } from '../hooks/useAsync';
import { useDocumentPdf } from '../hooks/useDocumentPdf';
import type { DocumentKind, Invoice, Quotation } from '../types/database';
import { invoiceDisplayStatus, quotationDisplayStatus } from '../utils/calculations';
import { documentPath } from '../utils/documents';
import { errorMessage, formatDate, formatDateTime, formatMoney } from '../utils/format';

type PendingAction =
{type: 'issue';} |
{type: 'cancel';} |
{type: 'convert';} |
{type: 'quote-status';status: 'sent' | 'accepted' | 'rejected' | 'expired' | 'draft';} |
null;

export function DocumentDetailPage({ kind }: {kind: DocumentKind;}) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { api, can } = useAuth();
  const { memberName } = useWorkspace();
  const { pagesFor, download, print } = useDocumentPdf();
  const [pending, setPending] = useState<PendingAction>(null);
  const [working, setWorking] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const { data, loading, error, reload } = useAsync(async () => {
    const doc: Invoice | Quotation | null = kind === 'invoice' ? await api.getInvoice(id) : await api.getQuotation(id);
    if (!doc) throw new Error(`This ${kind} doesn’t exist or you don’t have access to it.`);
    const [clients, payments, activity, linkedInvoice, linkedQuote, plans] = await Promise.all([
    api.listClients(),
    doc.kind === 'invoice' ? api.listPayments().then((p) => p.filter((x) => x.invoice_id === doc.id)) : Promise.resolve([]),
    api.listActivity({ entityId: doc.id, limit: 30 }),
    doc.kind === 'quotation' && doc.converted_invoice_id ? api.getInvoice(doc.converted_invoice_id) : Promise.resolve(null),
    doc.kind === 'invoice' && doc.quotation_id ? api.getQuotation(doc.quotation_id) : Promise.resolve(null),
    doc.kind === 'invoice' && doc.maintenance_plan_id ? api.listPlans() : Promise.resolve([])]
    );
    const client = clients.find((c) => c.id === doc.client_id) ?? null;
    const plan = doc.kind === 'invoice' ? plans.find((p) => p.id === doc.maintenance_plan_id) ?? null : null;
    return { doc, client, payments, activity, linkedInvoice, linkedQuote, plan };
  }, [api, id, kind]);

  const pages = useMemo(() => data ? pagesFor(data.doc, data.client) : [], [data, pagesFor]);

  if (loading && !data) return <LoadingState label={`Loading ${kind}…`} />;
  if (error || !data) return <ErrorState message={error ?? 'Unavailable'} onRetry={reload} />;

  const { doc, client, payments, activity, linkedInvoice, linkedQuote, plan } = data;
  const canWrite = can('documents.write');
  const status = doc.kind === 'invoice' ? invoiceDisplayStatus(doc) : quotationDisplayStatus(doc);
  const locked = doc.kind === 'invoice' ? doc.status === 'paid' || doc.status === 'cancelled' : doc.status === 'converted';

  async function runPending() {
    if (!pending) return;
    setWorking(true);
    try {
      if (pending.type === 'issue') {
        await api.setInvoiceStatus(doc.id, 'issued');
        toast.success(`${doc.number} issued`);
      } else if (pending.type === 'cancel') {
        await api.setInvoiceStatus(doc.id, 'cancelled');
        toast.success(`${doc.number} cancelled`);
      } else if (pending.type === 'quote-status') {
        await api.setQuotationStatus(doc.id, pending.status);
        toast.success(`${doc.number} marked ${pending.status}`);
      } else if (pending.type === 'convert') {
        const invoiceId = await api.convertQuotation(doc.id);
        toast.success('Invoice created from quotation');
        setPending(null);
        navigate(`/invoices/${invoiceId}`);
        return;
      }
      setPending(null);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setWorking(false);
    }
  }

  async function toggleArchive() {
    try {
      await api.setArchived(doc.kind, doc.id, !doc.archived_at);
      toast.success(doc.archived_at ? 'Document restored' : 'Document archived');
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const confirmCopy: Record<string, {title: string;message: string;label: string;tone?: 'danger';}> = {
    issue: { title: `Issue ${doc.number}?`, message: 'The invoice will count towards outstanding balances. You can still edit it until it is paid.', label: 'Issue invoice' },
    cancel: { title: `Cancel ${doc.number}?`, message: 'Cancelled invoices are kept for the audit trail but no longer count towards balances. This cannot be undone.', label: 'Cancel invoice', tone: 'danger' },
    convert: { title: 'Convert to invoice?', message: 'A new draft invoice with the same client and line items will be created and linked. The quotation is kept and locked.', label: 'Create invoice' }
  };
  const confirm = pending ? pending.type === 'quote-status' ? { title: `Mark ${doc.number} as ${pending.status}?`, message: 'The status change is recorded in the document history.', label: 'Confirm' } : confirmCopy[pending.type] : null;

  return (
    <div>
      <PageHeader
        back={
        <Link to={doc.kind === 'invoice' ? '/invoices' : '/quotations'} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
            <ArrowLeftIcon className="h-3.5 w-3.5" /> {doc.kind === 'invoice' ? 'Invoices' : 'Quotations'}
          </Link>
        }
        title={doc.number}
        description={
        <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            {doc.archived_at && <StatusBadge status="archived" />}
            <span>{client?.business_name || client?.name}</span>
            <span aria-hidden>·</span>
            <span>Created by {memberName(doc.created_by)}</span>
          </span>
        }
        actions={
        <>
            <Button variant="secondary" icon={<DownloadIcon className="h-4 w-4" />} onClick={() => download(doc, client)}>
              Download
            </Button>
            <Button variant="secondary" icon={<PrinterIcon className="h-4 w-4" />} onClick={() => print(doc, client)} className="hidden sm:inline-flex">
              Print
            </Button>
            {canWrite && !locked &&
          <Link to={`${documentPath(doc.kind, doc.id)}/edit`} className={buttonStyles('secondary')}>
                <PencilIcon className="h-4 w-4" /> Edit
              </Link>
          }
            {doc.kind === 'invoice' && canWrite && doc.status === 'draft' &&
          <Button icon={<SendIcon className="h-4 w-4" />} onClick={() => setPending({ type: 'issue' })}>Issue</Button>
          }
            {doc.kind === 'invoice' && can('payments.write') && doc.status !== 'cancelled' && doc.balance_due > 0 && doc.status !== 'draft' &&
          <Button icon={<BanknoteIcon className="h-4 w-4" />} onClick={() => setPaymentOpen(true)}>Record payment</Button>
          }
            {doc.kind === 'quotation' && canWrite && doc.status === 'draft' &&
          <Button icon={<SendIcon className="h-4 w-4" />} onClick={() => setPending({ type: 'quote-status', status: 'sent' })}>Mark sent</Button>
          }
            {doc.kind === 'quotation' && canWrite && (doc.status === 'sent' || doc.status === 'expired') &&
          <Button icon={<CheckIcon className="h-4 w-4" />} onClick={() => setPending({ type: 'quote-status', status: 'accepted' })}>Mark accepted</Button>
          }
            {doc.kind === 'quotation' && canWrite && doc.status === 'accepted' && !doc.converted_invoice_id &&
          <Button icon={<ArrowRightLeftIcon className="h-4 w-4" />} onClick={() => setPending({ type: 'convert' })}>Convert to invoice</Button>
          }
            {canWrite &&
          <RowMenu
            items={[
            { label: 'Duplicate', icon: CopyIcon, onSelect: () => navigate(`/${doc.kind === 'invoice' ? 'invoices' : 'quotations'}/new?duplicate=${doc.id}`) },
            { label: 'Record deposit', icon: BanknoteIcon, onSelect: () => setPaymentOpen(true), hidden: !(doc.kind === 'invoice' && doc.status === 'draft' && doc.balance_due > 0 && can('payments.write')) },
            { label: 'Mark rejected', icon: XIcon, onSelect: () => setPending({ type: 'quote-status', status: 'rejected' }), hidden: !(doc.kind === 'quotation' && (doc.status === 'sent' || doc.status === 'accepted')) },
            { label: 'Mark expired', icon: XIcon, onSelect: () => setPending({ type: 'quote-status', status: 'expired' }), hidden: !(doc.kind === 'quotation' && doc.status === 'sent') },
            { label: 'Cancel invoice', icon: XIcon, tone: 'danger', onSelect: () => setPending({ type: 'cancel' }), hidden: !(doc.kind === 'invoice' && doc.status !== 'cancelled' && doc.amount_paid === 0) },
            { label: doc.archived_at ? 'Restore' : 'Archive', icon: doc.archived_at ? ArchiveRestoreIcon : ArchiveIcon, onSelect: () => void toggleArchive() }]
            } />

          }
          </>
        } />
      

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-xl bg-ink/[0.04] p-3 md:p-6">
          <div className="mx-auto max-w-[720px]">
            <DocumentPreview pages={pages} label={doc.number} />
          </div>
        </div>

        <div className="space-y-5">
          <Panel title="Summary" bodyClassName="px-5 py-4">
            {doc.kind === 'invoice' ?
            <div>
                <p className="text-xs text-muted">Balance due</p>
                <p className={`mt-0.5 text-[28px] font-semibold tracking-tight tabular ${doc.balance_due > 0 && status === 'overdue' ? 'text-danger' : 'text-ink'}`}>
                  {formatMoney(doc.balance_due, doc.currency)}
                </p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${doc.total > 0 ? Math.min(100, doc.amount_paid / doc.total * 100) : 0}%` }} />
                </div>
                <dl className="mt-4 space-y-2 text-[13px]">
                  <div className="flex justify-between"><dt className="text-muted">Total</dt><dd className="tabular">{formatMoney(doc.total, doc.currency)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Paid</dt><dd className="tabular">{formatMoney(doc.amount_paid, doc.currency)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Invoice date</dt><dd>{formatDate(doc.issue_date)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Due date</dt><dd>{formatDate(doc.due_date)}</dd></div>
                </dl>
              </div> :

            <div>
                <p className="text-xs text-muted">Quoted total</p>
                <p className="mt-0.5 text-[28px] font-semibold tracking-tight tabular">{formatMoney(doc.total, doc.currency)}</p>
                <dl className="mt-4 space-y-2 text-[13px]">
                  <div className="flex justify-between"><dt className="text-muted">Quotation date</dt><dd>{formatDate(doc.issue_date)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Valid until</dt><dd>{formatDate(doc.valid_until)}</dd></div>
                  {doc.project_title && <div className="flex justify-between gap-4"><dt className="text-muted">Project</dt><dd className="truncate">{doc.project_title}</dd></div>}
                </dl>
              </div>
            }
            {(linkedInvoice || linkedQuote || plan || client) &&
            <div className="mt-4 space-y-1.5 border-t border-line pt-4 text-[13px]">
                {client && <p><span className="text-muted">Client · </span><Link className="font-medium text-brand hover:underline" to={`/clients/${client.id}`}>{client.name}</Link></p>}
                {linkedInvoice && <p><span className="text-muted">Converted to · </span><Link className="font-medium text-brand hover:underline" to={`/invoices/${linkedInvoice.id}`}>{linkedInvoice.number}</Link></p>}
                {linkedQuote && <p><span className="text-muted">From quotation · </span><Link className="font-medium text-brand hover:underline" to={`/quotations/${linkedQuote.id}`}>{linkedQuote.number}</Link></p>}
                {plan && <p><span className="text-muted">Maintenance plan · </span><Link className="font-medium text-brand hover:underline" to={`/maintenance/${plan.id}`}>{plan.project_name}</Link></p>}
              </div>
            }
          </Panel>

          {doc.kind === 'invoice' &&
          <Panel title="Payments" description={`${payments.length} recorded`} bodyClassName="py-1">
              {payments.length === 0 ?
            <p className="px-5 py-5 text-[13px] text-muted">No payments recorded yet.</p> :

            <ul className="divide-y divide-line">
                  {payments.map((p) =>
              <li key={p.id} className="flex items-start justify-between gap-3 px-5 py-3 text-[13px]">
                      <div className="min-w-0">
                        <p className="font-medium">{paymentMethodLabels[p.method]}{p.reference ? ` · ${p.reference}` : ''}</p>
                        <p className="text-xs text-muted">{formatDate(p.payment_date)} · {memberName(p.recorded_by)}</p>
                      </div>
                      <span className="font-semibold tabular">{formatMoney(p.amount, doc.currency)}</span>
                    </li>
              )}
                </ul>
            }
            </Panel>
          }

          <Panel title="History" bodyClassName="px-5 pt-4 pb-1">
            {activity.length === 0 ? <p className="pb-4 text-[13px] text-muted">No history yet.</p> : <ActivityFeed entries={activity} />}
            <p className="pb-3 text-[11px] text-muted">Last updated {formatDateTime(doc.updated_at)}</p>
          </Panel>
        </div>
      </div>

      {confirm &&
      <ConfirmDialog
        open={Boolean(pending)}
        title={confirm.title}
        message={confirm.message}
        confirmLabel={confirm.label}
        tone={confirm.tone ?? 'primary'}
        loading={working}
        onConfirm={() => void runPending()}
        onClose={() => setPending(null)} />

      }
      {doc.kind === 'invoice' &&
      <RecordPaymentModal open={paymentOpen} onClose={() => setPaymentOpen(false)} onRecorded={reload} invoices={[doc]} clients={client ? [client] : []} invoiceId={doc.id} />
      }
    </div>);

}