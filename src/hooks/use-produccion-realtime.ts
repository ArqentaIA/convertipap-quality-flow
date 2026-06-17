import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Realtime para la pantalla Producción.
 * Invalida la query `["produccion", "maquinas", *]` cuando hay cambios en
 * cualquiera de las tablas que alimentan los KPIs (muestras, mediciones,
 * rollos, paros, estado de máquina, órdenes). Coalesce con un pequeño
 * debounce para agrupar bursts.
 */
export function useProduccionRealtime() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"connecting" | "live" | "offline">(
    "connecting",
  );

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (t) return;
      t = setTimeout(() => {
        t = null;
        qc.invalidateQueries({ queryKey: ["produccion", "maquinas"] });
      }, 300);
    };

    const ch = supabase
      .channel("produccion:maquinas")
      .on("postgres_changes", { event: "*", schema: "public", table: "muestras_calidad" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "mediciones_calidad" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "rollos_producidos" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "paros_maquina" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "maquina_estado_actual" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "ordenes_fabricacion" }, refresh)
      .subscribe((s) => {
        if (s === "SUBSCRIBED") setStatus("live");
        else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") setStatus("offline");
        else setStatus("connecting");
      });

    return () => {
      if (t) clearTimeout(t);
      supabase.removeChannel(ch);
    };
  }, [qc]);

  return status;
}
