import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, requireSupabase } from "../supabase";

export type AppRole = "rider" | "driver" | "admin";
export type UserProfile = {
  id: string;
  role: AppRole;
  full_name: string;
  phone: string;
};

type AuthContextValue = {
  ready: boolean;
  configured: boolean;
  user: User | null;
  profile: UserProfile | null;
  profileError: string | null;
  signIn: (email: string, password: string) => Promise<UserProfile | null>;
  signUp: (email: string, password: string, metadata: Record<string, string>) => Promise<boolean>;
  updateProfile: (fields: Pick<UserProfile, "full_name" | "phone">) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function profileForUser(user: User): Promise<UserProfile | null> {
  const client = requireSupabase();
  const { data, error } = await client.from("user_profiles").select("id, role, full_name, phone").eq("id", user.id).maybeSingle();
  if (error) throw error;
  return data as UserProfile | null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!isSupabaseConfigured);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    const client = requireSupabase();
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session: Session | null) => {
      if (!active) return;
      setUser(session?.user ?? null);
      if (!session?.user) {
        setProfile(null);
        setProfileError(null);
        setReady(true);
        return;
      }
      setProfileError(null);
      queueMicrotask(() => {
        void profileForUser(session.user).then((nextProfile) => {
          if (active) {
            setProfile(nextProfile);
            if (!nextProfile) setProfileError("No account profile exists yet. Confirm your email or check that the Supabase schema migration has been applied.");
          }
        }).catch((error: unknown) => {
          console.error("Could not load the signed-in profile:", error);
          if (active) {
            setProfile(null);
            setProfileError(error instanceof Error ? error.message : "Could not load the account profile.");
          }
        }).finally(() => {
          if (active) setReady(true);
        });
      });
    });
    void client.auth.getSession().then(async ({ data, error }) => {
      if (!active) return;
      if (error) throw error;
      setUser(data.session?.user ?? null);
      const nextProfile = data.session?.user ? await profileForUser(data.session.user) : null;
      setProfile(nextProfile);
      setProfileError(data.session?.user && !nextProfile ? "No account profile exists yet. Confirm your email or check that the Supabase schema migration has been applied." : null);
    }).catch((error: unknown) => {
      console.error("Could not restore the Supabase session:", error);
      if (active) {
        setUser(null);
        setProfile(null);
        setProfileError(error instanceof Error ? error.message : "Could not restore the Supabase session.");
      }
    }).finally(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    ready,
    configured: isSupabaseConfigured,
    user,
    profile,
    profileError,
    async signIn(email, password) {
      const { data, error } = await requireSupabase().auth.signInWithPassword({ email, password });
      if (error) throw error;
      setUser(data.user);
      try {
        const nextProfile = data.user ? await profileForUser(data.user) : null;
        setProfile(nextProfile);
        setProfileError(nextProfile ? null : "No 058 Rides profile was found for this account.");
        setReady(true);
        return nextProfile;
      } catch (profileLoadError) {
        setProfile(null);
        setProfileError(profileLoadError instanceof Error ? profileLoadError.message : "Could not load the account profile.");
        throw profileLoadError;
      }
    },
    async signUp(email, password, metadata) {
      const { data, error } = await requireSupabase().auth.signUp({
        email,
        password,
        options: {
          data: metadata,
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      if (data.user && data.session) {
        setUser(data.user);
        setProfile(await profileForUser(data.user));
      }
      return Boolean(data.session);
    },
    async updateProfile(fields) {
      if (!user) throw new Error("Sign in to update your account.");
      const cleanFields = { full_name: fields.full_name.trim(), phone: fields.phone.trim() };
      if (cleanFields.full_name.length < 1 || cleanFields.full_name.length > 100) {
        throw new Error("Name must be between 1 and 100 characters.");
      }
      if (cleanFields.phone.length > 30 || (profile?.role === "driver" && cleanFields.phone.length === 0)) {
        throw new Error(profile?.role === "driver" ? "Driver phone must be between 1 and 30 characters." : "Phone must be 30 characters or fewer.");
      }
      if (profile?.role === "driver") {
        const { error } = await requireSupabase().rpc("update_driver_profile", {
          p_full_name: cleanFields.full_name,
          p_phone: cleanFields.phone,
        });
        if (error) throw error;
      } else {
        const { error } = await requireSupabase().from("user_profiles")
          .update(cleanFields)
          .eq("id", user.id);
        if (error) throw error;
      }
      setProfile((current) => current ? { ...current, ...cleanFields } : current);
    },
    async updatePassword(password) {
      const { error } = await requireSupabase().auth.updateUser({ password });
      if (error) throw error;
    },
    async signOut() {
      const { error } = await requireSupabase().auth.signOut();
      if (error) throw error;
      setUser(null);
      setProfile(null);
    },
  }), [ready, user, profile, profileError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

export function routeForRole(role: AppRole | null | undefined) {
  if (role === "driver") return "/driver-login";
  if (role === "admin") return "/ops-058-console";
  return "/ride";
}
