import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Suscripción Realtime para la pantalla Visión Operador.
 *
 * Escucha cambios en las tablas críticas (muestras, mediciones, estado de
 * máquina) y invalida la query de la pantalla para forzar un refetch
 * inmediato — los KPIs, el historial del turno y las variables se actualizan
 * en tiempo real sin esperar al polling de 60 s.
 *
 * Devuelve el estado de la conexión para mostrarlo en la UI ("LIVE" / "POLLING").
 */
export function useOperatorVisionRealtime(maquina: string) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"connecting" | "live" | "offline">(
    "connecting",
  );

  useEffect(() => {
    if (!maquina) return;

    let invalidateTimer: ReturnType<typeof setTimeout> | null = null;
    const invalidateSoon = () => {
      if (invalidateTimer) return; // ya hay un refresh en cola → coalesce
      invalidateTimer = setTimeout(() => {
        invalidateTimer = null;
        queryClient.invalidateQueries({
          queryKey: ["operator-vision", maquina],
        });
      }, 250); // pequeño debounce para agrupar bursts (insert muestra + N mediciones)
    };

    const channel = supabase
      .channel(`operator-vision:${maquina}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "muestras_calidad" },
        invalidateSoon,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mediciones_calidad" },
        invalidateSoon,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "maquina_estado_actual" },
        invalidateSoon,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ordenes_fabricacion" },
        invalidateSoon,
      )
      .subscribe((s) => {
        if (s === "SUBSCRIBED") setStatus("live");
        else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED")
          setStatus("offline");
        else setStatus("connecting");
      });

    return () => {
      if (invalidateTimer) clearTimeout(invalidateTimer);
      supabase.removeChannel(channel);
    };
  }, [maquina, queryClient]);

  return status;
}
