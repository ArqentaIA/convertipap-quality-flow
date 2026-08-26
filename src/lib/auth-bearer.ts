import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

/**
 * Adjunta el bearer token de Supabase a cada llamada de server function.
 * A diferencia del middleware generado, aquí refrescamos la sesión cuando el
 * access_token ya expiró (o está por expirar), evitando el error
 * "Unauthorized: No authorization header provided" tras periodos de inactividad.
 */
export const attachFreshSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    let token: string | undefined;
    try {
      const { data } = await supabase.auth.getSession();
      let session = data.session;
      const expSoon =
        !session?.expires_at || session.expires_at * 1000 - Date.now() < 30_000;
      if (session && expSoon) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        session = refreshed.session ?? session;
      }
      token = session?.access_token;
    } catch {
      token = undefined;
    }
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
  },
);
