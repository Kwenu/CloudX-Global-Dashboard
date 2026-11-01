import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeftIcon, DownloadIcon, EyeIcon, HistoryIcon, LockIcon, PencilIcon, PenLineIcon } from 'lucide-react';
import { toast } from 'sonner';
import { ClientPicker } from '../components/clients/ClientPicker';
import { DocumentPreview } from '../components/documents/DocumentPreview';
import { LineItemsEditor } from '../components/documents/LineItemsEditor';
import { Button } from '../components/ui/Button';
import { Field, Input, Select, Textarea } from '../components/ui/FormControls';
import { PageHeader } from '../components/ui/PageHeader';
import { ErrorState, LoadingState } from '../components/ui/States';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useDocumentEditor } from '../hooks/useDocumentEditor';
import { buildDocumentPages } from '../services/pdf/documentLayout';
import { downloadPdf } from '../services/pdf/renderPdf';
import type { DocumentKind } from '../types/database';
import { buildPdfInput, documentPath } from '../utils/documents';
import { errorMessage, formatMoney } from '../utils/format';

const currencies = ['LKR', 'USD', 'EUR', 'GBP', 'AUD', 'INR'];

function Section({ title, children, hint }: {title: string;hint?: string;children: React.ReactNode;}) {
  return (
    <section className="border-t border-line px-5 py-5 first:border-t-0 md:px-6">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </section>);

}

