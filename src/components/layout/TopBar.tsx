import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { BellIcon, LogOutIcon, MenuIcon, SettingsIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { roleLabels } from '../../data/rolePermissions';
import { formatDate, initials } from '../../utils/format';
import { ThemeToggle } from './ThemeToggle';

export interface AlertItem {
  id: string;
  title: string;
  detail: string;
  to: string;
  tone: 'danger' | 'warning';
}

function useClickOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, close]);
  return ref;
}

const pop = {
  initial: { opacity: 0, scale: 0.96, y: -4 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97 },
  transition: { duration: 0.16, ease: [0.23, 1, 0.32, 1] as const }
};

export function TopBar({ onMenu, alerts }: {onMenu: () => void;alerts: AlertItem[];}) {
  const { member, user, signOut } = useAuth();
  const navigate = useNavigate();
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const alertsRef = useClickOutside(alertsOpen, () => setAlertsOpen(false));
  const userRef = useClickOutside(userOpen, () => setUserOpen(false));
  const name = member?.profile?.display_name || user?.email || 'Director';

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur md:px-8">
      <button
        type="button"
        onClick={onMenu}
        className="rounded-lg p-2 text-ink/70 transition-colors duration-150 hover:bg-ink/5 lg:hidden"
        aria-label="Open navigation">
        
        <MenuIcon className="h-5 w-5" />
      </button>

      <div className="ml-auto flex items-center gap-1.5">
        <span className="mr-1 hidden text-[13px] text-muted md:inline">{formatDate(new Date().toISOString())}</span>
        <ThemeToggle />

        <div className="relative" ref={alertsRef}>
          <button
            type="button"
            onClick={() => setAlertsOpen((o) => !o)}
            className="relative rounded-lg p-2 text-ink/70 transition-colors duration-150 hover:bg-ink/5 hover:text-ink"
            aria-label={`Alerts (${alerts.length})`}
            aria-expanded={alertsOpen}>
            
            <BellIcon className="h-5 w-5" />
            {alerts.length > 0 &&
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white">
                {alerts.length > 9 ? '9+' : alerts.length}
              </span>
            }
          </button>
          <AnimatePresence>
            {alertsOpen &&
            <motion.div {...pop} className="absolute right-0 mt-2 w-80 origin-top-right rounded-xl border border-line bg-surface shadow-pop">
                <div className="border-b border-line px-4 py-3 text-sm font-semibold">Needs attention</div>
                {alerts.length === 0 ?
              <p className="px-4 py-6 text-center text-sm text-muted">Nothing overdue. You’re all caught up.</p> :

              <ul className="max-h-80 overflow-y-auto py-1">
                    {alerts.slice(0, 12).map((a) =>
                <li key={a.id}>
                        <button
                    type="button"
                    onClick={() => {
                      setAlertsOpen(false);
                      navigate(a.to);
                    }}
                    className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-ink/[0.03]">
                    
                          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${a.tone === 'danger' ? 'bg-danger' : 'bg-warning'}`} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-ink">{a.title}</span>
                            <span className="block truncate text-xs text-muted">{a.detail}</span>
                          </span>
                        </button>
                      </li>
                )}
                  </ul>
              }
              </motion.div>
            }
          </AnimatePresence>
        </div>

        <div className="relative" ref={userRef}>
          <button
            type="button"
            onClick={() => setUserOpen((o) => !o)}
            className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition-colors duration-150 hover:bg-ink/5"
            aria-expanded={userOpen}
            aria-label="Account menu">
            
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs font-semibold text-on-ink">{initials(name)}</span>
            <span className="hidden text-left md:block">
              <span className="block max-w-[140px] truncate text-[13px] font-medium leading-tight">{name}</span>
              <span className="block text-[11px] leading-tight text-muted">{member ? roleLabels[member.role] : ''}</span>
            </span>
          </button>
          <AnimatePresence>
            {userOpen &&
            <motion.div {...pop} className="absolute right-0 mt-2 w-56 origin-top-right rounded-xl border border-line bg-surface p-1 shadow-pop">
                <div className="px-3 py-2">
                  <p className="truncate text-sm font-medium">{name}</p>
                  <p className="truncate text-xs text-muted">{user?.email}</p>
                </div>
                <div className="my-1 h-px bg-line" />
                <button
                type="button"
                onClick={() => {
                  setUserOpen(false);
                  navigate('/settings/users');
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink/80 transition-colors duration-150 hover:bg-ink/5">
                
                  <SettingsIcon className="h-4 w-4 opacity-70" /> My profile
                </button>
                <button
                type="button"
                onClick={() => void signOut()}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-danger transition-colors duration-150 hover:bg-danger/5">
                
                  <LogOutIcon className="h-4 w-4" /> Sign out
                </button>
              </motion.div>
            }
          </AnimatePresence>
        </div>
      </div>
    </header>);

}