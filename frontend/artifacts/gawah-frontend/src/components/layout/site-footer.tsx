import { Link } from 'wouter';

type SiteFooterProps = {
  healthy: boolean;
};

const PRODUCT_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/calls', label: 'Calls' },
  { href: '/clusters', label: 'Clusters' },
  { href: '/demo', label: 'Live Demo' },
] as const;

const PLATFORM_LINKS = [
  { href: '/#intelligence', label: 'Intelligence Layer' },
  { href: '/#legal', label: 'Legal Framework' },
  { href: '/#model', label: 'Institutions' },
  { href: '/#anonymous', label: 'Anonymous Intake' },
] as const;

export function SiteFooter({ healthy }: SiteFooterProps) {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-cta">
          <h2 className="site-footer-cta-title">The witness that cannot be silenced</h2>
          <p className="site-footer-cta-sub">
            Voice-first CrPC §161 for Pakistan — anonymous statements, counsel-ready intelligence,
            built for NGOs, firms, and government.
          </p>
          <div className="site-footer-cta-actions">
            <Link href="/demo" className="cta-btn">
              <span className="cta-sq">▣</span>
              <span className="cta-lbl">Start Demo</span>
            </Link>
            <Link href="/dashboard" className="cta-btn cta-ghost">
              <span className="cta-sq">→</span>
              <span className="cta-lbl">Open Dashboard</span>
            </Link>
          </div>
        </div>

        <div className="site-footer-grid">
          <div className="site-footer-brand">
            <Link href="/" className="site-footer-logo">
              <span className="accent-sq" />
              GAWAH <span className="site-footer-urdu">گواہ</span>
            </Link>
            <p className="site-footer-tagline">
              Voice-first legal AI for anonymous §161 witness statements — phone-only intake,
              pre-litigation intelligence, Pakistan-hosted.
            </p>
          </div>

          <div className="site-footer-col">
            <h3 className="site-footer-col-h">Product</h3>
            <ul className="site-footer-links">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="site-footer-col">
            <h3 className="site-footer-col-h">Platform</h3>
            <ul className="site-footer-links">
              {PLATFORM_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="site-footer-col">
            <h3 className="site-footer-col-h">Community</h3>
            <p className="site-footer-community">Uplift AI × Replit Voice AI Hackathon 2026</p>
          </div>
        </div>

        <div className="site-footer-bottom">
          <span className="site-footer-copy">© 2026 Gawah. All rights reserved.</span>
          <span className={`site-footer-status ${healthy ? 'is-ok' : 'is-down'}`}>
            <span className="site-footer-status-dot" aria-hidden />
            {healthy ? 'All systems normal' : 'Backend offline'}
          </span>
        </div>
      </div>
    </footer>
  );
}
