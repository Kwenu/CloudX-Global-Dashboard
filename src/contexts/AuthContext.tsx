import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { rolePermissions } from '../data/rolePermissions';
import { createLocalApi, PREVIEW_USER_ID, resetPreviewStore } from '../services/localApi';
import { createSupabaseApi } from '../services/supabaseApi';
import { isSupabaseConfigured, supabase } from '../services/supabaseClient';
import type { Api, ApiMode } from '../types/api';
import type { Member, Permission } from '../types/database';
import { errorMessage } from '../utils/format';

type AuthStatus = 'loading' | 'signed_out' | 'no_access' | 'ready';

interface AuthUser {
  id: string;
  email: string;
}

interface AuthValue {
  status: AuthStatus;
  mode: ApiMode | null;
  configured: boolean;
  user: AuthUser | null;
  member: Member | null;
  api: Api;
  accessError: string | null;
  recovery: boolean;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  enterPreview(): void;
  can(permission: Permission): boolean;
  refreshMember(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);
const PREVIEW_KEY = 'cloudx.preview.session';

function friendlyAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'That email and password don’t match a CloudX director account.';
  if (/email not confirmed/i.test(message)) return 'This account hasn’t been confirmed yet. Use the link in your invitation email first.';
  if (/rate limit|too many/i.test(message)) return 'Too many attempts. Please wait a minute and try again.';
  if (/failed to fetch|network/i.test(message)) return 'Couldn’t reach the authentication service. Check your connection and try again.';
  return message;
}

export function AuthProvider({ children }: {children: React.ReactNode;}) {
  const supabaseApi = useMemo(() => isSupabaseConfigured ? createSupabaseApi() : null, []);
  const localApi = useMemo(() => {
    // Without a server connection, start every new session empty so no stale or unsynced records are shown.
    if (!isSupabaseConfigured && !sessionStorage.getItem(PREVIEW_KEY)) resetPreviewStore();
    return createLocalApi();
  }, []);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [mode, setMode] = useState<ApiMode | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(
    () => /type=(recovery|invite)/.test(window.location.hash) || /type=(recovery|invite)/.test(window.location.search)
  );
  const loadedUser = useRef<string | null>(null);

  const loadMembership = useCallback(async (authUser: AuthUser) => {
    if (!supabase) return;
    setAccessError(null);
    try {
      await supabase.rpc('accept_membership');
      const { data, error } = await supabase.
      from('company_members').
      select('company_id, user_id, role, status, created_at, profile:profiles!company_members_user_id_fkey(id, display_name, job_title, email, status)').
      eq('user_id', authUser.id).
      eq('status', 'active').
      maybeSingle();
      if (error) throw error;
      const row = data as (Omit<Member, 'profile'> & {profile: Member['profile'];}) | null;
      if (!row || row.profile?.status === 'disabled') {
        setMember(null);
        setStatus('no_access');
        setAccessError('This account is not an active member of the CloudX Global workspace. Ask an administrator to invite you.');
        return;
      }
      setMember(row);
      setMode('supabase');
      setStatus('ready');
    } catch (e) {
      setStatus('no_access');
      setAccessError(`We couldn’t verify your workspace access: ${errorMessage(e)}`);
    }
  }, []);

  const handleSession = useCallback(
    (session: Session | null) => {
      if (!session?.user) {
        loadedUser.current = null;
        setUser(null);
        setMember(null);
        setMode(null);
        setStatus('signed_out');
        return;
      }
      const authUser = { id: session.user.id, email: session.user.email ?? '' };
      setUser(authUser);
      if (loadedUser.current === authUser.id) return;
      loadedUser.current = authUser.id;
      void loadMembership(authUser);
    },
    [loadMembership]
  );

  useEffect(() => {
    if (!supabase) {
      const storedEmail = sessionStorage.getItem(PREVIEW_KEY);
      if (storedEmail) {
        void localApi.listMembers().then((members) => {
          setUser({ id: PREVIEW_USER_ID, email: storedEmail === '1' ? '' : storedEmail });
          setMember(members[0] ?? null);
          setMode('local');
          setStatus('ready');
        });
      } else {
        setStatus('signed_out');
      }
      return;
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) handleSession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      // Defer to avoid calling Supabase inside the auth callback.
      setTimeout(() => {
        if (active) handleSession(session);
      }, 0);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [handleSession, localApi]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!supabase) {
        // No server connected: open the workspace without company data.
        // Nothing is loaded from or synced to a server; the sidebar shows "Not synced to server".
        if (!password) throw new Error('Enter your email and password.');
        sessionStorage.setItem(PREVIEW_KEY, email.trim());
        const members = await localApi.listMembers();
        setUser({ id: PREVIEW_USER_ID, email: email.trim() });
        setMember(members[0] ?? null);
        setMode('local');
        setStatus('ready');
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new Error(friendlyAuthError(error.message));
    },
    [localApi]
  );

  const signOut = useCallback(async () => {
    if (mode === 'local' || !supabase) {
      sessionStorage.removeItem(PREVIEW_KEY);
      setUser(null);
      setMember(null);
      setMode(null);
      setStatus('signed_out');
      return;
    }
    await supabase.auth.signOut();
    loadedUser.current = null;
    setStatus('signed_out');
  }, [mode]);

  const requestPasswordReset = useCallback(async (email: string) => {
    if (!supabase) throw new Error('Password reset is unavailable right now because the server isn’t connected. Please try again later.');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`
    });
    if (error) throw new Error(friendlyAuthError(error.message));
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (!supabase) throw new Error('Supabase is not configured for this deployment.');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(friendlyAuthError(error.message));
    setRecovery(false);
  }, []);

  const enterPreview = useCallback(() => {
    sessionStorage.setItem(PREVIEW_KEY, '1');
    void localApi.listMembers().then((members) => {
      setUser({ id: PREVIEW_USER_ID, email: 'preview@local' });
      setMember(members[0] ?? null);
      setMode('local');
      setStatus('ready');
    });
  }, [localApi]);

  const refreshMember = useCallback(async () => {
    if (mode === 'local') {
      const members = await localApi.listMembers();
      setMember(members[0] ?? null);
      return;
    }
    if (user) {
      loadedUser.current = null;
      await loadMembership(user);
      loadedUser.current = user.id;
    }
  }, [mode, user, localApi, loadMembership]);

  const can = useCallback(
    (permission: Permission) => member ? rolePermissions[member.role].includes(permission) : false,
    [member]
  );

  const api = mode === 'supabase' && supabaseApi ? supabaseApi : localApi;

  const value: AuthValue = {
    status,
    mode,
    configured: isSupabaseConfigured,
    user,
    member,
    api,
    accessError,
    recovery,
    signIn,
    signOut,
    requestPasswordReset,
    updatePassword,
    enterPreview,
    can,
    refreshMember
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}