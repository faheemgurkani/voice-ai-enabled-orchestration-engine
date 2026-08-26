import { ReactNode, useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { fetchHealth } from '@/lib/api';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', match: '/dashboard' },
  { href: '/calls', label: 'Calls', match: '/calls' },
  { href: '/clusters', label: 'Clusters', match: '/clusters' },
] as const;

export function PageShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [healthError, setHealthError] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [pinned, setPinned] = useState(false);
  // On the landing page, the hero already has its own "Open Dashboard" CTA,
  // so the nav's Dashboard link stays hidden until the hero has been
  // scrolled past. On every other page it's always shown.
  const [showDashboardLink, setShowDashboardLink] = useState(true);

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
    const band = document.getElementById('land-band');
    if (!band) {
      setShowDashboardLink(true);
      return;
    }
    setShowDashboardLink(false);
    const observer = new IntersectionObserver(
      ([entry]) => setShowDashboardLink(entry.boundingClientRect.bottom <= 0),
      { threshold: 0 },
    );
    observer.observe(band);
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
          <Link href="/demo" className="cta-btn">
            <span className="cta-lbl">Start Demo</span>
          </Link>
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
