// Public trace endpoint for QR codes on liberation labels.
// No auth required: returns minimal, non-sensitive data (no operator PII).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type TraceMedicion = {
  clave: string;
  etiqueta: string;
  unidad: string;
  valor: number;
  min: number;
  objetivo: number;
  max: number;
  estado: string;
};

export type TraceMuestra = {
  found: true;
  id: string;
  folio: string;
  numero_rollo: string | null;
  hora_muestreo: string;
  capturado_at: string;
  turno: string;
  estado: string;
  dictamen: string | null;
  observaciones_generales: string;
  jefe_maquina: string | null;
  operador: string | null;
  prensero: string | null;
  analista: string | null;
  producto: { codigo: string; nombre: string };
  maquina: { codigo: string; nombre: string };
  planta: { codigo: string; nombre: string };
  mediciones: TraceMedicion[];
} | { found: false };

export const getMuestraTrace = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }): Promise<TraceMuestra> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: m, error } = await supabaseAdmin
      .from("muestras_calidad")
      .select(
        `id, hora_muestreo, capturado_at, turno, estado, dictamen, numero_rollo,
         observaciones_generales, jefe_maquina, operador, prensero, analista,
         producto:productos(codigo, nombre),
         maquina:maquinas(codigo, nombre),
         planta:plantas(codigo, nombre),
         orden:ordenes_fabricacion(folio),
         mediciones:mediciones_calidad(
           valor, min_snapshot, objetivo_snapshot, max_snapshot, estado, variable_clave,
           variables_calidad(etiqueta, unidad, orden)
         )`,
      )
      .eq("id", data.id)
      .maybeSingle();

    if (error || !m) return { found: false };

    type MedRow = {
      valor: number;
      min_snapshot: number;
      objetivo_snapshot: number;
      max_snapshot: number;
      estado: string;
      variable_clave: string;
      variables_calidad: { etiqueta: string; unidad: string | null; orden: number } | null;
    };
    const mediciones: TraceMedicion[] = ((m.mediciones ?? []) as MedRow[])
      .map((r) => ({
        clave: r.variable_clave,
        etiqueta: r.variables_calidad?.etiqueta ?? r.variable_clave,
        unidad: r.variables_calidad?.unidad ?? "",
        valor: Number(r.valor),
        min: Number(r.min_snapshot),
        objetivo: Number(r.objetivo_snapshot),
        max: Number(r.max_snapshot),
        estado: r.estado,
      }))
      .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta));

    const folio = (m as { orden?: { folio?: string } | null }).orden?.folio ?? `CAL-${m.id.slice(0, 8)}`;

    return {
      found: true,
      id: m.id,
      folio,
      numero_rollo: m.numero_rollo,
      hora_muestreo: m.hora_muestreo,
      capturado_at: m.capturado_at,
      turno: m.turno,
      estado: m.estado,
      dictamen: m.dictamen,
      observaciones_generales: m.observaciones_generales ?? "",
      jefe_maquina: (m as { jefe_maquina?: string | null }).jefe_maquina ?? null,
      operador: (m as { operador?: string | null }).operador ?? null,
      prensero: (m as { prensero?: string | null }).prensero ?? null,
      analista: (m as { analista?: string | null }).analista ?? null,
      producto: (m.producto as { codigo: string; nombre: string }) ?? { codigo: "—", nombre: "—" },
      maquina: (m.maquina as { codigo: string; nombre: string }) ?? { codigo: "—", nombre: "—" },
      planta: (m.planta as { codigo: string; nombre: string }) ?? { codigo: "—", nombre: "—" },
      mediciones,
    };
  });
