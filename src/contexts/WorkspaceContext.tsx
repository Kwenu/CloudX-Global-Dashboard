import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { brandAssets } from '../data/brand';
import type { CompanySettings, HealthResult, Member } from '../types/database';
import { errorMessage } from '../utils/format';
import { useAuth } from './AuthContext';

export interface HealthState extends HealthResult {
  checking: boolean;
  lastSuccessAt: string | null;
}

export interface ImageAsset {
  src: string;
  aspect: number;
}

interface WorkspaceValue {
  settings: CompanySettings | null;
  members: Member[];
  loading: boolean;
  error: string | null;
  /** The logo printed on invoices and quotations: the uploaded one, otherwise the official CloudX logo. */
  logo: ImageAsset | null;
  reload(): Promise<void>;
  memberName(id: string | null | undefined): string;
  /** The saved signature of a director, or null when they have not added one yet. */
  signatureFor(id: string | null | undefined): ImageAsset | null;
  health: HealthState;
  runHealthCheck(): Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);
const LAST_SUCCESS_KEY = 'cloudx.health.lastSuccess';

function loadImageAspect(src: string): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 3);
    img.onerror = () => resolve(3);
    img.src = src;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

let defaultLogoPromise: Promise<ImageAsset | null> | null = null;

/** The official logo that ships with the app (public/Logo-document.png), as a data URL for the PDF. */
function loadDefaultLogo(): Promise<ImageAsset | null> {
  if (!defaultLogoPromise) {
    defaultLogoPromise = (async () => {
      try {
        const res = await fetch(brandAssets.logoDocument);
        if (!res.ok) return null;
        const src = await blobToDataUrl(await res.blob());
        return { src, aspect: await loadImageAspect(src) };
      } catch {
        return null;
      }
    })();
    void defaultLogoPromise.then((v) => {
      if (!v) defaultLogoPromise = null;
    });
  }
  return defaultLogoPromise;
}

export function WorkspaceProvider({ children }: {children: React.ReactNode;}) {
  const { api, mode } = useAuth();
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logo, setLogo] = useState<ImageAsset | null>(null);
  const [signatures, setSignatures] = useState<Record<string, ImageAsset>>({});
  const signatureCache = useRef(new Map<string, ImageAsset | null>());
  const [health, setHealth] = useState<HealthState>({
    overall: 'checking',
    database: 'checking',
    auth: 'checking',
    checkedAt: '',
    latencyMs: null,
    error: null,
    checking: true,
    lastSuccessAt: localStorage.getItem(LAST_SUCCESS_KEY)
  });
  const checkingRef = useRef(false);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [s, m] = await Promise.all([api.getSettings(), api.listMembers()]);
      setSettings(s);
      setMembers(m);
      const dataUrl = await api.getLogoDataUrl(s).catch(() => null);
      setLogo(dataUrl ? { src: dataUrl, aspect: await loadImageAspect(dataUrl) } : await loadDefaultLogo());

      // Load each director's saved signature (cached per file, so only new or changed ones are downloaded).
      const next: Record<string, ImageAsset> = {};
      await Promise.all(
        m.map(async (member) => {
          const path = member.profile?.signature_path;
          if (!path) return;
          let asset = signatureCache.current.get(path);
          if (asset === undefined) {
            const url = await api.getSignatureDataUrl(path).catch(() => null);
            asset = url ? { src: url, aspect: await loadImageAspect(url) } : null;
            if (asset) signatureCache.current.set(path, asset);
          }
          if (asset) next[member.user_id] = asset;
        })
      );
      setSignatures(next);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [api]);

  const runHealthCheck = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setHealth((h) => ({ ...h, checking: true }));
    try {
      const result = await api.healthCheck();
      const lastSuccessAt = result.overall === 'connected' ? result.checkedAt : localStorage.getItem(LAST_SUCCESS_KEY);
      if (result.overall === 'connected') localStorage.setItem(LAST_SUCCESS_KEY, result.checkedAt);
      setHealth({ ...result, checking: false, lastSuccessAt });
    } catch (e) {
      setHealth((h) => ({
        ...h,
        overall: 'failed',
        checking: false,
        checkedAt: new Date().toISOString(),
        error: errorMessage(e)
      }));
    } finally {
      checkingRef.current = false;
    }
  }, [api]);

  useEffect(() => {
    setLoading(true);
    void reload();
    void runHealthCheck();
    const interval = window.setInterval(() => void runHealthCheck(), 60_000);
    const onOnline = () => void runHealthCheck();
    window.addEventListener('online', onOnline);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', onOnline);
    };
  }, [reload, runHealthCheck, mode]);

  const memberName = useCallback(
    (id: string | null | undefined) => {
      if (!id) return 'System';
      const m = members.find((x) => x.user_id === id);
      return m?.profile?.display_name || m?.profile?.email || 'Former member';
    },
    [members]
  );

  const signatureFor = useCallback(
    (id: string | null | undefined) => id ? signatures[id] ?? null : null,
    [signatures]
  );

  return (
    <WorkspaceContext.Provider value={{ settings, members, loading, error, logo, reload, memberName, signatureFor, health, runHealthCheck }}>
      {children}
    </WorkspaceContext.Provider>);

}

export function useWorkspace(): WorkspaceValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return ctx;
}