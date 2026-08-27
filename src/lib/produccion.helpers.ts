// Helpers, esquemas y constantes de Producción.
// Viven fuera de *.functions.ts porque el splitting de server functions
// elimina los hermanos runtime del módulo y rompe el handler en runtime.
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type SB = SupabaseClient<Database>;

// ------------------------- Helpers -------------------------

/**
 * Variables sin tope superior crítico (ej. Blancura R457: a mayor mejor).
 * Mantener sincronizado con src/lib/qc.functions.ts → esVariableSinTopeSuperior.
 */
export function esVariableSinTopeSuperior(clave?: string | null): boolean {
  if (!clave) return false;
  const k = clave.toLowerCase().replace(/[\s_-]/g, "");
  if (k === "tensionmd" || k === "tensioncd") return true;
  return k.includes("blancura") || k.includes("r457");
}

/**
 * Recalcula el estado de una medición en lectura, aplicando la regla vigente
 * (incluye excepción de variables sin tope superior). Si no hay min/max/valor
 * suficientes, conserva el estado almacenado.
 */
export function recomputarEstadoMedicion(
  clave: string | null | undefined,
  valor: number | null | undefined,
  min: number | null | undefined,
  max: number | null | undefined,
  estadoAlmacenado: string | null | undefined,
): string {
  if (valor == null || !Number.isFinite(valor)) return estadoAlmacenado ?? "pendiente";
  if (min == null || max == null) return estadoAlmacenado ?? "pendiente";
  const sinTope = esVariableSinTopeSuperior(clave);
  const rango = max - min;
  const tol = Math.abs(rango) * 0.2;
  if (valor < min - tol) return "fuera_rango_critico";
  if (!sinTope && valor > max + tol) return "fuera_rango_critico";
  if (valor < min) return "no_conforme";
  if (!sinTope && valor > max) return "no_conforme";
  return "conforme";
}


export const ROLES_OPERATIVOS = ["capturista", "calidad", "gerente_general", "administrador"] as const;
export const ROLES_ADMIN = ["gerente_general", "administrador"] as const;

export async function getUserRoles(sb: SB, userId: string): Promise<string[]> {
  const { data, error } = await sb.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(`No se pudieron leer roles: ${error.message}`);
  return (data ?? []).map((r) => r.role as string);
}

export function requireAnyRole(userRoles: string[], allowed: readonly string[]) {
  if (!userRoles.some((r) => allowed.includes(r))) {
    throw new Error(`Acceso denegado. Roles requeridos: ${allowed.join(", ")}`);
  }
}

