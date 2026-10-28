import React from 'react';
import type { HealthLevel } from '../../types/database';

export const healthLabels: Record<HealthLevel, string> = {
  connected: 'Connected',
  checking: 'Checking…',
  degraded: 'Partially available',
  failed: 'Connection failed',
  not_configured: 'Not configured'
};

const colors: Record<HealthLevel, string> = {
  connected: 'bg-success',
  checking: 'bg-warning animate-pulse',
  degraded: 'bg-warning',
  failed: 'bg-danger',
  not_configured: 'bg-danger'
};

export function HealthDot({ level, className = '' }: {level: HealthLevel;className?: string;}) {
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${colors[level]} ${className}`} aria-hidden />;
}