import { useEffect, useId, useRef } from 'react';

// Plain <script>-tag integration (no @marsidev/react-turnstile dependency) —
// see https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: Record<string, unknown>,
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

let scriptPromise: Promise<void> | null = null;
function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Turnstile'));
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

interface TurnstileWidgetProps {
  /** Called with a fresh token on solve, or null when expired/errored/absent. */
  onToken: (token: string | null) => void;
}

/**
 * Cloudflare Turnstile challenge. Renders nothing — and calls onToken(null)
 * once, immediately — when VITE_TURNSTILE_SITE_KEY isn't set. This is the
 * safe default: every form using this widget keeps working exactly as
 * before until a real sitekey is configured (paired with the backend's
 * TURNSTILE_SECRET_KEY / Supabase Auth's CAPTCHA setting for it to actually
 * be enforced — see docs/DEPLOYMENT.md).
 */
export function TurnstileWidget({ onToken }: TurnstileWidgetProps) {
  const rawId = useId();
  const containerId = `turnstile-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    if (!SITE_KEY) {
      onTokenRef.current(null);
      return;
    }
    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(`#${containerId}`, {
          sitekey: SITE_KEY,
          callback: (token: string) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        });
      })
      .catch(() => onTokenRef.current(null));

    return () => {
      cancelled = true;
      if (window.turnstile && widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // widget already gone
        }
      }
    };
  }, [containerId]);

  if (!SITE_KEY) return null;
  return <div id={containerId} style={{ margin: '8px 0' }} />;
}
