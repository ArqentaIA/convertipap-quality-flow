// =====================================================================
// Edición de bobina madre (Jefe de Calidad) — funciones de servidor.
//
// Reglas:
//  - Solo usuarios dados de alta en qc_edicion_permisos (por máquina).
//  - La edición de datos sigue pasando por qc_editar_rollo (ventana 24 h,
//    motivo obligatorio, trazabilidad completa, un evento por guardado).
//  - La reimpresión de etiqueta NO genera evento ni requiere motivo.
//  - Los filtros de planta/máquina se validan en servidor: nunca se
//    confía en lo que envía el cliente.
// =====================================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SB = typeof import("@/integrations/supabase/client").supabase;

/** Máquinas para las que el usuario actual tiene permiso de edición. */
async function misMaquinasEdicion(sb: SB, userId: string): Promise<string[]> {
  const { data: prof } = await sb
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  const email = (prof?.email ?? "").toLowerCase();
  if (!email) return [];
  const { data: perms } = await sb
    .from("qc_edicion_permisos")
    .select("maquina_codigo")
    .eq("activo", true)
    .ilike("email", email);
  return [...new Set((perms ?? []).map((p) => p.maquina_codigo as string))];
}

/** ¿El usuario actual puede usar el módulo de Edición de bobina madre? */
export const puedeUsarEdicionBobina = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const maquinas = await misMaquinasEdicion(
      context.supabase as SB,
      context.userId,
    );
    return { puede: maquinas.length > 0, maquinas };
  });

export type BobinaEditable = {
  muestra_id: string;
  numero_rollo: string;
  maquina: string;
  planta: string;
  planta_codigo: string;
  capturado_at: string;
  turno: string;
  estatus: string;
  folio_orden: string;
  producto: string;
  /** true si aún está dentro de la ventana de edición de 24 h. */
  dentro_ventana: boolean;
  expira_at: string;
};

/** Busca bobinas capturadas en las máquinas autorizadas del usuario. */
export const buscarBobinasEditables = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        folio: z.string().trim().max(64).optional(),
        fecha: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        maquina: z.string().trim().max(20).optional(),
        planta: z.string().trim().max(10).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<BobinaEditable[]> => {
    const sb = context.supabase as SB;
    const maquinas = await misMaquinasEdicion(sb, context.userId);
    if (maquinas.length === 0) return [];

    // Seguridad en servidor: si el cliente pide una máquina no autorizada,
    // se ignora el filtro y se devuelve vacío (no se confía en el cliente).
    if (data.maquina && !maquinas.includes(data.maquina)) return [];

    const { data: rows, error } = await sb
      .from("muestras_calidad")
      .select(
        `id, numero_rollo, capturado_at, hora_muestreo, turno,
         dictamen, estatus_liberacion,
         maquinas(codigo, plantas(nombre, codigo)),
         ordenes_fabricacion(folio),
         productos!muestras_calidad_producto_id_fkey(nombre)`,
      )
      .order("capturado_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const ahora = Date.now();
    const lista = (rows ?? [])
      .map((m) => {
        const mq = (m as unknown as Record<string, never>)["maquinas"] as
          | { codigo?: string; plantas?: { nombre?: string; codigo?: string } }
          | null;
        const codigo = mq?.codigo ?? "";
        if (!maquinas.includes(codigo)) return null;
        const ord = (m as unknown as Record<string, never>)["ordenes_fabricacion"] as
          | { folio?: string }
          | null;
        const cap = (m.capturado_at ?? m.hora_muestreo) as string;
        const expira = new Date(new Date(cap).getTime() + 24 * 3600 * 1000);
        return {
          muestra_id: m.id as string,
          numero_rollo: (m.numero_rollo as string) ?? "—",
          maquina: codigo,
          planta: mq?.plantas?.nombre ?? "—",
          planta_codigo: mq?.plantas?.codigo ?? "",
          capturado_at: cap,
          turno: (m.turno as string) ?? "—",
          estatus:
            ((m.estatus_liberacion ?? m.dictamen) as string) ?? "pendiente",
          folio_orden: ord?.folio ?? "—",
          producto:
            ((m as unknown as Record<string, never>)["productos"] as { nombre?: string } | null)
              ?.nombre ?? "—",
          dentro_ventana: ahora <= expira.getTime(),
          expira_at: expira.toISOString(),
        } satisfies BobinaEditable;
      })
      .filter((b): b is BobinaEditable => b !== null);

    return lista.filter((b) => {
      if (data.maquina && b.maquina !== data.maquina) return false;
      if (data.planta && b.planta_codigo !== data.planta) return false;
      if (
        data.folio &&
        !b.numero_rollo.toLowerCase().includes(data.folio.toLowerCase()) &&
        !b.folio_orden.toLowerCase().includes(data.folio.toLowerCase())
      )
        return false;
      if (data.fecha) {
        // Día operativo: de 07:00 del día a 07:00 del siguiente (hora México).
        const cap = new Date(b.capturado_at);
        const mx = new Date(
          cap.toLocaleString("en-US", { timeZone: "America/Mexico_City" }),
        );
        const dia = new Date(mx);
        if (mx.getHours() < 7) dia.setDate(dia.getDate() - 1);
        const ymd = `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, "0")}-${String(dia.getDate()).padStart(2, "0")}`;
        if (ymd !== data.fecha) return false;
      }
      return true;
    });
  });

