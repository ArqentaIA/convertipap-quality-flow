import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { AppRole } from "@/lib/auth";

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

export const PLANTA_ACTIVA_KEY = "planta_activa_codigo";

/**
 * Código de la planta seleccionada en el encabezado (persistida en localStorage).
 * Permite que las pantallas apliquen reglas por planta aunque el usuario
 * tenga acceso a más de una.
 */
export function usePlantaActivaCodigo(): string | null {
  const [codigo, setCodigo] = useState<string | null>(
    typeof window === "undefined" ? null : window.localStorage.getItem(PLANTA_ACTIVA_KEY),
  );

  useEffect(() => {
    const leer = () => setCodigo(window.localStorage.getItem(PLANTA_ACTIVA_KEY));
    leer();
    window.addEventListener("planta-activa-change", leer);
    window.addEventListener("storage", leer);
    return () => {
      window.removeEventListener("planta-activa-change", leer);
      window.removeEventListener("storage", leer);
    };
  }, []);

  return codigo;
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

/** Roles con visibilidad global: no se recortan por la planta activa. */
const ROLES_GLOBALES: AppRole[] = [
  "administrador",
  "direccion_general",
  "gerente_general",
  "direccion",
  "calidad",
  "reportes_consulta",
];

/**
 * Máquinas visibles en pantalla.
 *  - Roles globales (admin, dirección, gerencia, calidad, consulta):
 *    ven TODAS las máquinas de las plantas que tienen permitidas.
 *  - Resto de roles (capturista, operador, pesaje operativo):
 *    plantas permitidas ∩ planta activa del encabezado.
 */
export function useMaquinasVisibles() {
  const { data: plantas } = usePlantasPermitidas();
  const { data: maquinas } = useMaquinasPermitidas();
  const plantaCodigo = usePlantaActivaCodigo();
  const { hasRole } = useAuth();

  const esGlobal = ROLES_GLOBALES.some((r) => hasRole(r));

  const activa = (plantas ?? []).find(
    (p) => (p.codigo ?? "").toUpperCase() === (plantaCodigo ?? "").toUpperCase(),
  );

  const lista = (maquinas ?? []).filter((m) =>
    esGlobal ? true : activa ? m.planta_id === activa.id : true,
  );
  return { maquinas: lista, codigos: lista.map((m) => m.codigo) };
}


