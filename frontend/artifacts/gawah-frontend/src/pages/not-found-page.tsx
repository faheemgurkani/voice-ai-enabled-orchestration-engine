import { Link } from 'wouter';
import { PageShell } from '@/components/layout/page-shell';

export default function NotFoundPage() {
  return (
    <PageShell>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          textAlign: 'center',
        }}
      >
        <div className="vt text-e-accent glitch" style={{ fontSize: 120 }}>
          404
        </div>
        <div style={{ fontSize: 24, fontWeight: 'bold', letterSpacing: '0.1em', marginTop: 16 }}>
          REFERENCE NOT FOUND
        </div>
        <div className="text-e-muted" style={{ margin: '16px 0 32px', maxWidth: 420 }}>
          The requested record does not exist or has been archived.
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link href="/dashboard" className="cta-btn">
            <span className="cta-sq">→</span>
            <span className="cta-lbl">Dashboard</span>
          </Link>
          <Link href="/" className="cta-btn cta-ghost">
            <span className="cta-sq">⌂</span>
            <span className="cta-lbl">Home</span>
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
