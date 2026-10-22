import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Refresca versiones publicadas sin borrar el progreso de captura. */
export function useSpecPublicacionRealtime(enabled: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["qc", "productos-con-spec"] });
      void queryClient.invalidateQueries({ queryKey: ["qc", "spec-por-producto"] });
      void queryClient.invalidateQueries({ queryKey: ["qc", "skus-por-producto"] });
    };
    const channel = supabase.channel("qc:spec-publicacion")
      .on("postgres_changes", { event: "*", schema: "public", table: "producto_especificaciones" }, refresh)
      .subscribe();
    // Respaldo ante interrupciones de conexión; también refresca al volver a la pestaña.
    const timer = setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      void supabase.removeChannel(channel);
    };
  }, [enabled, queryClient]);
}