export async function generarFolio(sb: SB): Promise<string> {
  const today = new Date();
  const yyyy = today.getUTCFullYear();
  const mm = String(today.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(today.getUTCDate()).padStart(2, "0");
  const prefix = `OF-${yyyy}${mm}${dd}`;

  const { count, error } = await sb
    .from("ordenes_fabricacion")
    .select("id", { count: "exact", head: true })
    .like("folio", `${prefix}-%`);
  if (error) throw new Error(`Error generando folio: ${error.message}`);

  const next = String((count ?? 0) + 1).padStart(4, "0");
  return `${prefix}-${next}`;
}

export async function getEspecificacionVigente(sb: SB, productoId: string): Promise<string> {
  const { data, error } = await sb
    .from("producto_especificaciones")
    .select("id")
    .eq("producto_id", productoId)
    .eq("estado", "vigente")
    .order("vigente_desde", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Error leyendo especificación: ${error.message}`);
  if (!data) {
    throw new Error(
      "El producto no tiene una especificación vigente. Aprueba una versión antes de iniciar producción.",
    );
  }
  return data.id;
}

export async function upsertEstadoMaquina(
  sb: SB,
  maquinaId: string,
  patch: {
    estado: Database["public"]["Enums"]["maquina_estado"];
    orden_activa_id?: string | null;
    paro_activo_id?: string | null;
    actualizado_por: string;
  },
) {
  const { error } = await sb.from("maquina_estado_actual").upsert(
    {
      maquina_id: maquinaId,
      estado: patch.estado,
      orden_activa_id: patch.orden_activa_id ?? null,
      paro_activo_id: patch.paro_activo_id ?? null,
      ultimo_cambio: new Date().toISOString(),
      actualizado_por: patch.actualizado_por,
    },
    { onConflict: "maquina_id" },
  );
  if (error) throw new Error(`No se pudo actualizar estado de máquina: ${error.message}`);
}

export const crearOrdenSchema = z.object({
  producto_id: z.string().uuid(),
  maquina_id: z.string().uuid(),
  planta_id: z.string().uuid(),
  turno: z.string().min(1).max(30).optional(),
  unidad_objetivo: z.enum(["kg", "rollos", "ambos"]).default("kg"),
  objetivo_kg: z.number().positive().optional(),
  objetivo_rollos: z.number().int().positive().optional(),
  fecha_programada: z.string().datetime().optional(),
  notas: z.string().max(1000).optional(),
});

export const idSchema = z.object({ orden_id: z.string().uuid() });

export const pausarSchema = z.object({
  orden_id: z.string().uuid(),
  tipo_paro_id: z.string().uuid(),
  descripcion: z.string().max(1000).optional(),
});

export const cerrarSchema = z.object({
  orden_id: z.string().uuid(),
  producido_kg: z.number().nonnegative().optional(),
  producido_rollos: z.number().int().nonnegative().optional(),
  notas: z.string().max(1000).optional(),
});

export const cancelarSchema = z.object({
  orden_id: z.string().uuid(),
  motivo: z.string().min(3).max(500),
});

export const rangoEnum = z.enum(["turno", "dia", "semana", "mes", "año", "todo"]).default("turno");

export function rangoToDesde(
  r: "turno" | "dia" | "semana" | "mes" | "año" | "todo",
  turnos?: {
    turno1_inicio: string; turno1_fin: string;
    turno2_inicio: string; turno2_fin: string;
    turno3_inicio: string; turno3_fin: string;
  } | null,
): string | null {
  const now = new Date();
  const H = 3600_000;
  switch (r) {
    case "turno": {
      // Lee la configuración real de turnos (app_settings) para que la
      // ventana coincida con la del Visor del Operador.
      const TZ = "America/Mexico_City";
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TZ,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).formatToParts(now);
      const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
      const y = get("year"); const m = get("month"); let d = get("day");
      const hLocal = get("hour"); const minLocal = get("minute");
      const curMin = hLocal * 60 + minLocal;

      const hhmmToMin = (s?: string | null): number | null => {
        if (!s) return null;
        const [hh, mm] = String(s).split(":").map((x) => Number(x));
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
        return hh * 60 + mm;
      };

      const ranges = turnos
        ? [
            { ini: turnos.turno1_inicio, fin: turnos.turno1_fin },
            { ini: turnos.turno2_inicio, fin: turnos.turno2_fin },
            { ini: turnos.turno3_inicio, fin: turnos.turno3_fin },
          ]
        : [
            { ini: "07:00", fin: "15:00" },
            { ini: "15:00", fin: "23:00" },
            { ini: "23:00", fin: "07:00" },
          ];

      let hStart = 6;
      let mStart = 0;
      let crossedMidnight = false;
      for (const rg of ranges) {
        const ini = hhmmToMin(rg.ini);
        const fin = hhmmToMin(rg.fin);
        if (ini === null || fin === null) continue;
        const inRange = ini <= fin
          ? curMin >= ini && curMin < fin
          : curMin >= ini || curMin < fin;
        if (inRange) {
          hStart = Math.floor(ini / 60);
          mStart = ini % 60;
          if (ini > fin && curMin < fin) crossedMidnight = true;
          break;
        }
      }
      if (crossedMidnight) {
        const yesterday = new Date(Date.UTC(y, m - 1, d) - 24 * H);
        d = yesterday.getUTCDate();
      }

      const offsetMin = (() => {
        const local = new Date(Date.UTC(y, m - 1, d, hStart, mStart, 0));
        const asMX = new Intl.DateTimeFormat("en-US", {
          timeZone: TZ, hour: "2-digit", hourCycle: "h23",
        }).format(local);
        const shown = Number(asMX);
        return (shown - hStart) * 60;
      })();
      const startUTC = new Date(Date.UTC(y, m - 1, d, hStart, mStart, 0) - offsetMin * 60_000);
      return startUTC.toISOString();
    }
    case "dia": return new Date(now.getTime() - 24 * H).toISOString();
    case "semana": return new Date(now.getTime() - 7 * 24 * H).toISOString();
    case "mes": return new Date(now.getTime() - 30 * 24 * H).toISOString();
    case "año": return new Date(now.getTime() - 365 * 24 * H).toISOString();
    default: return null;
  }
}



/** Turno vigente ("1"|"2"|"3") según el reloj de planta y app_settings. */
export function turnoActualPorReloj(
  turnos?: {
    turno1_inicio: string; turno1_fin: string;
    turno2_inicio: string; turno2_fin: string;
    turno3_inicio: string; turno3_fin: string;
  } | null,
): string | null {
  const TZ = "America/Mexico_City";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const curMin = get("hour") * 60 + get("minute");
  const toMin = (s?: string | null): number | null => {
    if (!s) return null;
    const [hh, mm] = String(s).split(":").map(Number);
    return Number.isFinite(hh) && Number.isFinite(mm) ? hh * 60 + mm : null;
  };
  const ranges = [
    { id: "1", ini: turnos?.turno1_inicio ?? "07:00", fin: turnos?.turno1_fin ?? "15:00" },
    { id: "2", ini: turnos?.turno2_inicio ?? "15:00", fin: turnos?.turno2_fin ?? "23:00" },
    { id: "3", ini: turnos?.turno3_inicio ?? "23:00", fin: turnos?.turno3_fin ?? "07:00" },
  ];
  for (const r of ranges) {
    const ini = toMin(r.ini);
    const fin = toMin(r.fin);
    if (ini === null || fin === null) continue;
    const inRange = ini <= fin ? curMin >= ini && curMin < fin : curMin >= ini || curMin < fin;
    if (inRange) return r.id;
  }
  return null;
}

export const maquinasInputSchema = z.object({ rango: rangoEnum.optional() }).optional();

export const histSchema = z.object({ maquina_id: z.string().uuid() });

export const detalleSchema = z.object({
  orden_id: z.string().uuid(),
  rango: z.enum(["dia", "semana", "mes", "año", "todo"]).default("todo"),
});

export const detalleRolloSchema = z.object({ muestra_id: z.string().uuid() });

export const rollosSchema = z.object({
  maquina_id: z.string().uuid(),
  rango: rangoEnum.optional(),
});

export const buscarRolloSchema = z.object({
  q: z.string().trim().min(1).max(64),
});
