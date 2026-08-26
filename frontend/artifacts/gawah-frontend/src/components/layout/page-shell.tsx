import { ReactNode, useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { fetchHealth } from '@/lib/api';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', match: '/dashboard' },
  { href: '/calls', label: 'Calls', match: '/calls' },
  { href: '/clusters', label: 'Clusters', match: '/clusters' },
  { href: '/demo', label: 'Demo', match: '/demo' },
] as const;

export function PageShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [healthError, setHealthError] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    const onScroll = () => setPinned(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    let alive = true;
    fetchHealth()
      .then(() => {
        if (!alive) return;
        setOnline(true);
        setHealthError(null);
      })
      .catch(() => {
        if (!alive) return;
        setOnline(false);
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
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`topbar-link ${location.startsWith(item.match) ? 'active' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <div className="topbar-meta">
          {online && <span className="pulse-dot" aria-hidden />}
          <span>// DASHBOARD</span>
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
      <footer className="footer-bar">
        <div>
          <span className="accent-sq" />
          GAWAH — گواہ · VOICE-FIRST LEGAL AI · PAKISTAN
        </div>
        <div className="right">UPLIFT AI HACKATHON 2026</div>
      </footer>
    </div>
  );
}
