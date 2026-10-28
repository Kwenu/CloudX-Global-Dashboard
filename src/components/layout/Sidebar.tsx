import React from 'react';
import { NavLink } from 'react-router-dom';
import { RefreshCwIcon } from 'lucide-react';
import { brandAssets } from '../../data/brand';
import { navigation } from '../../data/navigation';
import { roleLabels } from '../../data/rolePermissions';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import type { HealthLevel } from '../../types/database';
import { formatRelative, initials } from '../../utils/format';
import { HealthDot } from './HealthDot';

function SyncStatus() {
  const { mode } = useAuth();
  const { health, runHealthCheck } = useWorkspace();

  let level: HealthLevel;
  let title: string;
  let detail: string;
  if (mode === 'local') {
    level = 'not_configured';
    title = 'Not synced to server';
    detail = 'The server isn’t connected, so company data can’t be loaded or shared.';
  } else if (health.checking && health.overall === 'checking') {
    level = 'checking';
    title = 'Checking connection…';
    detail = 'Verifying the CloudX server.';
  } else if (health.overall === 'connected') {
    level = 'connected';
    title = 'Synced with server';
    detail = health.checkedAt ? `Checked ${formatRelative(health.checkedAt)}` : 'All changes are saved to the server.';
  } else if (health.overall === 'degraded') {
    level = 'degraded';
    title = 'Sync partially available';
    detail = 'Some server services are temporarily unavailable.';
  } else {
    level = 'failed';
    title = 'Sync paused';
    detail = 'Can’t reach the server. You’re still signed in and unsaved input is kept.';
  }

  return (
    <div className="mb-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5" role="status">
      <div className="flex items-center gap-2">
        <HealthDot level={level} />
        <p className="flex-1 truncate text-[12.5px] font-medium text-white/90">{title}</p>
        {mode !== 'local' && level !== 'connected' &&
        <button
          type="button"
          onClick={() => void runHealthCheck()}
          disabled={health.checking}
          className="rounded p-0.5 text-white/55 transition-colors duration-150 hover:text-white disabled:opacity-50"
          aria-label="Retry connection">
          
            <RefreshCwIcon className={`h-3.5 w-3.5 ${health.checking ? 'animate-spin' : ''}`} />
          </button>
        }
      </div>
      <p className="mt-1 text-[11.5px] leading-snug text-white/50">{detail}</p>
    </div>);

}

export function Sidebar({ onNavigate }: {onNavigate?: () => void;}) {
  const { member } = useAuth();
  const name = member?.profile?.display_name || member?.profile?.email || 'Director';

  return (
    <div className="flex h-full flex-col bg-sidebar text-white">
      <div className="flex justify-center px-5 pb-1 pt-3">
        <img src={brandAssets.logoOnDark} alt="CloudX Global (Pvt) Ltd" className="h-[132px] w-[132px] object-contain" />
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2" aria-label="Main">
        {navigation.map((item) =>
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          onClick={onNavigate}
          className={({ isActive }) =>
          `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors duration-150 ${
          isActive ? 'bg-white/[0.08] text-white' : 'text-white/60 hover:bg-white/[0.05] hover:text-white'}`

          }>
          
            {({ isActive }) =>
          <>
                {isActive && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-[#B048D8]" aria-hidden />}
                <item.icon className={`h-[18px] w-[18px] ${isActive ? 'text-[#C46BE8]' : 'text-white/45 group-hover:text-white/80'}`} aria-hidden />
                {item.label}
              </>
          }
          </NavLink>
        )}
      </nav>

      <div className="border-t border-white/[0.08] p-3">
        <SyncStatus />
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#941CB8] text-xs font-semibold text-white">
            {initials(name)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">{name}</p>
            <p className="truncate text-[11.5px] text-white/50">{member ? roleLabels[member.role] : ''}</p>
          </div>
        </div>
      </div>
    </div>);

}