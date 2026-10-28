import React from 'react';
import { RefreshCwIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { supabaseHost } from '../../services/supabaseClient';
import type { HealthLevel } from '../../types/database';
import { formatDateTime } from '../../utils/format';
import { HealthDot, healthLabels } from '../layout/HealthDot';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';

const tone: Record<HealthLevel, string> = {
  connected: 'text-success',
  checking: 'text-warning',
  degraded: 'text-warning',
  failed: 'text-danger',
  not_configured: 'text-danger'
};

export function SystemHealthPanel() {
  const { mode, configured } = useAuth();
  const { health, runHealthCheck } = useWorkspace();
  const overall: HealthLevel = health.checking ? 'checking' : health.overall;

  const rows: {label: string;level: HealthLevel;detail: string;}[] = [
  { label: 'Database', level: health.checking ? 'checking' : health.database, detail: 'Authenticated query against the workspace health function' },
  { label: 'Authentication', level: health.checking ? 'checking' : health.auth, detail: 'Supabase Auth health endpoint and current session' }];


  return (
    <div className="space-y-5">
      <Panel bodyClassName="p-5 md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs text-muted">Overall connection</p>
            <p className={`mt-1 flex items-center gap-2 text-xl font-semibold ${tone[overall]}`}>
              <HealthDot level={overall} className="h-2.5 w-2.5" /> {healthLabels[overall]}
            </p>
            <p className="mt-1 text-[13px] text-muted">
              {mode === 'local' ?
              'Local preview mode — no backend is connected and data stays in this browser.' :
              configured ?
              `Project ${supabaseHost() || 'configured'}${health.latencyMs !== null ? ` · ${health.latencyMs} ms` : ''}` :
              'Supabase environment variables are not set for this deployment.'}
            </p>
          </div>
          <Button variant="secondary" icon={<RefreshCwIcon className={`h-4 w-4 ${health.checking ? 'animate-spin' : ''}`} />} onClick={() => void runHealthCheck()} disabled={health.checking}>
            Retry connection
          </Button>
        </div>

        <dl className="mt-6 grid gap-4 border-t border-line pt-5 text-[13px] sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">Last check</dt>
            <dd className="mt-0.5">{health.checkedAt ? formatDateTime(health.checkedAt) : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Last successful check</dt>
            <dd className="mt-0.5">{health.lastSuccessAt ? formatDateTime(health.lastSuccessAt) : 'Never'}</dd>
          </div>
        </dl>
        {health.error &&
        <div role="alert" className="mt-4 rounded-lg bg-danger/[0.06] px-3.5 py-2.5 text-[13px] text-danger">
            <span className="font-medium">Last error: </span>
            {health.error}
          </div>
        }
      </Panel>

      <Panel title="Services" bodyClassName="py-1">
        <ul className="divide-y divide-line">
          {rows.map((r) =>
          <li key={r.label} className="flex items-center justify-between gap-4 px-5 py-3.5">
              <div>
                <p className="text-sm font-medium">{r.label}</p>
                <p className="text-xs text-muted">{r.detail}</p>
              </div>
              <span className={`flex items-center gap-2 whitespace-nowrap text-[13px] font-medium ${tone[r.level]}`}>
                <HealthDot level={r.level} /> {healthLabels[r.level]}
              </span>
            </li>
          )}
        </ul>
      </Panel>

      <p className="text-xs leading-relaxed text-muted">
        Connection credentials are configured at deployment time (<code className="rounded bg-ink/5 px-1">VITE_SUPABASE_URL</code>,{' '}
        <code className="rounded bg-ink/5 px-1">VITE_SUPABASE_ANON_KEY</code>) and cannot be edited here. Privileged keys live only in Supabase Edge Function secrets. A
        failed check never signs you out; unsaved document input is kept on this device.
      </p>
    </div>);

}