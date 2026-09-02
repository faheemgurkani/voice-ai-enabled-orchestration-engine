import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/lib/auth-context';

/**
 * Gate for staff-only routes.
 *
 * This is a UX guard, not the security boundary — the backend rejects every
 * request without a valid token regardless of what the client renders. Its job
 * is to send signed-out users to the login screen instead of showing them a
 * dashboard full of 401s.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, configured } = useAuth();
  const [location, setLocation] = useLocation();

  const shouldRedirect = configured && !loading && !user;

  useEffect(() => {
    if (!shouldRedirect) return;
    setLocation(`/login?next=${encodeURIComponent(location)}`, { replace: true });
  }, [shouldRedirect, location, setLocation]);

  if (loading) {
    return (
      <div className="state-panel" style={{ minHeight: '60vh', border: 'none' }}>
        <div className="spinner" />
        <div className="pager-meta">Checking session</div>
      </div>
    );
  }

  // Without a Supabase project the backend cannot verify anyone, so gating the
  // UI would lock the app with no way in. Say so plainly instead.
  if (!configured) {
    return (
      <div className="state-panel" style={{ minHeight: '60vh' }}>
        <div className="pager-meta">Authentication not configured</div>
        <p className="section-sub" style={{ textAlign: 'center' }}>
          This deployment has no Supabase project wired up, so staff sign-in is
          unavailable.
        </p>
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
