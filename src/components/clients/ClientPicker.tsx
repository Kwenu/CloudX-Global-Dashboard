import React, { useState } from 'react';
import { PlusIcon } from 'lucide-react';
import type { Client } from '../../types/database';
import { Field, Select } from '../ui/FormControls';
import { ClientFormModal } from './ClientFormModal';

interface ClientPickerProps {
  clients: Client[];
  value: string;
  onChange: (clientId: string) => void;
  onClientCreated: (client: Client) => void;
  disabled?: boolean;
  error?: string | null;
}

export function ClientPicker({ clients, value, onChange, onClientCreated, disabled, error }: ClientPickerProps) {
  const [adding, setAdding] = useState(false);
  const selected = clients.find((c) => c.id === value) ?? null;

  return (
    <div>
      <div className="flex items-end gap-2">
        <Field label="Client" htmlFor="client" required className="flex-1" error={error}>
          <Select id="client" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
            <option value="">Select a client…</option>
            {clients.map((c) =>
            <option key={c.id} value={c.id}>
                {c.name}
                {c.business_name ? ` — ${c.business_name}` : ''}
              </option>
            )}
          </Select>
        </Field>
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={disabled}
          className="mb-[1px] inline-flex h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-medium text-ink/80 transition-colors duration-150 hover:border-ink/20 hover:text-ink disabled:opacity-50">
          
          <PlusIcon className="h-4 w-4" /> New
        </button>
      </div>

      {selected &&
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 rounded-lg bg-canvas px-3.5 py-3 text-[13px] sm:grid-cols-2">
          {selected.business_name &&
        <div className="flex gap-2">
              <dt className="text-muted">Business</dt>
              <dd className="truncate text-ink">{selected.business_name}</dd>
            </div>
        }
          {selected.email &&
        <div className="flex gap-2">
              <dt className="text-muted">Email</dt>
              <dd className="truncate text-ink">{selected.email}</dd>
            </div>
        }
          {selected.phone &&
        <div className="flex gap-2">
              <dt className="text-muted">Phone</dt>
              <dd className="text-ink">{selected.phone}</dd>
            </div>
        }
          {selected.billing_address &&
        <div className="flex gap-2 sm:col-span-2">
              <dt className="text-muted">Address</dt>
              <dd className="text-ink">{selected.billing_address}</dd>
            </div>
        }
        </dl>
      }

      <ClientFormModal
        open={adding}
        onClose={() => setAdding(false)}
        existing={clients}
        onSaved={(client) => {
          onClientCreated(client);
          onChange(client.id);
        }} />
      
    </div>);

}