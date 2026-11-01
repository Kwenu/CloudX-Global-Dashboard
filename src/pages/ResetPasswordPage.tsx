import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircleIcon, KeyRoundIcon } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/FormControls';
import { useAuth } from '../contexts/AuthContext';

export function ResetPasswordPage() {
  const { updatePassword, status, user } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 10) return setError('Use at least 10 characters.');
    if (password !== confirm) return setError('The passwords don’t match.');
    setBusy(true);
    try {
      await updatePassword(password);
      window.history.replaceState(null, '', '/reset-password');
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the password.');
    } finally {
      setBusy(false);
    }
  }

  const noSession = status !== 'loading' && !user;

  return (
    <div className="flex min-h-screen min-h-dvh w-full items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-[400px] rounded-2xl border border-line bg-surface p-8 shadow-card">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <KeyRoundIcon className="h-5 w-5" aria-hidden />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Set your password</h1>
        <p className="mt-1.5 text-sm text-muted">Choose a password for your CloudX director account.</p>
        {noSession ?
        <div className="mt-6 rounded-lg bg-warning/[0.07] p-3 text-sm text-ink/80">
            This link has expired or was already used. Request a new reset link from the sign-in page.
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => navigate('/login')}>
              Go to sign in
            </Button>
          </div> :

        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <Field label="New password" htmlFor="pw" hint="At least 10 characters.">
              <Input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field label="Confirm password" htmlFor="pw2">
              <Input id="pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>
            {error &&
          <div role="alert" className="flex gap-2 rounded-lg bg-danger/[0.06] px-3 py-2.5 text-[13px] text-danger">
                <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </div>
          }
            <Button type="submit" className="w-full" loading={busy}>
              Save password
            </Button>
          </form>
        }
      </div>
    </div>);

}