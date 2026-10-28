import React from 'react';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { serviceCatalogue } from '../../data/serviceCatalogue';
import type { LineItemInput } from '../../types/database';
import { lineGross } from '../../utils/calculations';
import { formatMoney } from '../../utils/format';
import { Input, Select, Textarea } from '../ui/FormControls';

interface LineItemsEditorProps {
  items: LineItemInput[];
  currency: string;
  disabled?: boolean;
  onChange: (index: number, patch: Partial<LineItemInput>) => void;
  onAdd: (item?: Partial<LineItemInput>) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
}

const numberProps = { type: 'number', inputMode: 'decimal' as const, min: 0, step: 'any' };

export function LineItemsEditor({ items, currency, disabled, onChange, onAdd, onRemove, onMove }: LineItemsEditorProps) {
  return (
    <div>
      <ol className="divide-y divide-line rounded-lg border border-line">
        {items.map((item, index) =>
        <li key={index} className="space-y-2.5 p-3.5">
            <div className="flex items-start gap-2">
              <span className="mt-2.5 w-5 shrink-0 text-xs font-medium text-muted tabular">{index + 1}.</span>
              <div className="min-w-0 flex-1 space-y-2">
                <Input
                aria-label={`Item ${index + 1} description`}
                placeholder="Service or product"
                value={item.description}
                onChange={(e) => onChange(index, { description: e.target.value })}
                disabled={disabled}
                className="font-medium" />
              
                <Textarea
                aria-label={`Item ${index + 1} details`}
                placeholder="Details shown under the item (optional)"
                value={item.details}
                onChange={(e) => onChange(index, { details: e.target.value })}
                disabled={disabled}
                className="min-h-[52px] text-[13px]" />
              
              </div>
              <div className="flex shrink-0 flex-col gap-0.5">
                <button type="button" aria-label="Move up" disabled={disabled || index === 0} onClick={() => onMove(index, -1)} className="rounded p-1 text-muted hover:bg-ink/5 hover:text-ink disabled:opacity-30">
                  <ArrowUpIcon className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label="Move down" disabled={disabled || index === items.length - 1} onClick={() => onMove(index, 1)} className="rounded p-1 text-muted hover:bg-ink/5 hover:text-ink disabled:opacity-30">
                  <ArrowDownIcon className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label="Remove item" disabled={disabled || items.length === 1} onClick={() => onRemove(index)} className="rounded p-1 text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-30">
                  <Trash2Icon className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pl-7 sm:grid-cols-[0.7fr_1.2fr_1fr_0.8fr_1.3fr]">
              <label className="text-[11px] font-medium text-muted">
                Qty
                <Input {...numberProps} min={0.01} value={item.quantity} onChange={(e) => onChange(index, { quantity: Number(e.target.value) })} disabled={disabled} className="mt-1 h-9 tabular" />
              </label>
              <label className="text-[11px] font-medium text-muted">
                Unit price
                <Input {...numberProps} value={item.unit_price} onChange={(e) => onChange(index, { unit_price: Number(e.target.value) })} disabled={disabled} className="mt-1 h-9 tabular" />
              </label>
              <label className="text-[11px] font-medium text-muted">
                Discount
                <Input {...numberProps} value={item.discount} onChange={(e) => onChange(index, { discount: Number(e.target.value) })} disabled={disabled} className="mt-1 h-9 tabular" />
              </label>
              <label className="text-[11px] font-medium text-muted">
                Tax %
                <Input {...numberProps} max={100} value={item.tax_rate} onChange={(e) => onChange(index, { tax_rate: Number(e.target.value) })} disabled={disabled} className="mt-1 h-9 tabular" />
              </label>
              <div className="col-span-2 text-[11px] font-medium text-muted sm:col-span-1 sm:text-right">
                Line total
                <p className="mt-1 flex h-9 items-center text-sm font-semibold text-ink tabular sm:justify-end">{formatMoney(lineGross(item), currency)}</p>
              </div>
            </div>
            {Number(item.discount) > lineGross(item) && <p className="pl-7 text-xs text-danger">The discount is larger than the line total.</p>}
          </li>
        )}
      </ol>
      {!disabled &&
      <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
          type="button"
          onClick={() => onAdd()}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-ink/20 px-3 text-[13px] font-medium text-ink/75 transition-colors duration-150 hover:border-brand hover:text-brand">
          
            <PlusIcon className="h-4 w-4" /> Add item
          </button>
          <Select
          aria-label="Add from service catalogue"
          value=""
          onChange={(e) => {
            const service = serviceCatalogue.find((s) => s.id === e.target.value);
            if (service) onAdd({ description: service.name, details: service.details });
          }}
          className="h-9 w-auto text-[13px]">
          
            <option value="">Add from catalogue…</option>
            {serviceCatalogue.map((s) =>
          <option key={s.id} value={s.id}>
                {s.name}
              </option>
          )}
          </Select>
        </div>
      }
    </div>);

}