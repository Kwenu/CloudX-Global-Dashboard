import React from 'react';
import { Navigate, NavLink, useParams } from 'react-router-dom';
import { AccessPanel } from '../components/settings/AccessPanel';
import { SettingsForm } from '../components/settings/SettingsForm';
import { SystemHealthPanel } from '../components/settings/SystemHealthPanel';
import { PageHeader } from '../components/ui/PageHeader';
import { ErrorState, LoadingState } from '../components/ui/States';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { settingsSections } from '../data/settingsSections';

export function SettingsPage() {
  const { section = 'company' } = useParams();
  const { settings, loading, error, reload } = useWorkspace();
  const current = settingsSections.find((s) => s.id === section);
  if (!current) return <Navigate to="/settings" replace />;

  return (
    <div>
      <PageHeader title="Settings" description="Company details, document defaults, access and system health — shared by all directors." />
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="-mx-1 flex gap-1 overflow-x-auto pb-1 lg:mx-0 lg:flex-col lg:overflow-visible">
          {settingsSections.map((s) =>
          <NavLink
            key={s.id}
            to={s.id === 'company' ? '/settings' : `/settings/${s.id}`}
            end
            className={({ isActive }) =>
            `whitespace-nowrap rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors duration-150 ${
            isActive || s.id === 'company' && section === 'company' ? 'bg-surface text-ink shadow-card ring-1 ring-line' : 'text-muted hover:text-ink'}`

            }>
            
              {s.label}
            </NavLink>
          )}
        </nav>

        <div className="min-w-0 max-w-3xl">
          {current.id === 'system' ?
          <SystemHealthPanel /> :
          current.id === 'access' ?
          <AccessPanel /> :
          loading && !settings ?
          <LoadingState label="Loading settings…" /> :
          error || !settings ?
          <ErrorState message={error ?? 'Settings are unavailable'} onRetry={() => void reload()} /> :

          <SettingsForm section={current} />
          }
        </div>
      </div>
    </div>);

}