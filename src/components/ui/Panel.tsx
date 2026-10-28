import React from 'react';
import { twMerge } from 'tailwind-merge';

interface PanelProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

/** The one surface container used across the app: white, hairline border, soft shadow. */
export function Panel({ title, description, action, className = '', bodyClassName = '', children }: PanelProps) {
  return (
    <section className={twMerge('rounded-xl border border-line bg-surface shadow-card', className)}>
      {(title || action) &&
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          {action}
        </header>
      }
      <div className={bodyClassName}>{children}</div>
    </section>);

}