export type EtiquetaBobinaPayload = {
  muestraId: string;
  folio: string;
  fecha: string;
  numeroRollo: string;
  maquinaCodigo: string;
  maquinaNombre: string;
  productoCodigo: string;
  productoNombre: string;
  observacionesGenerales: string;
  mediciones: {
    clave: string;
    etiqueta: string;
    valor: number | null;
    unidad: string;
    min: number;
    max: number;
    fueraSpec: boolean;
  }[];
  estatus:
    | "CONFORME"
    | "NO CONFORME"
    | "LIBERADO"
    | "LIBERADO CON CONCESIÓN"
    | "CONDICIONAL"
    | "LIBERADO C/JUSTIF"
    | "PENDIENTE";
  estatusLiberacion: "L" | "NC" | "C" | null;
  defectos: string[];
  turno: string | null;
  jefeMaquina: string | null;
  operador: string | null;
  analista: string | null;
  plantaCodigo: string | null;
  skuSap: string | null;
  loteLogistico: string | null;
};

/**
 * Datos actuales de la bobina para imprimir/reimprimir la etiqueta de
 * liberación. Reimpresión: no genera evento ni requiere motivo ni ventana
 * de 24 h, pero sí exige permiso de edición sobre la máquina.
 */
export const getEtiquetaBobina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ muestra_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<EtiquetaBobinaPayload> => {
    const sb = context.supabase as SB;
    const maquinas = await misMaquinasEdicion(sb, context.userId);
    if (maquinas.length === 0)
      throw new Error("No tiene autorización para imprimir etiquetas de bobinas.");

    const { data: m, error } = await sb
      .from("muestras_calidad")
      .select(
        `id, numero_rollo, hora_muestreo, turno, operador, jefe_maquina, analista,
         dictamen, estatus_liberacion, defectos, observaciones_generales,
         lote_logistico, sku_sap, variables_snapshot_json,
         maquinas(codigo, nombre, plantas(codigo)),
         ordenes_fabricacion(folio),
         productos!muestras_calidad_producto_id_fkey(nombre, codigo),
         mediciones_calidad(variable_clave, valor, min_snapshot, max_snapshot)`,
      )
      .eq("id", data.muestra_id)
      .single();
    if (error) throw new Error(error.message);

    const mq = (m as unknown as Record<string, never>)["maquinas"] as
      | { codigo?: string; nombre?: string; plantas?: { codigo?: string } }
      | null;
    const codigo = mq?.codigo ?? "";
    if (!maquinas.includes(codigo))
      throw new Error("No tiene autorización sobre la máquina de esta bobina.");

    const snap = (m.variables_snapshot_json ?? {}) as Record<
      string,
      { min?: number; obj?: number; max?: number; unidad?: string; etiqueta?: string }
    >;
    const mediciones = (
      ((m as unknown as Record<string, never>)["mediciones_calidad"] as
        | {
            variable_clave: string;
            valor: number | null;
            min_snapshot: number | null;
            max_snapshot: number | null;
          }[]
        | null) ?? []
    ).map((x) => {
      const s = snap[x.variable_clave] ?? {};
      const min = x.min_snapshot ?? s.min ?? 0;
      const max = x.max_snapshot ?? s.max ?? 0;
      return {
        clave: x.variable_clave,
        etiqueta: s.etiqueta ?? x.variable_clave,
        valor: x.valor === null ? null : Number(x.valor),
        unidad: s.unidad ?? "",
        min,
        max,
        fueraSpec:
          x.valor !== null &&
          ((min !== 0 && Number(x.valor) < min) ||
            (max !== 0 && Number(x.valor) > max)),
      };
    });

    const dictamen = (m.dictamen as string | null) ?? null;
    const estatusLib = (m.estatus_liberacion as string | null) ?? null;
    const estatus: EtiquetaBobinaPayload["estatus"] =
      dictamen === "liberada" || estatusLib === "L"
        ? "LIBERADO"
        : dictamen === "concesion" || estatusLib === "C"
          ? "LIBERADO CON CONCESIÓN"
          : dictamen === "rechazada" || estatusLib === "NC"
            ? "NO CONFORME"
            : "PENDIENTE";

    const prod = (m as unknown as Record<string, never>)["productos"] as
      | { nombre?: string; codigo?: string }
      | null;
    const ord = (m as unknown as Record<string, never>)["ordenes_fabricacion"] as
      | { folio?: string }
      | null;

    const cap = new Date(m.hora_muestreo as string);
    const fecha = cap.toLocaleDateString("es-MX", {
      timeZone: "America/Mexico_City",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    return {
      muestraId: m.id as string,
      folio: ord?.folio ?? "—",
      fecha,
      numeroRollo: (m.numero_rollo as string) ?? "—",
      maquinaCodigo: codigo,
      maquinaNombre: mq?.nombre ?? codigo,
      productoCodigo: prod?.codigo ?? "—",
      productoNombre: prod?.nombre ?? "—",
      observacionesGenerales: (m.observaciones_generales as string) ?? "",
      mediciones,
      estatus,
      estatusLiberacion:
        estatusLib === "L" || estatusLib === "NC" || estatusLib === "C"
          ? estatusLib
          : dictamen === "liberada"
            ? "L"
            : dictamen === "concesion"
              ? "C"
              : dictamen === "rechazada"
                ? "NC"
                : null,
      defectos: ((m.defectos ?? []) as string[]).filter(Boolean),
      turno: (m.turno as string) ?? null,
      jefeMaquina: (m.jefe_maquina as string) ?? null,
      operador: (m.operador as string) ?? null,
      analista: (m.analista as string) ?? null,
      plantaCodigo: mq?.plantas?.codigo ?? null,
      skuSap: (m.sku_sap as string) ?? null,
      loteLogistico: (m.lote_logistico as string) ?? null,
    };
  });
