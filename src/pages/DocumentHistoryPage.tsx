import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { ActivityFeed } from '../components/activity/ActivityFeed';
import { DocumentLibrary } from '../components/documents/DocumentLibrary';
import { PageHeader } from '../components/ui/PageHeader';
import { Panel } from '../components/ui/Panel';
import { ErrorState, LoadingState } from '../components/ui/States';
import { useAuth } from '../contexts/AuthContext';
import { useAsync } from '../hooks/useAsync';

export function DocumentHistoryPage() {
  const { api } = useAuth();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'audit' ? 'audit' : 'library';
  const audit = useAsync(() => view === 'audit' ? api.listActivity({ limit: 200 }) : Promise.resolve([]), [api, view]);

  return (
    <div>
      <PageHeader
        title="Document History"
        description="Every invoice and quotation, plus a full audit trail of who did what."
        actions={
        <div className="flex rounded-lg border border-line bg-surface p-1">
            {(['library', 'audit'] as const).map((v) =>
          <button
            key={v}
            type="button"
            onClick={() => setParams(v === 'audit' ? { view: 'audit' } : {})}
            className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 ${view === v ? 'bg-ink text-on-ink' : 'text-muted hover:text-ink'}`}>
            
                {v === 'library' ? 'Library' : 'Audit trail'}
              </button>
          )}
          </div>
        } />
      
      {view === 'library' ?
      <DocumentLibrary scope="all" /> :

      <Panel title="Audit trail" description="Most recent 200 actions across the workspace" bodyClassName="px-5 pt-4">
          {audit.loading ?
        <LoadingState /> :
        audit.error ?
        <ErrorState message={audit.error} onRetry={audit.reload} /> :
        (audit.data ?? []).length === 0 ?
        <p className="pb-6 text-[13px] text-muted">No activity yet.</p> :

        <div className="max-w-3xl">
              <ActivityFeed entries={audit.data ?? []} />
            </div>
        }
        </Panel>
      }
    </div>);

}