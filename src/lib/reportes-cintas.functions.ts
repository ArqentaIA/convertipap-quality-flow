// =============================================================================
// Reportes de Cintas — server functions (solo lectura)
//
// Regla canónica de FECHA y TURNO (no se crea una regla nueva):
//   • Fecha operativa  → pesajes_cintas_lotes.fecha_produccion
//     (mismo campo oficial usado por el Reporte Mensual de Bobinadoras)
//   • Turno            → pesajes_cintas_lotes.datos_calidad_snapshot->>'turno'
//     (snapshot operativo tomado de muestras_calidad.turno al crear el lote,
//      el cual proviene del resolvedor de turno vigente del sistema, TZ MX)
//
// Autorización: requireSupabaseAuth + verificación de módulo `pesaje_cintas`
// mediante la función can_access_module (RLS + control de módulo en servidor).
// =============================================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/lib/pesaje-cintas.functions";

export type LoteCintasRow = {
  id: string;
  numero_rollo: string;
  fabricacion: string;
  numero_orden: string | null;
  orden_produccion_id: string | null;
  pesaje_bobina_madre_id: string | null;
  muestra_calidad_id: string | null;
  producto_id: string | null;
  producto_codigo: string | null;
  producto_nombre: string | null;
  conductor_id: string | null;
  conductor_nombre_snapshot: string;
  bobinadora_id: string | null;
  bobinadora_nombre_snapshot: string;
  peso_bobina_madre_neto_kg: number;
  cantidad_cintas: number;
  peso_total_cintas_kg: number;
  peso_pendiente_kg: number;
  merma_kg: number | null;
  merma_porcentaje: number | null;
  merma_real_kg: number | null;
  estado: "abierto" | "finalizado" | "anulado";
  es_manual: boolean;
  fecha_produccion: string | null;
  created_at: string;
  creado_por: string | null;
  finalizado_at: string | null;
  finalizado_por: string | null;
  datos_calidad_snapshot: Json;
};

export type CintaRow = {
  id: string;
  lote_id: string;
  posicion: number;
  uniones: number;
  peso_cinta_kg: number;
  ancho_util: number;
  ancho_util_unidad: string | null;
  observaciones: string | null;
  estado: "registrada" | "sustituida" | "anulada";
  sustituye_a_cinta_id: string | null;
  version_etiqueta: number | null;
  created_at: string;
  creado_por: string | null;
  updated_at: string | null;
  actualizado_por: string | null;
  anulado_por: string | null;
  anulado_at: string | null;
  motivo_anulacion: string | null;
};

export type DatosReporteCintas = {
  fechaInicio: string;
  fechaFin: string;
  turno: string; // "" = todos
  planta: string;
  usuario: string;
  generadoAt: string;
  lotes: LoteCintasRow[];
  cintas: CintaRow[];
};

const rangoSchema = z.object({
  fechaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fechaFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  turno: z.string().max(4).optional().nullable(),
});

async function assertAcceso(supabase: {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
}, userId: string) {
  const { data, error } = await supabase.rpc("can_access_module", {
    _user_id: userId,
    _module: "pesaje_cintas",
  });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error("No autorizado para Reportes de Cintas.");
}

async function cargarLotesYCintas(
  supabase: NonNullable<Parameters<typeof Object.keys>[0]> & Record<string, never>,
): Promise<never> {
  throw new Error("unused");
}
void cargarLotesYCintas;

export const getDatosReporteCintas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => rangoSchema.parse(d))
  .handler(async ({ data, context }): Promise<DatosReporteCintas> => {
    await assertAcceso(context.supabase as never, context.userId);
    const turno = (data.turno ?? "").trim();

    let q = context.supabase
      .from("pesajes_cintas_lotes")
      .select("*")
      .gte("fecha_produccion", data.fechaInicio)
      .lte("fecha_produccion", data.fechaFin)
      .neq("estado", "anulado")
      .order("fecha_produccion")
      .order("numero_rollo");
    if (turno) q = q.filter("datos_calidad_snapshot->>turno", "eq", turno);

    const { data: lotes, error } = await q;
    if (error) throw new Error(error.message);

    const filas = (lotes ?? []) as unknown as LoteCintasRow[];
    const ids = filas.map((l) => l.id);
    const cintas = await cintasDeLotes(context.supabase, ids);

    const { data: plantas } = await context.supabase
      .from("plantas").select("nombre").eq("activo", true).order("nombre").limit(1);

    return {
      fechaInicio: data.fechaInicio,
      fechaFin: data.fechaFin,
      turno,
      planta: plantas?.[0]?.nombre ?? "PLANTA TLAXCALA",
      usuario: (context.claims?.["email"] as string | undefined) ?? "—",
      generadoAt: new Date().toISOString(),
      lotes: filas,
      cintas,
    };
  });

type SB = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function cintasDeLotes(supabase: SB, ids: string[]): Promise<CintaRow[]> {
  if (ids.length === 0) return [];
  const out: CintaRow[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data, error } = await supabase
      .from("pesajes_cintas").select("*").in("lote_id", chunk).order("posicion");
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as CintaRow[]));
  }
  return out;
}

