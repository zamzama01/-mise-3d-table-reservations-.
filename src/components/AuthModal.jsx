import { X } from 'lucide-react';
import { useState } from 'react';
import { api, ApiError, setStoredToken } from '../lib/api.js';
import { signInWithGooglePopup } from '../lib/firebase.js';
import { formatPakistaniPhone } from '../lib/timeFormat.js';

function GoogleLogo() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export function AuthModal({
  isOpen,
  onClose,
  onAuthenticated,
  initialMode = 'login',
}) {
  const [mode, setMode] = useState(initialMode);
  const [role, setRole] = useState('customer');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const googleUser = await signInWithGooglePopup();
      const res = await api.auth.google({ idToken: googleUser.idToken });
      setStoredToken(res.token);
      onAuthenticated(res.user);
      onClose();
    } catch (err) {
      if (err?.code === 'auth/popup-closed-by-user') {
        setError('Google sign-in popup was closed before completing.');
      } else if (err?.code === 'auth/popup-blocked') {
        setError('Popup was blocked by your browser. Please allow popups and try again.');
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(err?.message || 'Google sign in failed.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res =
        mode === 'login'
          ? await api.auth.login({ email, password })
          : await api.auth.register({
              name,
              email,
              password,
              phone: formatPakistaniPhone(phone),
              role,
            });
      setStoredToken(res.token);
      onAuthenticated(res.user);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const quickDemoLogin = async (demoEmail, demoPass) => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.auth.login({ email: demoEmail, password: demoPass });
      setStoredToken(res.token);
      onAuthenticated(res.user);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Demo sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  const busy = loading || googleLoading;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0E14]/65 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-[#0F172A]/12 dark:border-white/12 bg-white dark:bg-[#131822] p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 border-b border-[#0F172A]/10 dark:border-white/10 pb-4">
          <h2
            id="auth-modal-title"
            className="font-display text-2xl font-semibold tracking-tight text-[#0F172A] dark:text-[#F1F5F9]"
          >
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-2 text-[#475569] dark:text-[#94A3B8] hover:bg-[#0F172A]/5 dark:hover:bg-white/10 hover:text-[#0F172A] dark:hover:text-[#F1F5F9] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={busy}
          className="mt-4 w-full flex items-center justify-center gap-2.5 rounded-lg border border-[#747775]/40 dark:border-white/20 bg-white dark:bg-[#131822] px-4 py-2.5 text-sm font-medium text-[#1F1F1F] dark:text-[#E3E3E3] shadow-xs hover:bg-[#F8FAFC] dark:hover:bg-[#1A2130] disabled:opacity-60 transition-colors"
        >
          <GoogleLogo />
          <span>{googleLoading ? 'Connecting Google...' : 'Sign in with Google'}</span>
        </button>

        <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]">
          <span className="h-px flex-1 bg-[#0F172A]/10 dark:bg-white/10" />
          <span>or</span>
          <span className="h-px flex-1 bg-[#0F172A]/10 dark:bg-white/10" />
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#E9ECEF] dark:bg-[#1A2130] p-1">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`rounded-md py-2 text-xs font-semibold transition-colors ${
              mode === 'login'
                ? 'bg-white dark:bg-[#0B0E14] text-[#0F172A] dark:text-[#F1F5F9] shadow-sm'
                : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9]'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`rounded-md py-2 text-xs font-semibold transition-colors ${
              mode === 'register'
                ? 'bg-white dark:bg-[#0B0E14] text-[#0F172A] dark:text-[#F1F5F9] shadow-sm'
                : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9]'
            }`}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          {mode === 'register' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRole('customer')}
                  className={`rounded-lg border px-3 py-2.5 text-left text-xs transition-colors ${
                    role === 'customer'
                      ? 'border-[#0F766E] dark:border-[#14B8A6] bg-[#0F766E]/8 dark:bg-[#14B8A6]/12 text-[#0F172A] dark:text-[#F1F5F9] font-semibold'
                      : 'border-[#0F172A]/12 dark:border-white/12 bg-[#F4F5F7] dark:bg-[#1A2130] text-[#475569] dark:text-[#94A3B8]'
                  }`}
                >
                  Guest
                </button>
                <button
                  type="button"
                  onClick={() => setRole('owner')}
                  className={`rounded-lg border px-3 py-2.5 text-left text-xs transition-colors ${
                    role === 'owner'
                      ? 'border-[#0F766E] dark:border-[#14B8A6] bg-[#0F766E]/8 dark:bg-[#14B8A6]/12 text-[#0F172A] dark:text-[#F1F5F9] font-semibold'
                      : 'border-[#0F172A]/12 dark:border-white/12 bg-[#F4F5F7] dark:bg-[#1A2130] text-[#475569] dark:text-[#94A3B8]'
                  }`}
                >
                  Restaurant Owner
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                  Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nadia Khan"
                  className="w-full rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-3 py-2.5 text-sm text-[#0F172A] dark:text-[#F1F5F9] focus:border-[#0F766E] dark:focus:border-[#14B8A6] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
                  Phone (+92)
                </label>
                <div className="flex items-center rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] overflow-hidden focus-within:border-[#0F766E] dark:focus-within:border-[#14B8A6]">
                  <span className="border-r border-[#0F172A]/12 dark:border-white/12 px-3 py-2.5 text-xs font-mono font-semibold text-[#0F766E] dark:text-[#14B8A6] shrink-0">
                    +92
                  </span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="300 1234567"
                    className="w-full bg-transparent px-3 py-2.5 text-sm font-mono text-[#0F172A] dark:text-[#F1F5F9] focus:outline-none"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-3 py-2.5 text-sm text-[#0F172A] dark:text-[#F1F5F9] focus:border-[#0F766E] dark:focus:border-[#14B8A6] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#334155] dark:text-[#CBD5E1] mb-1">
              Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
              className="w-full rounded-lg border border-[#0F172A]/15 dark:border-white/15 bg-[#F4F5F7] dark:bg-[#1A2130] px-3 py-2.5 text-sm text-[#0F172A] dark:text-[#F1F5F9] focus:border-[#0F766E] dark:focus:border-[#14B8A6] focus:outline-none"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-[#B91C1C]/30 dark:border-[#F87171]/30 bg-[#B91C1C]/8 dark:bg-[#B91C1C]/15 px-3 py-2 text-xs font-medium text-[#991B1B] dark:text-[#FCA5A5]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#0F766E] dark:bg-[#14B8A6] px-4 py-2.5 text-sm font-semibold text-white dark:text-[#0B0E14] hover:bg-[#0D9488] dark:hover:bg-[#2DD4BF] disabled:opacity-60 transition-colors"
          >
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="mt-5 border-t border-[#0F172A]/10 dark:border-white/10 pt-4">
          <p className="text-xs text-[#475569] dark:text-[#94A3B8] mb-2">Demo accounts</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => quickDemoLogin('nadia.khan@example.com', 'GuestPass123!')}
              className="rounded-lg border border-[#0F172A]/12 dark:border-white/12 bg-[#F4F5F7] dark:bg-[#1A2130] px-3 py-2 text-left text-xs hover:border-[#0F766E] dark:hover:border-[#14B8A6] transition-colors"
            >
              <span className="block font-semibold text-[#0F172A] dark:text-[#F1F5F9]">Guest</span>
              <span className="block text-[11px] text-[#475569] dark:text-[#94A3B8]">Nadia Khan</span>
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() =>
                quickDemoLogin('zamda@mise.pk', 'OwnerPass123!')
              }
              className="rounded-lg border border-[#0F172A]/12 dark:border-white/12 bg-[#F4F5F7] dark:bg-[#1A2130] px-3 py-2 text-left text-xs hover:border-[#0F766E] dark:hover:border-[#14B8A6] transition-colors"
            >
              <span className="block font-semibold text-[#0F172A] dark:text-[#F1F5F9]">Owner</span>
              <span className="block text-[11px] text-[#475569] dark:text-[#94A3B8]">Zamda</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