export function DocumentEditorPage({ kind }: {kind: DocumentKind;}) {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { member, user, can } = useAuth();
  const { settings, members, logo, signatureFor } = useWorkspace();
  const editor = useDocumentEditor({ kind, id, duplicateId: params.get('duplicate'), presetClientId: params.get('client') });
  const [mobileView, setMobileView] = useState<'form' | 'preview'>('form');
  const { form, existing, totals } = editor;
  const isInvoice = kind === 'invoice';
  const noun = isInvoice ? 'invoice' : 'quotation';

  // A new document is signed by the director who is logged in; an existing one keeps its creator's signature.
  const signerId = existing ? existing.created_by : user?.id ?? member?.user_id ?? null;
  const signatory = useMemo(() => {
    const profile = existing ? members.find((m) => m.user_id === existing.created_by)?.profile : member?.profile;
    return { name: profile?.display_name ?? '', title: profile?.job_title ?? '', signature: signatureFor(signerId) };
  }, [existing, members, member, signerId, signatureFor]);

  const pages = useMemo(() => {
    if (!form || !settings) return [];
    const client = editor.clients.find((c) => c.id === form.client_id) ?? null;
    const prefix = isInvoice ? settings.invoice_prefix : settings.quotation_prefix;
    return buildDocumentPages(
      buildPdfInput(
        {
          kind,
          number: existing?.number ?? `${prefix}-DRAFT`,
          issueDate: form.issue_date,
          secondaryDate: form.secondary_date,
          currency: form.currency,
          projectTitle: form.project_title,
          projectDescription: form.project_description,
          scope: form.scope_of_work,
          deliverables: form.deliverables,
          paymentSchedule: form.payment_schedule,
          items: form.items,
          paymentTerms: form.payment_terms,
          additionalCharges: Number(form.additional_charges) || 0,
          amountPaid: existing?.kind === 'invoice' ? existing.amount_paid : 0,
          notes: form.notes,
          terms: form.terms
        },
        client,
        settings,
        signatory,
        logo
      )
    );
  }, [form, settings, editor.clients, existing, kind, isInvoice, signatory, logo]);

  if (editor.loading || !settings) return <LoadingState label={`Loading ${noun}…`} />;
  if (editor.loadError || !form || !totals) return <ErrorState message={editor.loadError ?? 'Unavailable'} onRetry={() => window.location.reload()} />;

  const readOnly = editor.locked || !can('documents.write');
  const title = existing ? `Edit ${existing.number}` : `New ${noun}`;

  async function handleSave(final: boolean) {
    try {
      const saved = await editor.save(final);
      if (!saved) {
        toast.error('Please fix the highlighted fields.');
        return;
      }
      toast.success(existing ? `${saved.number} updated` : `${saved.number} created`);
      navigate(documentPath(kind, saved.id));
    } catch (e) {
      toast.error(errorMessage(e), { description: 'Your input is kept on this device — you can retry.' });
    }
  }

  const finalLabel = isInvoice ?
  existing && existing.status !== 'draft' ?
  'Save changes' :
  'Save & issue' :
  existing && existing.status !== 'draft' ?
  'Save changes' :
  'Save & mark sent';
  const showDraftButton = !existing || existing.status === 'draft';

  return (
    <div>
      <PageHeader
        back={
        <Link to={existing ? documentPath(kind, existing.id) : isInvoice ? '/invoices' : '/quotations'} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
            <ArrowLeftIcon className="h-3.5 w-3.5" /> {existing ? existing.number : isInvoice ? 'Invoices' : 'Quotations'}
          </Link>
        }
        title={title}
        description={
        existing ?
        'Document numbers never change after creation.' :
        `A ${isInvoice ? settings.invoice_prefix : settings.quotation_prefix} number is assigned securely when you save.`
        }
        actions={
        <>
            <Button variant="secondary" icon={<DownloadIcon className="h-4 w-4" />} onClick={() => downloadPdf(pages, existing?.number ?? `${noun}-draft`)}>
              <span className="hidden sm:inline">Download PDF</span>
            </Button>
            {!readOnly && showDraftButton &&
          <Button variant="secondary" loading={editor.saving === 'draft'} disabled={Boolean(editor.saving)} onClick={() => handleSave(false)}>
                Save draft
              </Button>
          }
            {!readOnly &&
          <Button loading={editor.saving === 'final'} disabled={Boolean(editor.saving)} onClick={() => handleSave(true)}>
                {finalLabel}
              </Button>
          }
          </>
        } />
      

      {editor.restored &&
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-brand/20 bg-brand-soft px-4 py-2.5 text-[13px]">
          <HistoryIcon className="h-4 w-4 text-brand" /> Restored unsaved changes from this device.
          <button type="button" onClick={editor.discardDraft} className="font-medium text-brand hover:underline">
            Discard
          </button>
        </div>
      }
      {!readOnly && !signatory.signature && (!existing || existing.created_by === user?.id) &&
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-[13px] text-muted">
          <PenLineIcon className="h-4 w-4 text-brand" /> You haven’t saved your signature yet, so the signature line will be blank.
          <Link to="/settings/access" className="font-medium text-brand hover:underline">Add your signature</Link>
        </div>
      }
      {readOnly &&
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-[13px] text-muted">
          <LockIcon className="h-4 w-4" />
          {editor.locked ? `This ${noun} is locked because it is ${existing?.status.replace('_', ' ')}.` : 'You have read-only access.'}
        </div>
      }

      <div className="mb-4 flex rounded-lg border border-line bg-surface p-1 xl:hidden">
        {(['form', 'preview'] as const).map((v) =>
        <button
          key={v}
          type="button"
          onClick={() => setMobileView(v)}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[13px] font-medium transition-colors duration-150 ${mobileView === v ? 'bg-ink text-on-ink' : 'text-muted'}`}>
          
            {v === 'form' ? <PencilIcon className="h-3.5 w-3.5" /> : <EyeIcon className="h-3.5 w-3.5" />}
            {v === 'form' ? 'Details' : 'Preview'}
          </button>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]">
        <div className={`${mobileView === 'preview' ? 'hidden xl:block' : ''}`}>
          <div className="rounded-xl border border-line bg-surface shadow-card">
            <Section title="Client">
              <ClientPicker
                clients={editor.clients}
                value={form.client_id}
                onChange={(client_id) => editor.update({ client_id })}
                onClientCreated={(c) => editor.setClients((list) => [...list, c].sort((a, b) => a.name.localeCompare(b.name)))}
                disabled={readOnly}
                error={editor.errors.client_id} />
              
            </Section>

            <Section title="Details">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={isInvoice ? 'Invoice date' : 'Quotation date'} htmlFor="issue" required error={editor.errors.issue_date}>
                  <Input id="issue" type="date" value={form.issue_date} onChange={(e) => editor.update({ issue_date: e.target.value })} disabled={readOnly} />
                </Field>
                <Field label={isInvoice ? 'Due date' : 'Valid until'} htmlFor="secondary" required error={editor.errors.secondary_date}>
                  <Input id="secondary" type="date" value={form.secondary_date} onChange={(e) => editor.update({ secondary_date: e.target.value })} disabled={readOnly} />
                </Field>
                <Field label={isInvoice ? 'Project / service reference' : 'Project title'} htmlFor="project">
                  <Input id="project" value={form.project_title} onChange={(e) => editor.update({ project_title: e.target.value })} disabled={readOnly} />
                </Field>
                <Field label="Currency" htmlFor="currency">
                  <Select id="currency" value={form.currency} onChange={(e) => editor.update({ currency: e.target.value })} disabled={readOnly}>
                    {currencies.map((c) =>
                    <option key={c} value={c}>
                        {c === 'LKR' ? 'LKR — Rs.' : c}
                      </option>
                    )}
                  </Select>
                </Field>
                {isInvoice &&
                <Field label="Payment terms" htmlFor="terms-short" className="sm:col-span-2">
                    <Input id="terms-short" value={form.payment_terms} onChange={(e) => editor.update({ payment_terms: e.target.value })} disabled={readOnly} placeholder="e.g. Payment within 30 days" />
                  </Field>
                }
              </div>
            </Section>

            {!isInvoice &&
            <Section title="Project" hint="Shown above the service breakdown on the quotation.">
                <div className="space-y-4">
                  <Field label="Project description" htmlFor="pdesc">
                    <Textarea id="pdesc" value={form.project_description} onChange={(e) => editor.update({ project_description: e.target.value })} disabled={readOnly} />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Scope of work" htmlFor="scope">
                      <Textarea id="scope" value={form.scope_of_work} onChange={(e) => editor.update({ scope_of_work: e.target.value })} disabled={readOnly} />
                    </Field>
                    <Field label="Deliverables" htmlFor="deliv">
                      <Textarea id="deliv" value={form.deliverables} onChange={(e) => editor.update({ deliverables: e.target.value })} disabled={readOnly} />
                    </Field>
                  </div>
                </div>
              </Section>
            }

            <Section title={isInvoice ? 'Line items' : 'Services'}>
              <LineItemsEditor
                items={form.items}
                currency={form.currency}
                disabled={readOnly}
                onChange={editor.updateItem}
                onAdd={editor.addItem}
                onRemove={editor.removeItem}
                onMove={editor.moveItem} />
              
              {editor.errors.items && <p className="mt-2 text-xs text-danger">{editor.errors.items}</p>}

              <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <Field label="Additional charges" htmlFor="charges" className="sm:w-48" error={editor.errors.additional_charges}>
                  <Input id="charges" type="number" min={0} step="any" value={form.additional_charges} onChange={(e) => editor.update({ additional_charges: Number(e.target.value) })} disabled={readOnly} className="tabular" />
                </Field>
                <dl className="w-full space-y-1.5 text-sm sm:w-72">
                  <div className="flex justify-between text-muted"><dt>Subtotal</dt><dd className="tabular">{formatMoney(totals.subtotal, form.currency)}</dd></div>
                  {totals.discount > 0 && <div className="flex justify-between text-muted"><dt>Discounts</dt><dd className="tabular">− {formatMoney(totals.discount, form.currency)}</dd></div>}
                  {totals.tax > 0 && <div className="flex justify-between text-muted"><dt>Tax</dt><dd className="tabular">{formatMoney(totals.tax, form.currency)}</dd></div>}
                  {totals.additionalCharges > 0 && <div className="flex justify-between text-muted"><dt>Additional charges</dt><dd className="tabular">{formatMoney(totals.additionalCharges, form.currency)}</dd></div>}
                  <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><dt>Total</dt><dd className="tabular">{formatMoney(totals.total, form.currency)}</dd></div>
                  {existing?.kind === 'invoice' && existing.amount_paid > 0 &&
                  <>
                      <div className="flex justify-between text-muted"><dt>Payments recorded</dt><dd className="tabular">− {formatMoney(existing.amount_paid, form.currency)}</dd></div>
                      <div className="flex justify-between font-semibold text-brand"><dt>Balance due</dt><dd className="tabular">{formatMoney(Math.max(0, totals.total - existing.amount_paid), form.currency)}</dd></div>
                    </>
                  }
                </dl>
              </div>
            </Section>

            {!isInvoice &&
            <Section title="Payment schedule">
                <Textarea value={form.payment_schedule} onChange={(e) => editor.update({ payment_schedule: e.target.value })} disabled={readOnly} placeholder="e.g. 50% advance on approval, 50% on delivery" aria-label="Payment schedule" />
              </Section>
            }

            <Section title="Notes & terms" hint="Defaults come from Settings and can be edited per document.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Notes" htmlFor="notes">
                  <Textarea id="notes" value={form.notes} onChange={(e) => editor.update({ notes: e.target.value })} disabled={readOnly} />
                </Field>
                <Field label="Terms and conditions" htmlFor="terms">
                  <Textarea id="terms" value={form.terms} onChange={(e) => editor.update({ terms: e.target.value })} disabled={readOnly} />
                </Field>
              </div>
            </Section>
          </div>
        </div>

        <div className={`${mobileView === 'form' ? 'hidden xl:block' : ''}`}>
          <div className="xl:sticky xl:top-24">
            <div className="mb-2 flex items-center justify-between text-xs text-muted">
              <span>Live preview · A4</span>
              <span>{pages.length} page{pages.length === 1 ? '' : 's'}</span>
            </div>
            <div className="max-h-[calc(100vh-140px)] overflow-y-auto rounded-xl bg-ink/[0.04] p-3 md:p-5">
              <DocumentPreview pages={pages} label={`${noun} preview`} />
            </div>
          </div>
        </div>
      </div>
    </div>);

}