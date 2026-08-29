import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import logo from "@/assets/logo.png";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { auditAction } from "@/lib/audit";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Iniciar sesión · ConvertiPap" },
      { name: "description", content: "Acceso al sistema ConvertiPap Quality Hub" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: LoginPage,
});

const AUTH_HEALTH_URL = `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/health`;

/** Verifica alcance real del servicio de autenticación desde este equipo/red. */
async function diagnosticarRed(): Promise<"ok" | "offline" | "bloqueado"> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    await fetch(AUTH_HEALTH_URL, {
      method: "GET",
      cache: "no-store",
      signal: ctrl.signal,
      headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string },
    });
    clearTimeout(t);
    return "ok";
  } catch {
    return "bloqueado";
  }
}

const esFalloDeRed = (msg: string) =>
  /failed to fetch|network|load failed|fetch error|timeout|aborted/i.test(msg);

function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      void navigate({ to: "/", replace: true });
    }
  }, [loading, isAuthenticated, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setDetalle(null);
    setSubmitting(true);

    const creds = { email: email.trim(), password };
    let ultimoMensaje = "";

    // Reintento automático con backoff: sólo para fallos de red, nunca para credenciales.
    for (let i = 1; i <= 3; i++) {
      setIntento(i);
      try {
        const { error } = await supabase.auth.signInWithPassword(creds);
        if (!error) {
          setSubmitting(false);
          setIntento(0);
          void auditAction("auth", `Login exitoso: ${creds.email}`);
          void navigate({ to: "/", replace: true });
          return;
        }
        ultimoMensaje = error.message;
        if (!esFalloDeRed(error.message)) break;
      } catch (err) {
        ultimoMensaje = err instanceof Error ? err.message : String(err);
      }
      if (i < 3) await new Promise((r) => setTimeout(r, i * 1200));
    }

    setSubmitting(false);
    setIntento(0);

    if (!esFalloDeRed(ultimoMensaje)) {
      setError(
        ultimoMensaje === "Invalid login credentials"
          ? "Correo o contraseña incorrectos."
          : ultimoMensaje,
      );
      return;
    }

    const diag = await diagnosticarRed();
    if (diag === "offline") {
      setError("Sin conexión a Internet en este equipo.");
      setDetalle("Reconecta la red (Wi-Fi/cable) y vuelve a intentar. No es un problema de tu usuario ni del sistema.");
    } else if (diag === "bloqueado") {
      setError("La red de la planta está bloqueando el acceso al servidor de autenticación.");
      setDetalle(
        `No se pudo alcanzar ${AUTH_HEALTH_URL.replace(/\/auth.*/, "")} desde este equipo. Solicita a TI que permita el dominio *.supabase.co y convertipap.site en el firewall/proxy, o prueba con otra red (por ejemplo, datos móviles).`,
      );
    } else {
      setError("Falla temporal de conexión al iniciar sesión.");
      setDetalle("El servidor sí responde desde este equipo. Vuelve a presionar Entrar; si persiste, reporta a TI la hora exacta del intento.");
    }
  };


  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-lg">
        <div className="mb-6 flex flex-col items-center">
          <div className="mb-3 flex h-24 w-full max-w-[270px] items-center justify-center rounded-md bg-white p-2">
            <img src={logo} alt="ConvertiPap" className="h-full w-full object-contain" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Control de calidad</h1>
          <p className="text-xs text-muted-foreground">Inicia sesión para continuar</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">
              Correo
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="usuario@convertipap.site"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">
              Contraseña
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <p className="font-semibold">{error}</p>
              {detalle && <p className="mt-1 font-normal opacity-90">{detalle}</p>}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? (intento > 1 ? `Reintentando (${intento}/3)…` : "Verificando…") : "Entrar"}

          </button>
        </form>

        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          ¿Olvidaste tu contraseña? Contacta al administrador.
        </p>
      </div>
    </div>
  );
}
