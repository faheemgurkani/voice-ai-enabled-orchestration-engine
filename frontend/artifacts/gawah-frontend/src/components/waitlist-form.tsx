import { useState, type FormEvent } from 'react';
import { joinWaitlist, ApiError } from '@/lib/api';

interface WaitlistFormProps {
  /** Where this form is mounted — passed through as-is for later reporting. */
  source: 'demo' | 'clusters';
}

/**
 * No-auth lead capture: one email field, no password, no account. Separate
 * from the real staff signup on /login — this is the "anyone who tries the
 * demo" waitlist, not gated behind creating an account.
 */
export function WaitlistForm({ source }: WaitlistFormProps) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await joinWaitlist(email.trim(), source);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="bento">
        <div className="bento-h">
          <span className="dot dot-k" />
          EARLY.ACCESS
        </div>
        <div className="bento-body">
          <p style={{ fontSize: 14, margin: 0 }}>
            You&apos;re on the list — we&apos;ll reach out when the full product launches.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bento">
      <div className="bento-h">
        <span className="dot dot-k" />
        EARLY.ACCESS
      </div>
      <div className="bento-body">
        <p style={{ fontSize: 14, marginBottom: 12, lineHeight: 1.5 }}>
          Building this out further. Leave your email and we&apos;ll notify you when the
          full product launches — no account, no password.
        </p>
        <form
          onSubmit={submit}
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
        >
          <input
            type="email"
            required
            className="e-input"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ flex: '1 1 220px' }}
            aria-label="Email for early access"
          />
          <button type="submit" className="cta-btn" disabled={busy || !email.trim()}>
            <span className="cta-sq">{busy ? '·' : '→'}</span>
            <span className="cta-lbl">{busy ? 'Joining…' : 'Notify me'}</span>
          </button>
        </form>
        {error && (
          <div className="auth-alert auth-alert--error" role="alert" style={{ marginTop: 12 }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
