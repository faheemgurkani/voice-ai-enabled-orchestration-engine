import { useState, type FormEvent } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { PageShell } from '@/components/layout/page-shell';
import { useAuth } from '@/lib/auth-context';

type Mode = 'signin' | 'signup';

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { signIn, signUp, configured } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [useCase, setUseCase] = useState('');
  // Deliberately unchecked. A pre-ticked consent box is not consent.
  const [earlyAccess, setEarlyAccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const redirectTo = new URLSearchParams(search).get('next') || '/dashboard';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
        setLocation(redirectTo);
        return;
      }
      const { needsEmailConfirmation } = await signUp({
        email,
        password,
        earlyAccessOptIn: earlyAccess,
        useCase,
      });
      if (needsEmailConfirmation) {
        setNotice('Account created. Check your inbox to confirm before signing in.');
        setMode('signin');
      } else {
        setLocation(redirectTo);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  return (
    <PageShell>
      <div className="marquee">
        <div className="marquee-track">
          STAFF ACCESS <span className="marquee-star">▣</span> WITNESSES NEVER SIGN IN{' '}
          <span className="marquee-star">▣</span> CrPC §161 <span className="marquee-star">▣</span>
          STAFF ACCESS <span className="marquee-star">▣</span> WITNESSES NEVER SIGN IN{' '}
          <span className="marquee-star">▣</span> CrPC §161 <span className="marquee-star">▣</span>
        </div>
      </div>

      <div className="page-content page-stack">
        <div className="page-header">
          <div className="section-eyebrow">// RESTRICTED · NGO &amp; LEGAL STAFF</div>
          <h1 className="section-title">
            {mode === 'signin' ? 'SIGN.' : 'REQUEST.'}
            <span className="accent">{mode === 'signin' ? 'IN' : 'ACCESS'}</span>
          </h1>
          <p className="section-sub">
            Statement records are restricted. Witnesses never create an account — a
            reference code is the only thing they ever need.
          </p>
        </div>

        <div className="auth-layout">
          <div className="bento auth-card">
            <div className="bento-h">
              <span className="dot dot-o" />
              {mode === 'signin' ? 'Authenticate' : 'Create account'}
              <span className="bento-name">SUPABASE AUTH</span>
            </div>
            <div className="bento-body">
              <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'signin'}
                  className={`filter-chip${mode === 'signin' ? ' active' : ''}`}
                  onClick={() => switchMode('signin')}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'signup'}
                  className={`filter-chip${mode === 'signup' ? ' active' : ''}`}
                  onClick={() => switchMode('signup')}
                >
                  Sign up
                </button>
              </div>

              {!configured && (
                <div className="auth-alert auth-alert--warn" role="status">
                  Authentication is not configured on this deployment. Set
                  VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.
                </div>
              )}

              <form className="auth-form" onSubmit={submit}>
                <div className="filter-group">
                  <label className="e-label" htmlFor="auth-email">
                    Email
                  </label>
                  <input
                    id="auth-email"
                    className="e-input"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@ngo.org"
                  />
                </div>

                <div className="filter-group">
                  <label className="e-label" htmlFor="auth-password">
                    Password
                  </label>
                  <input
                    id="auth-password"
                    className="e-input"
                    type="password"
                    required
                    minLength={8}
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                  {mode === 'signup' && (
                    <span className="auth-hint">Minimum 8 characters.</span>
                  )}
                </div>

                {mode === 'signup' && (
                  <>
                    <div className="filter-group">
                      <label className="e-label" htmlFor="auth-usecase">
                        What would you use Gawah for? <span className="auth-optional">Optional</span>
                      </label>
                      <textarea
                        id="auth-usecase"
                        className="e-textarea"
                        rows={3}
                        value={useCase}
                        onChange={(e) => setUseCase(e.target.value)}
                        placeholder="e.g. Recording witness accounts for GBV cases in Rawalpindi"
                      />
                    </div>

                    <label className="auth-consent">
                      <input
                        type="checkbox"
                        checked={earlyAccess}
                        onChange={(e) => setEarlyAccess(e.target.checked)}
                      />
                      <span>
                        Notify me and reserve early access when the full product
                        launches.
                        <span className="auth-consent-sub">
                          We store your email only for this. No third-party sharing.
                        </span>
                      </span>
                    </label>
                  </>
                )}

                {error && (
                  <div className="auth-alert auth-alert--error" role="alert">
                    {error}
                  </div>
                )}
                {notice && (
                  <div className="auth-alert" role="status">
                    {notice}
                  </div>
                )}

                <button type="submit" className="cta-btn" disabled={busy || !configured}>
                  <span className="cta-sq">{busy ? '·' : '→'}</span>
                  <span className="cta-lbl">
                    {busy
                      ? 'Working…'
                      : mode === 'signin'
                        ? 'Sign in'
                        : 'Create account'}
                  </span>
                </button>
              </form>
            </div>
          </div>

          <aside className="bento auth-aside">
            <div className="bento-h">
              <span className="dot dot-r" />
              Who signs in
            </div>
            <div className="bento-body">
              <div className="auth-plane">
                <div className="auth-plane-k">Witness</div>
                <div className="auth-plane-v">
                  Never signs in. Calls, speaks, receives a 6-character reference
                  code. Anonymous permanently.
                </div>
              </div>
              <div className="e-rule auth-plane-rule" />
              <div className="auth-plane">
                <div className="auth-plane-k">NGO / legal staff</div>
                <div className="auth-plane-v">
                  Signs in here. Reviews statements, clusters, and protection
                  referrals for their own workspace only.
                </div>
              </div>
              <div className="e-rule auth-plane-rule" />
              <p className="auth-plane-note">
                Checking a reference code needs no account —{' '}
                <Link href="/demo" className="link-clear">
                  use the demo page
                </Link>
                .
              </p>
            </div>
          </aside>
        </div>
      </div>
    </PageShell>
  );
}
