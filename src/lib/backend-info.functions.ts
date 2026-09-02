import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BackendEnvironment =
  | "local"
  | "desarrollo"
  | "staging"
  | "producción"
  | "desconocido";

export type BackendInfo = {
  provider: string;
  service: string;
  region: string;
  environment: BackendEnvironment;
  environmentLabel: string;
  host: string;
  status: "conectado" | "desconectado";
  lastCheck: string;
};

const PRODUCTION_HOSTS = [
  "convertipap-quality-flow.lovable.app",
  "convertipap.site",
  "www.convertipap.site",
];

const ENV_LABELS: Record<BackendEnvironment, string> = {
  local: "Desarrollo local",
  desarrollo: "Desarrollo",
  staging: "Staging",
  producción: "Producción",
  desconocido: "No identificado",
};

function detectEnvironment(host: string): BackendEnvironment {
  if (host === "localhost" || host.startsWith("127.") || host.includes("localhost")) {
    return "local";
  }
  if (PRODUCTION_HOSTS.includes(host)) {
    return "producción";
  }
  if (host.includes("preview") || host.includes("-dev.") || host.includes("lovable.app")) {
    return "desarrollo";
  }
  if (host.includes("staging") || host.includes("stg")) {
    return "staging";
  }
  return "desconocido";
}

/**
 * Devuelve información administrativa sobre dónde está alojada la base de datos
 * y en qué entorno se ejecuta la aplicación (dev/staging/producción).
 *
 * No expone IDs de proyecto ni credenciales; solo datos descriptivos y el
 * estado de conectividad con el backend.
 */
export const getBackendInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<BackendInfo> => {
    const request = getRequest();
    const host = request?.headers?.get("host") || "localhost";
    const environment = detectEnvironment(host);

    let status: BackendInfo["status"] = "desconectado";
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from("app_settings")
        .select("id")
        .limit(1);
      status = error ? "desconectado" : "conectado";
    } catch {
      status = "desconectado";
    }

    return {
      provider: "Python 3.14.7",
      service: "PostgreSQL gestionado",
      region: "Región gestionada por Lovable Cloud",
      environment,
      environmentLabel: ENV_LABELS[environment],
      host,
      status,
      lastCheck: new Date().toISOString(),
    };
  });
