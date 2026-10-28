import React, { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircleIcon, ArrowLeftIcon, EyeIcon, EyeOffIcon, MailCheckIcon } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/FormControls';
import { useAuth } from '../contexts/AuthContext';
import { brandAssets } from '../data/brand';

type View = 'signin' | 'forgot' | 'sent';

const fade = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: { duration: 0.18 } };

export function LoginPage() {
  const { status, signIn, requestPasswordReset } = useAuth();
  const location = useLocation();
  const [view, setView] = useState<View>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'ready') {
    const from = (location.state as {from?: string;} | null)?.from ?? '/';
    return <Navigate to={from} replace />;
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError('Enter the email address for your director account.');
      return;
    }
    setBusy(true);
    try {
      await requestPasswordReset(email);
      setView('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the reset email.');
    } finally {
      setBusy(false);
    }
  }

  const verifying = status === 'loading' || busy && view === 'signin';

  const errorBox = error &&
  <div role="alert" className="flex gap-2 rounded-lg bg-danger/10 px-3 py-2.5 text-[13px] text-danger">
      <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" /> {error}
    </div>;


  return (
    // The login screen is always black: the `dark` class scopes the dark tokens to this subtree.
    <div className="dark flex min-h-screen w-full flex-col bg-black text-ink">
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-10 px-6 py-10 lg:flex-row lg:gap-20">
        {/* Brand */}
        <section className="flex flex-col items-center text-center lg:flex-1">
          <img
            src={brandAssets.logoOnDark}
            alt="CloudX Global (Pvt) Ltd"
            className="h-[220px] w-[220px] object-contain sm:h-[280px] sm:w-[280px] lg:h-[360px] lg:w-[360px]" />
          
          <p className="-mt-4 hidden max-w-sm text-[15px] leading-relaxed text-white/55 lg:block">
            Invoices, Quotations and Maintenance - One Shared Workspace for the CloudX Directors.
          </p>
        </section>

        {/* Form */}
        <section className="w-full max-w-[400px] rounded-2xl border border-white/10 bg-[#0E0E12] p-7 sm:p-8">
          <AnimatePresence mode="wait" initial={false}>
            {view === 'signin' &&
            <motion.div key="signin" {...fade}>
                <h1 className="text-2xl font-semibold tracking-tight text-white">Director Sign In</h1>
                <p className="mt-1.5 text-sm text-white/55">Use the account your administrator created for you.</p>

                <form onSubmit={handleSignIn} className="mt-7 space-y-4" noValidate>
                  <Field label="Email" htmlFor="email">
                    <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@cloudxglobal.com" />
                  </Field>
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label htmlFor="password" className="text-[13px] font-medium text-ink/80">Password</label>
                      <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setView('forgot');
                      }}
                      className="text-[13px] font-medium text-brand-strong underline-offset-2 hover:underline">
                      
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pr-10" />
                    
                      <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted transition-colors duration-150 hover:text-ink"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}>
                      
                        {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  {errorBox}
                  <Button type="submit" className="w-full bg-[#941CB8] text-white hover:bg-[#A72FCB]" loading={verifying}>
                    {verifying ? 'Verifying…' : 'Sign in'}
                  </Button>
                </form>
                <p className="mt-6 text-xs leading-relaxed text-white/40">
                  There’s no public registration. New directors are invited by a workspace administrator.
                </p>
              </motion.div>
            }

            {view === 'forgot' &&
            <motion.div key="forgot" {...fade}>
                <button type="button" onClick={() => setView('signin')} className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-white/55 hover:text-white">
                  <ArrowLeftIcon className="h-3.5 w-3.5" /> Back to sign in
                </button>
                <h1 className="text-2xl font-semibold tracking-tight text-white">Reset your password</h1>
                <p className="mt-1.5 text-sm text-white/55">We’ll email a secure link to set a new password.</p>
                <form onSubmit={handleReset} className="mt-7 space-y-4" noValidate>
                  <Field label="Email" htmlFor="reset-email">
                    <Input id="reset-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </Field>
                  {errorBox}
                  <Button type="submit" className="w-full bg-[#941CB8] text-white hover:bg-[#A72FCB]" loading={busy}>
                    Send reset link
                  </Button>
                </form>
              </motion.div>
            }

            {view === 'sent' &&
            <motion.div key="sent" {...fade}>
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
                  <MailCheckIcon className="h-5 w-5" />
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-white">Check your inbox</h1>
                <p className="mt-1.5 text-sm leading-relaxed text-white/55">
                  If <strong className="text-white">{email}</strong> belongs to a director account, a reset link is on its way. It expires after one hour.
                </p>
                <Button variant="secondary" className="mt-6" onClick={() => setView('signin')}>
                  Back to sign in
                </Button>
              </motion.div>
            }
          </AnimatePresence>
        </section>
      </main>
      <p className="pb-6 text-center text-xs text-white/35">© {new Date().getFullYear()} CloudX Global (Pvt) Ltd · Authorised directors only</p>
    </div>);

}