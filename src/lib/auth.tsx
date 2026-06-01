import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type AppRole =
  | "administrador"
  | "gerente_general"
  | "direccion"
  | "calidad"
  | "capturista";

export type AppModule =
  | "dashboard"
  | "produccion"
  | "control_calidad"
  | "variables_calidad"
  | "reportes"
  | "configuracion"
  | "usuarios_permisos";

export interface Profile {
  id: string;
  email: string;
  nombre: string;
  rol_visible: string | null;
  activo: boolean;
}

interface AuthState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  modules: AppModule[];
  isAuthenticated: boolean;
  hasRole: (r: AppRole) => boolean;
  canAccess: (m: AppModule) => boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

async function loadProfileAndPerms(userId: string) {
  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);

  const roles = (roleRows ?? []).map((r) => r.role as AppRole);

  let modules: AppModule[] = [];
  if (roles.length > 0) {
    const { data: modRows } = await supabase
      .from("module_permissions")
      .select("module")
      .in("role", roles);
    modules = Array.from(new Set((modRows ?? []).map((m) => m.module as AppModule)));
  }

  return { profile: (profile as Profile | null) ?? null, roles, modules };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [modules, setModules] = useState<AppModule[]>([]);

  const hydrate = async (s: Session | null) => {
    setSession(s);
    if (!s?.user) {
      setProfile(null);
      setRoles([]);
      setModules([]);
      setLoading(false);
      return;
    }
    try {
      const { profile, roles, modules } = await loadProfileAndPerms(s.user.id);
      setProfile(profile);
      setRoles(roles);
      setModules(modules);
    } catch (e) {
      console.error("auth hydrate failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Listener first
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      // Defer Supabase calls out of the callback
      setTimeout(() => {
        void hydrate(s);
      }, 0);
    });
    // Then read existing session
    supabase.auth.getSession().then(({ data }) => {
      void hydrate(data.session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      profile,
      roles,
      modules,
      isAuthenticated: !!session?.user,
      hasRole: (r) => roles.includes(r),
      canAccess: (m) => modules.includes(m),
      signOut: async () => {
        await supabase.auth.signOut();
      },
      refresh: async () => {
        const { data } = await supabase.auth.getSession();
        await hydrate(data.session);
      },
    }),
    [loading, session, profile, roles, modules],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
