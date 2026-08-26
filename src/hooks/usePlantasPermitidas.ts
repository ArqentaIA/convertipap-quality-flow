import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type PlantaRow = { id: string; codigo: string; nombre: string };

/**
 * Plantas visibles para el usuario en sesión.
 * Si tiene filas en `user_plantas`, solo ve esas plantas; si no, ve todas.
 */
export function usePlantasPermitidas() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: ["plantas-permitidas", userId],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PlantaRow[]> => {
      const [{ data: up }, { data: plantas }] = await Promise.all([
        supabase.from("user_plantas").select("planta_id").eq("user_id", userId!),
        supabase.from("plantas").select("id, codigo, nombre").eq("activo", true).order("codigo"),
      ]);
      const allowed = (up ?? []).map((r) => r.planta_id as string);
      const all = (plantas ?? []) as PlantaRow[];
      return allowed.length > 0 ? all.filter((p) => allowed.includes(p.id)) : all;
    },
  });
}

/** Máquinas activas visibles para el usuario (filtradas por planta asignada). */
export function useMaquinasPermitidas() {
  const { data: plantas } = usePlantasPermitidas();
  const plantaIds = (plantas ?? []).map((p) => p.id);

  return useQuery({
    queryKey: ["maquinas-permitidas", plantaIds.join(",")],
    enabled: plantaIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("maquinas")
        .select("id, codigo, nombre, planta_id")
        .eq("activo", true)
        .in("planta_id", plantaIds)
        .order("codigo");
      if (error) throw error;
      return data ?? [];
    },
  });
}
