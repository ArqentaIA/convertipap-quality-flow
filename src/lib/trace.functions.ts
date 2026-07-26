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
  peso_kg: number | null;
  hora_muestreo: string;
  capturado_at: string;
  turno: string;
  estado: string;
  estado_sap: string | null;
  numero_orden_sap: string | null;
  dictamen: string | null;
  estatus_liberacion: string | null;
  liberado_con_justificacion: boolean;
  liberacion_justificacion: string | null;
  defectos: string[];
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
        `id, orden_id, hora_muestreo, capturado_at, turno, estado, dictamen, numero_rollo,
         estatus_liberacion, defectos,
         liberado_con_justificacion, liberacion_justificacion,
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
    const pesoDesdeMedicion = mediciones.find((med) => {
      const etiqueta = med.etiqueta.trim().toLowerCase();
      return etiqueta === "peso" || etiqueta === "peso del rollo" || etiqueta === "peso rollo";
    });
    const ordenId = (m as unknown as { orden_id?: string }).orden_id;
    const numero = Number(m.numero_rollo);
    let peso_kg: number | null = null;
    let estado_sap: string | null = null;
    if (ordenId && Number.isFinite(numero)) {
      const { data: rp } = await supabaseAdmin
        .from("rollos_producidos")
        .select("peso_kg")
        .eq("orden_id", ordenId)
        .eq("numero", numero)
        .maybeSingle();
      if (rp?.peso_kg != null) peso_kg = Number(rp.peso_kg);
    }
    if (peso_kg == null && pesoDesdeMedicion?.valor != null && Number.isFinite(pesoDesdeMedicion.valor)) {
      peso_kg = Number(pesoDesdeMedicion.valor);
    }

    // Estado SAP: buscar vía pesaje vinculado → orden_produccion_id → ordenes_produccion.estado_sap.
    // Fallback: por numero_rollo + maquina_id si la muestra aún no tiene pesaje_id.
    {
      const muestraAny = m as unknown as { pesaje_id?: string | null; maquina_id?: string | null };
      let pesajeId: string | null = muestraAny.pesaje_id ?? null;
      if (!pesajeId && m.numero_rollo && muestraAny.maquina_id) {
        const { data: pRow } = await supabaseAdmin
          .from("pesajes_bobina_madre")
          .select("id, orden_produccion_id")
          .eq("numero_rollo", m.numero_rollo)
          .eq("maquina_id", muestraAny.maquina_id)
          .order("fecha_hora_pesaje", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (pRow?.orden_produccion_id) {
          const { data: opRow } = await supabaseAdmin
            .from("ordenes_produccion")
            .select("estado_sap")
            .eq("id", pRow.orden_produccion_id)
            .maybeSingle();
          estado_sap = opRow?.estado_sap ?? null;
        }
      } else if (pesajeId) {
        const { data: pRow } = await supabaseAdmin
          .from("pesajes_bobina_madre")
          .select("orden_produccion_id")
          .eq("id", pesajeId)
          .maybeSingle();
        if (pRow?.orden_produccion_id) {
          const { data: opRow } = await supabaseAdmin
            .from("ordenes_produccion")
            .select("estado_sap")
            .eq("id", pRow.orden_produccion_id)
            .maybeSingle();
          estado_sap = opRow?.estado_sap ?? null;
        }
      }
    }

    return {
      found: true,
      id: m.id,
      folio,
      numero_rollo: m.numero_rollo,
      peso_kg,
      hora_muestreo: m.hora_muestreo,
      capturado_at: m.capturado_at,
      turno: m.turno,
      estado: m.estado,
      estado_sap,
      dictamen: m.dictamen,
      estatus_liberacion: (m as { estatus_liberacion?: string | null }).estatus_liberacion ?? null,
      liberado_con_justificacion: !!(m as { liberado_con_justificacion?: boolean }).liberado_con_justificacion,
      liberacion_justificacion: (m as { liberacion_justificacion?: string | null }).liberacion_justificacion ?? null,
      defectos: ((m as { defectos?: string[] | null }).defectos ?? []) as string[],
      observaciones_generales: m.observaciones_generales ?? "",
      // PII enmascarada en endpoint público: no exponer nombres de personal.
      // La trazabilidad técnica (folio, rollo, mediciones, dictamen) se mantiene.
      jefe_maquina: null,
      operador: null,
      prensero: null,
      analista: null,
      producto: (m.producto as { codigo: string; nombre: string }) ?? { codigo: "—", nombre: "—" },
      maquina: (m.maquina as { codigo: string; nombre: string }) ?? { codigo: "—", nombre: "—" },
      planta: (m.planta as { codigo: string; nombre: string }) ?? { codigo: "—", nombre: "—" },
      mediciones,
    };
  });
