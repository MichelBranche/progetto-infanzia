import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { isCloudEnabled, cloudConfigHint } from "../lib/cloudConfig";
import {
  getCurrentCloudProfile,
  signInWithEmail,
  signOutCloud,
  signUpWithEmail,
  updateCloudDisplayName,
} from "../lib/cloudAuth";
import { getSupabase } from "../lib/supabaseClient";
import type { CloudProfile } from "../types/cloud";

interface CloudAccountContextValue {
  enabled: boolean;
  configured: boolean;
  configHint: string;
  loading: boolean;
  profile: CloudProfile | null;
  user: User | null;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateDisplayName: (name: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const CloudAccountContext = createContext<CloudAccountContextValue | null>(null);

export function CloudAccountProvider({ children }: { children: ReactNode }) {
  const configured = isCloudEnabled();
  const [loading, setLoading] = useState(configured);
  const [profile, setProfile] = useState<CloudProfile | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const syncInFlightRef = useRef<Promise<unknown> | null>(null);

  const runCloudSync = useCallback(async (cloudProfile: CloudProfile) => {
    if (syncInFlightRef.current) {
      await syncInFlightRef.current.catch(() => {});
      return;
    }

    const syncPromise = (async () => {
      const { syncCloudAccountWithApp } = await import("../lib/cloudProfileSync");
      await syncCloudAccountWithApp(cloudProfile);
    })().catch((err) => {
      console.warn("[cloudProfileSync] sync failed:", err);
    });

    syncInFlightRef.current = syncPromise;
    try {
      await syncPromise;
    } finally {
      if (syncInFlightRef.current === syncPromise) {
        syncInFlightRef.current = null;
      }
    }
  }, []);

  const reloadProfileOnly = useCallback(async () => {
    if (!configured) return;
    const supabase = getSupabase();
    if (!supabase) return;

    const { data } = await supabase.auth.getSession();
    setUser(data.session?.user ?? null);
    const p = await getCurrentCloudProfile();
    setProfile(p);
  }, [configured]);

  const refresh = useCallback(
    async (options?: { showLoading?: boolean; sync?: boolean }) => {
      const showLoading = options?.showLoading ?? false;
      const shouldSync = options?.sync ?? true;

      if (!configured) {
        setProfile(null);
        setUser(null);
        setLoading(false);
        return;
      }

      if (showLoading) setLoading(true);
      try {
        const supabase = getSupabase();
        const { data } = await supabase!.auth.getSession();
        setUser(data.session?.user ?? null);
        const p = await getCurrentCloudProfile();
        setProfile(p);
        if (p && shouldSync) {
          await runCloudSync(p);
        }
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [configured, runCloudSync],
  );

  useEffect(() => {
    void refresh({ showLoading: true });
    if (!configured) return;

    const supabase = getSupabase();
    if (!supabase) return;

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      if (event === "SIGNED_IN") {
        void refresh({ showLoading: true });
        return;
      }
      void reloadProfileOnly();
    });

    const onCloudProfileChanged = () => {
      void reloadProfileOnly();
    };
    window.addEventListener("branchefy:cloud-profile-changed", onCloudProfileChanged);

    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener("branchefy:cloud-profile-changed", onCloudProfileChanged);
    };
  }, [configured, refresh, reloadProfileOnly]);

  const signUp = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const p = await signUpWithEmail(email, password, displayName);
      setProfile(p);
      const supabase = getSupabase();
      const { data } = await supabase!.auth.getSession();
      setUser(data.session?.user ?? null);
      const { syncCloudAccountWithApp } = await import("../lib/cloudProfileSync");
      await syncCloudAccountWithApp(p).catch(() => {});
    },
    [],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const p = await signInWithEmail(email, password);
    setProfile(p);
    const supabase = getSupabase();
    const { data } = await supabase!.auth.getSession();
    setUser(data.session?.user ?? null);
    const { syncCloudAccountWithApp } = await import("../lib/cloudProfileSync");
    await syncCloudAccountWithApp(p).catch(() => {});
  }, []);

  const signOut = useCallback(async () => {
    const { clearMyPresence } = await import("../lib/cloudPresence");
    await clearMyPresence();
    await signOutCloud();
    setProfile(null);
    setUser(null);
  }, []);

  const updateDisplayName = useCallback(async (name: string) => {
    const p = await updateCloudDisplayName(name);
    setProfile(p);
  }, []);

  const value = useMemo(
    () => ({
      enabled: configured,
      configured,
      configHint: cloudConfigHint(),
      loading,
      profile,
      user,
      signUp,
      signIn,
      signOut,
      updateDisplayName,
      refresh,
    }),
    [
      configured,
      loading,
      profile,
      user,
      signUp,
      signIn,
      signOut,
      updateDisplayName,
      refresh,
    ],
  );

  return (
    <CloudAccountContext.Provider value={value}>
      {children}
    </CloudAccountContext.Provider>
  );
}

export function useCloudAccount() {
  const ctx = useContext(CloudAccountContext);
  if (!ctx) {
    throw new Error("useCloudAccount must be used within CloudAccountProvider");
  }
  return ctx;
}
