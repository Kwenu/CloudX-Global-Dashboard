import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2Icon, ShieldAlertIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { WorkspaceProvider } from '../../contexts/WorkspaceContext';
import { Button } from '../ui/Button';

export function FullScreenLoader({ label = 'Loading CloudX…' }: {label?: string;}) {
  return (
    <div className="flex min-h-screen min-h-dvh w-full items-center justify-center bg-canvas" role="status">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Loader2Icon className="h-4 w-4 animate-spin text-brand" aria-hidden />
        {label}
      </div>
    </div>);

}

export function ProtectedRoute({ children }: {children: React.ReactNode;}) {
  const { status, recovery, accessError, signOut, refreshMember } = useAuth();
  const location = useLocation();

  if (recovery) return <Navigate to="/reset-password" replace />;
  if (status === 'loading') return <FullScreenLoader label="Verifying your session…" />;
  if (status === 'signed_out') return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  if (status === 'no_access') {
    return (
      <div className="flex min-h-screen min-h-dvh w-full items-center justify-center bg-canvas p-6">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-danger/10 text-danger">
            <ShieldAlertIcon className="h-5 w-5" aria-hidden />
          </div>
          <h1 className="text-lg font-semibold">Workspace access required</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">{accessError}</p>
          <div className="mt-6 flex justify-center gap-2">
            <Button variant="secondary" onClick={() => void refreshMember()}>
              Try again
            </Button>
            <Button variant="dark" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </div>);

  }

  return <WorkspaceProvider>{children}</WorkspaceProvider>;
}