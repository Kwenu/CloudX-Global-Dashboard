import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ImageUpIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import type { SettingsSection } from '../../data/settingsSections';
import type { CompanySettings } from '../../types/database';
import { errorMessage } from '../../utils/format';
import { Button } from '../ui/Button';
import { Field, Input, Select, Textarea, Toggle } from '../ui/FormControls';
import { Panel } from '../ui/Panel';

type Value = string | number | boolean | null;

export function SettingsForm({ section }: {section: SettingsSection;}) {
  const { api, can } = useAuth();
  const { settings, reload, logo } = useWorkspace();
  const [draft, setDraft] = useState<Partial<CompanySettings>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const fields = section.fields ?? [];
  const readOnly = !can('settings.write');

  useEffect(() => setDraft({}), [section.id, settings?.updated_at]);

  const dirty = Object.keys(draft).length > 0;
  const value = (key: keyof CompanySettings): Value => key in draft ? draft[key] as Value : (settings?.[key] ?? '') as Value;

  const preview = useMemo(() => {
    if (!settings || section.id !== 'invoice' && section.id !== 'quotation') return null;
    const prefix = String(value(section.id === 'invoice' ? 'invoice_prefix' : 'quotation_prefix'));
    const pad = Number(value('number_padding')) || 4;
    const year = Boolean(value('number_include_year'));
    return [prefix, year ? new Date().getFullYear() : null, '1'.padStart(pad, '0')].filter(Boolean).join('-');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, settings, section.id]);

  if (!settings) return null;

  function set(key: keyof CompanySettings, v: Value) {
    setDraft((d) => {
      const next = { ...d, [key]: v };
      if (settings && settings[key] === v) delete next[key];
      return next;
    });
  }

  async function save() {
    for (const f of fields) {
      if (f.type === 'number') {
        const n = Number(value(f.key));
        if (!Number.isFinite(n) || f.min !== undefined && n < f.min || f.max !== undefined && n > f.max) {
          toast.error(`${f.label} must be between ${f.min} and ${f.max}.`);
          return;
        }
      }
    }
    if ('invoice_prefix' in draft && !String(draft.invoice_prefix).trim()) return void toast.error('The invoice prefix cannot be empty.');
    if ('quotation_prefix' in draft && !String(draft.quotation_prefix).trim()) return void toast.error('The quotation prefix cannot be empty.');
    setSaving(true);
    try {
      await api.updateSettings(draft);
      await reload();
      toast.success(`${section.label} saved`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function upload(file: File) {
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) return void toast.error('Upload a PNG, JPG, WEBP or SVG image.');
    if (file.size > 2 * 1024 * 1024) return void toast.error('The logo must be smaller than 2 MB.');
    setUploading(true);
    try {
      await api.uploadLogo(file);
      await reload();
      toast.success('Logo updated');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-5">
      {section.id === 'company' &&
      <Panel title="Logo" description="Shown at the top-left of every invoice and quotation. The official CloudX logo is used unless you upload another one." bodyClassName="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex h-24 w-48 items-center justify-center rounded-lg border border-line bg-white p-2">
            {logo ? <img src={logo.src} alt="Current document logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted">Loading logo…</span>}
          </div>
          <div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
            <Button variant="secondary" icon={<ImageUpIcon className="h-4 w-4" />} loading={uploading} disabled={readOnly} onClick={() => fileRef.current?.click()}>
              Upload logo
            </Button>
            <p className="mt-2 text-xs text-muted">Optional. Use a PNG with a transparent or white background. Stored privately in Supabase Storage. Max 2 MB.</p>
          </div>
        </Panel>
      }

      <Panel title={section.label} description={section.description} bodyClassName="p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => {
            const id = `s-${String(f.key)}`;
            const v = value(f.key);
            return (
              <Field key={String(f.key)} label={f.type === 'toggle' ? ' ' : f.label} htmlFor={id} hint={f.hint} className={f.wide || f.type === 'textarea' ? f.wide ? 'sm:col-span-2' : '' : ''}>
                {f.type === 'textarea' ?
                <Textarea id={id} value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value)} disabled={readOnly} /> :
                f.type === 'select' ?
                <Select id={id} value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value)} disabled={readOnly}>
                    {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select> :
                f.type === 'toggle' ?
                <div className="flex h-10 items-center"><Toggle id={id} checked={Boolean(v)} onChange={(c) => !readOnly && set(f.key, c)} label={f.label} /></div> :

                <Input
                  id={id}
                  type={f.type === 'number' ? 'number' : f.type}
                  min={f.min}
                  max={f.max}
                  value={String(v ?? '')}
                  onChange={(e) => set(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)}
                  disabled={readOnly} />

                }
              </Field>);

          })}
        </div>
        {preview &&
        <p className="mt-4 text-[13px] text-muted">
            Next numbers look like <span className="font-medium text-ink tabular">{preview}</span>. Existing document numbers never change.
          </p>
        }
        {!readOnly &&
        <div className="mt-5 flex items-center justify-end gap-2 border-t border-line pt-4">
            {dirty && <Button variant="ghost" onClick={() => setDraft({})} disabled={saving}>Discard</Button>}
            <Button onClick={save} loading={saving} disabled={!dirty}>Save changes</Button>
          </div>
        }
        {readOnly && <p className="mt-4 text-xs text-muted">You have read-only access to settings.</p>}
      </Panel>
    </div>);

}