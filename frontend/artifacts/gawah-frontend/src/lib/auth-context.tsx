import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { authConfigured, supabase } from '@/lib/supabase';

interface SignUpOptions {
  email: string;
  password: string;
  earlyAccessOptIn: boolean;
  useCase?: string;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  /** True until the initial session lookup settles — guards flash-of-login. */
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (options: SignUpOptions) => Promise<{ needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(authConfigured);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    return () => {
      alive = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Authentication is not configured on this deployment');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(
    async ({ email, password, earlyAccessOptIn, useCase }: SignUpOptions) => {
      if (!supabase) throw new Error('Authentication is not configured on this deployment');
      // Consent travels as user_metadata so the handle_new_user trigger writes
      // the profile row and opted_in_at in the same insert. A follow-up UPDATE
      // would leave a window where the row exists without the opt-in recorded.
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            early_access_opt_in: earlyAccessOptIn,
            ...(useCase?.trim() ? { use_case: useCase.trim() } : {}),
          },
        },
      });
      if (error) throw error;
      return { needsEmailConfirmation: Boolean(data.user && !data.session) };
    },
    [],
  );

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      configured: authConfigured,
      signIn,
      signUp,
      signOut,
    }),
    [session, loading, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
