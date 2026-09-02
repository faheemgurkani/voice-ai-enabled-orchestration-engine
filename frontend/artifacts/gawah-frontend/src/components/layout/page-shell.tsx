import { ReactNode, useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { fetchHealth } from '@/lib/api';
import { SiteFooter } from '@/components/layout/site-footer';
import { useAuth } from '@/lib/auth-context';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', match: '/dashboard' },
  { href: '/calls', label: 'Calls', match: '/calls' },
  { href: '/clusters', label: 'Clusters', match: '/clusters' },
] as const;

export function PageShell({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user, signOut, configured } = useAuth();
  const [healthError, setHealthError] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [pinned, setPinned] = useState(false);
  // On the landing page, the hero already has its own "Open Dashboard" CTA,
  // so the nav's Dashboard link stays hidden until the hero has been
  // scrolled past. On every other page it's always shown.
  const [showDashboardLink, setShowDashboardLink] = useState(() => window.location.pathname !== '/');

  useEffect(() => {
    const onScroll = () => setPinned(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (location !== '/') {
      setShowDashboardLink(true);
      return;
    }
    const heroCta = document.getElementById('hero-dashboard-cta');
    if (!heroCta) {
      setShowDashboardLink(true);
      return;
    }
    setShowDashboardLink(false);
    // Fires the instant the hero's own "Open Dashboard" button scrolls out
    // of view — no extra threshold/margin, so the nav link takes its place
    // as soon as the hero one is gone, not noticeably later.
    const observer = new IntersectionObserver(
      ([entry]) => setShowDashboardLink(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 },
    );
    observer.observe(heroCta);
    return () => observer.disconnect();
  }, [location]);

  useEffect(() => {
    let alive = true;
    fetchHealth()
      .then(() => {
        if (!alive) return;
        setHealthError(null);
      })
      .catch(() => {
        if (!alive) return;
        setHealthError(
          `Backend offline — connect FastAPI at ${import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://gawah-backend.vercel.app' : 'http://localhost:8000')} to use live data`,
        );
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="page-wrap">
      <nav className={`topbar-nav${pinned ? ' is-pinned' : ''}`}>
        <Link href="/" className="topbar-brand">
          <span className="accent-sq" />
          GAWAH گواہ
        </Link>
        <div className="topbar-links">
          {NAV.map((item) => {
            const isDashboard = item.href === '/dashboard';
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`topbar-link ${location.startsWith(item.match) ? 'active' : ''} ${
                  isDashboard ? `topbar-link--gated${showDashboardLink ? '' : ' is-hidden'}` : ''
                }`}
                aria-hidden={isDashboard && !showDashboardLink ? true : undefined}
                tabIndex={isDashboard && !showDashboardLink ? -1 : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
        <div className="topbar-meta">
          {configured && user ? (
            <div className="topbar-account">
              <span className="topbar-account-id" title={user.email ?? undefined}>
                {user.email}
              </span>
              <button
                type="button"
                className="cta-btn cta-ghost"
                onClick={async () => {
                  await signOut();
                  setLocation('/');
                }}
              >
                <span className="cta-lbl">Sign out</span>
              </button>
            </div>
          ) : (
            <>
              {configured && location !== '/login' && (
                <Link href="/login" className="topbar-link topbar-signin">
                  Staff sign in
                </Link>
              )}
              <Link href="/demo" className="cta-btn">
                <span className="cta-lbl">Start Demo</span>
              </Link>
            </>
          )}
        </div>
      </nav>
      <div className="topbar-nav-spacer" aria-hidden />
      {healthError && !bannerDismissed && (
        <div className="health-banner" role="status">
          <span>{healthError}</span>
          <button
            type="button"
            className="banner-dismiss"
            onClick={() => setBannerDismissed(true)}
            aria-label="Dismiss backend status banner"
          >
            ✕
          </button>
        </div>
      )}
      <main className="page-main">{children}</main>
      <SiteFooter healthy={!healthError} />
    </div>
  );
}
