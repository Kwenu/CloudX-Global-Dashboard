import React from 'react';
import { AlertTriangleIcon, Loader2Icon, RefreshCwIcon } from 'lucide-react';
import { Button } from './Button';

export function LoadingState({ label = 'Loading…' }: {label?: string;}) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted" role="status">
      <Loader2Icon className="h-4 w-4 animate-spin text-brand" aria-hidden />
      {label}
    </div>);

}

export function ErrorState({ message, onRetry }: {message: string;onRetry?: () => void;}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center" role="alert">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-danger/10 text-danger">
        <AlertTriangleIcon className="h-5 w-5" aria-hidden />
      </div>
      <p className="text-sm font-medium text-ink">We couldn’t load this</p>
      <p className="mt-1 max-w-md text-sm text-muted">{message}</p>
      {onRetry &&
      <Button variant="secondary" size="sm" className="mt-4" icon={<RefreshCwIcon className="h-3.5 w-3.5" />} onClick={onRetry}>
          Try again
        </Button>
      }
    </div>);

}

export function SkeletonRows({ rows = 5 }: {rows?: number;}) {
  return (
    <div className="divide-y divide-line" aria-hidden>
      {Array.from({ length: rows }).map((_, i) =>
      <div key={i} className="flex items-center gap-4 px-5 py-4">
          <div className="h-3 w-24 animate-pulse rounded bg-ink/[0.06]" />
          <div className="h-3 flex-1 animate-pulse rounded bg-ink/[0.05]" />
          <div className="h-3 w-20 animate-pulse rounded bg-ink/[0.06]" />
        </div>
      )}
    </div>);

}