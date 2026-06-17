import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type AppRole =
  | "administrador"
  | "gerente_general"
  | "direccion"
  | "calidad"
  | "capturista"
  | "reportes_consulta";

export type AppModule =
  | "dashboard"
  | "produccion"
  | "control_calidad"
  | "variables_calidad"
  | "reportes"
  | "configuracion"
  | "usuarios_permisos"
  | "auditoria";

export interface Profile {
  id: string;
  email: string;
  nombre: string;
  rol_visible: string | null;
  activo: boolean;
  laboratorio: "norte" | "sur" | null;
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
  /** ¿Este usuario puede modificar dentro del módulo? (no solo verlo) */
  canEdit: (m: AppModule) => boolean;
  /** Solo Calidad y Administrador pueden cambiar el estatus de un rollo. */
  canChangeRollStatus: boolean;
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

  // Auto-cierre por inactividad (5 min sin interacción)
  useEffect(() => {
    if (!session?.user) return;
    const IDLE_MS = 5 * 60 * 1000;
    let timer: ReturnType<typeof setTimeout>;

    const logout = async () => {
      try {
        await supabase.auth.signOut();
      } finally {
        if (typeof window !== "undefined") {
          try {
            const { toast } = await import("sonner");
            toast.warning("Sesión cerrada por inactividad (5 min)");
          } catch {
            // sonner opcional
          }
          window.location.href = "/login";
        }
      }
    };

    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void logout();
      }, IDLE_MS);
    };

    const events: (keyof WindowEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "click",
      "scroll",
      "touchstart",
      "wheel",
    ];
    events.forEach((ev) =>
      window.addEventListener(ev, reset, { passive: true } as AddEventListenerOptions),
    );
    const onVisibility = () => {
      if (document.visibilityState === "visible") reset();
    };
    document.addEventListener("visibilitychange", onVisibility);
    reset();

    return () => {
      clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, reset));
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [session?.user?.id]);


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
      canEdit: (m) => {
        if (!modules.includes(m)) return false;
        if (roles.includes("administrador")) return true;
        if (roles.includes("calidad")) return true;
        if (roles.includes("capturista") && m === "control_calidad") return true;
        // gerente_general y direccion: solo lectura
        return false;
      },
      canChangeRollStatus:
        roles.includes("calidad") ||
        roles.includes("administrador") ||
        roles.includes("capturista"),
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