async function porLotes(supabase: SB, tabla: string, columna: string, ids: string[], select = "*") {
  if (ids.length === 0) return [] as Record<string, unknown>[];
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data, error } = await supabase.from(tabla).select(select).in(columna, chunk);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Record<string, unknown>[]));
  }
  return out;
}

export type BaseIntegralCintas = DatosReporteCintas & {
  impresiones: Record<string, unknown>[];
  auditoria: Record<string, unknown>[];
  bobinaMadre: Record<string, unknown>[];
  muestras: Record<string, unknown>[];
  mediciones: Record<string, unknown>[];
  bobinadoras: Record<string, unknown>[];
  operarios: Record<string, unknown>[];
  productos: Record<string, unknown>[];
  maquinas: Record<string, unknown>[];
  perfiles: Record<string, unknown>[];
};

export const getBaseIntegralCintas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => rangoSchema.parse(d))
  .handler(async ({ data, context }): Promise<BaseIntegralCintas> => {
    await assertAcceso(context.supabase as never, context.userId);
    const turno = (data.turno ?? "").trim();
    const sb = context.supabase as unknown as SB;

    let q = context.supabase
      .from("pesajes_cintas_lotes")
      .select("*")
      .gte("fecha_produccion", data.fechaInicio)
      .lte("fecha_produccion", data.fechaFin)
      .order("fecha_produccion")
      .order("numero_rollo");
    if (turno) q = q.filter("datos_calidad_snapshot->>turno", "eq", turno);
    const { data: lotes, error } = await q;
    if (error) throw new Error(error.message);

    const filas = (lotes ?? []) as unknown as LoteCintasRow[];
    const ids = filas.map((l) => l.id);
    const cintas = await cintasDeLotes(sb, ids);

    const [impresiones, auditoria] = await Promise.all([
      porLotes(sb, "impresiones_etiquetas_cintas", "lote_id", ids),
      porLotes(sb, "pesajes_cintas_auditoria", "lote_id", ids),
    ]);

    const pesajeIds = Array.from(new Set(filas.map((l) => l.pesaje_bobina_madre_id).filter((v): v is string => !!v)));
    const muestraIds = Array.from(new Set(filas.map((l) => l.muestra_calidad_id).filter((v): v is string => !!v)));
    const productoIds = Array.from(new Set(filas.map((l) => l.producto_id).filter((v): v is string => !!v)));
    const bobinadoraIds = Array.from(new Set(filas.map((l) => l.bobinadora_id).filter((v): v is string => !!v)));
    const conductorIds = Array.from(new Set(filas.map((l) => l.conductor_id).filter((v): v is string => !!v)));

    const [bobinaMadre, muestras, mediciones, productos, bobinadoras, operarios] = await Promise.all([
      porLotes(sb, "pesajes_bobina_madre", "id", pesajeIds),
      porLotes(sb, "muestras_calidad", "id", muestraIds,
        "id, numero_rollo, producto_id, maquina_id, turno, hora_muestreo, estatus_liberacion, estado"),
      porLotes(sb, "mediciones_calidad", "muestra_id", muestraIds,
        "id, muestra_id, variable_clave, valor, estado, created_at"),
      porLotes(sb, "productos", "id", productoIds, "id, codigo, nombre, gramaje, capas"),
      porLotes(sb, "catalogo_bobinadoras", "id", bobinadoraIds, "id, codigo, nombre, activo"),
      porLotes(sb, "operarios", "id", conductorIds, "id, nombre, puesto, activo"),
    ]);

    const maquinaIds = Array.from(new Set([
      ...bobinaMadre.map((r) => r["maquina_id"] as string | null),
      ...muestras.map((r) => r["maquina_id"] as string | null),
    ].filter((v): v is string => !!v)));
    const userIds = Array.from(new Set([
      ...filas.map((l) => l.creado_por),
      ...filas.map((l) => l.finalizado_por),
      ...cintas.map((c) => c.creado_por),
    ].filter((v): v is string => !!v)));

    const [maquinas, perfiles] = await Promise.all([
      porLotes(sb, "maquinas", "id", maquinaIds, "id, codigo, nombre, area"),
      porLotes(sb, "profiles", "id", userIds, "id, nombre, email, rol_visible"),
    ]);

    const { data: plantas } = await context.supabase
      .from("plantas").select("nombre").eq("activo", true).order("nombre").limit(1);

    return {
      fechaInicio: data.fechaInicio,
      fechaFin: data.fechaFin,
      turno,
      planta: plantas?.[0]?.nombre ?? "PLANTA TLAXCALA",
      usuario: (context.claims?.["email"] as string | undefined) ?? "—",
      generadoAt: new Date().toISOString(),
      lotes: filas,
      cintas,
      impresiones,
      auditoria,
      bobinaMadre,
      muestras,
      mediciones,
      bobinadoras,
      operarios,
      productos,
      maquinas,
      perfiles,
    };
  });
