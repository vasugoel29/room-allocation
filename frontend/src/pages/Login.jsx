import React, { useState, useContext, useEffect, useRef } from 'react';
import { ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { authService } from '../services/authService';
import { AppContext } from '../context/AppContext';

const GoogleIcon = () => (
  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
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
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
    />
  </svg>
);

const Login = () => {
  const { setUser } = useContext(AppContext);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const googleBtnRef = useRef(null);

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const devLoginEnabled = import.meta.env.VITE_DEV_LOGIN === 'true';
  const [devEmail, setDevEmail] = useState('');

  const completeSignIn = (data) => {
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
  };

  const handleDevLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      completeSignIn(await authService.devLogin(devEmail.trim()));
    } catch (err) {
      setError(err.message || 'Dev sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credential) => {
    setError('');
    setLoading(true);

    try {
      const data = await authService.googleLogin(credential);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setUser(data.user);
    } catch (err) {
      setError(err.message || 'Google SSO verification failed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!googleClientId) return undefined;
    let timer;
    let tries = 0;
    // The GIS script loads async (index.html); wait for it before rendering the button.
    const init = () => {
      if (!window.google?.accounts?.id) {
        if (tries++ < 50) timer = setTimeout(init, 200);
        return;
      }
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response) => {
          if (response.credential) handleGoogleSuccess(response.credential);
        },
      });
      if (googleBtnRef.current) {
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'outline',
          size: 'large',
          width: 280,
          text: 'signin_with',
          shape: 'pill',
        });
      }
    };
    init();
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleClientId]);

  const handleDirectGoogleSSO = () => {
    if (window.google?.accounts?.id && googleClientId) {
      window.google.accounts.id.prompt();
    } else {
      setError('Google sign-in is not configured for this deployment (VITE_GOOGLE_CLIENT_ID is missing).');
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-surface-lowest p-4 relative overflow-hidden">
      {/* Background Ambient Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] bg-primary-accent/10 blur-[130px] rounded-full pointer-events-none"></div>

      <div className="relative w-full max-w-sm bg-surface-low rounded-[2.5rem] p-8 sm:p-10 shadow-xl ring-1 ring-border/20 space-y-8 animate-in fade-in zoom-in duration-300 text-center">
        {/* Logo and Titles */}
        <div className="space-y-3">
          <div className="inline-flex">
            <img src="/pwa-192x192.png" alt="CRAS Logo" className="w-20 h-20 rounded-[1.6rem] shadow-ambient" />
          </div>
          <h2 className="text-3xl font-extrabold text-text-primary tracking-tight font-display">
            CRAS Portal
          </h2>
          <p className="text-xs text-text-secondary font-bold tracking-wider opacity-70 font-display">
            Institutional Access Control System
          </p>
        </div>

        {error && (
          <div id="login-error" role="alert" className="p-3.5 rounded-2xl bg-error/10 border border-error/20 text-error text-xs font-semibold flex items-start gap-2.5 text-left animate-in slide-in-from-top-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-error" />
            <span>{error}</span>
          </div>
        )}

        {/* Pure Google SSO Action */}
        <div className="space-y-4 pt-2">
          {loading && (
            <div className="w-full flex items-center justify-center gap-3 bg-white text-gray-800 border border-gray-300 py-3.5 px-4 rounded-2xl font-bold text-sm shadow-sm">
              <Loader2 size={18} className="animate-spin text-primary-accent" />
              <span className="text-text-primary text-xs font-bold">Verifying institutional access...</span>
            </div>
          )}

          {/* Official GIS Button container when client ID is configured */}
          {googleClientId ? (
            <div
              ref={googleBtnRef}
              className={`flex justify-center min-h-[44px] ${loading ? 'hidden' : ''}`}
            />
          ) : (
            /* Fallback button when client ID is missing */
            !loading && (
              <button
                type="button"
                onClick={handleDirectGoogleSSO}
                className="w-full flex items-center justify-center gap-3 bg-white text-gray-800 hover:bg-gray-50 border border-gray-300 py-3.5 px-4 rounded-2xl font-bold text-sm shadow-sm hover:shadow-md transition-all active:scale-[0.98] cursor-pointer"
              >
                <GoogleIcon />
                <span>Sign in with Google</span>
              </button>
            )
          )}
        </div>

        {devLoginEnabled && (
          <form onSubmit={handleDevLogin} className="space-y-3 text-left" aria-label="Developer sign-in">
            <label htmlFor="dev-email" className="block text-[11px] font-bold tracking-wider text-text-secondary">
              Developer sign-in (local only)
            </label>
            <input
              id="dev-email"
              type="email"
              required
              value={devEmail}
              onChange={(e) => setDevEmail(e.target.value)}
              placeholder="rollno@nsut.ac.in"
              className="w-full rounded-2xl border border-border/40 bg-surface-lowest px-4 py-3 text-sm text-text-primary"
            />
            <button
              type="submit"
              disabled={loading || !devEmail}
              className="w-full rounded-2xl bg-primary-accent px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              Dev sign in
            </button>
          </form>
        )}

        {/* Institutional notice */}
        <div className="pt-2 text-center text-[10px] text-text-secondary/70 font-medium flex items-center justify-center gap-1.5">
          <ShieldCheck size={14} className="text-emerald-500 shrink-0" />
          <span>Restricted to authorized @nsut.ac.in accounts</span>
        </div>
      </div>
    </div>
  );
};

export default Login;
