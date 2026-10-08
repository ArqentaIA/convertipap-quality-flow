// =====================================================================
// REPORTE DE BOBINAS EDITADAS — funciones de servidor.
//
//  - Filtra por fecha/hora de EDICIÓN (created_at de qc_ediciones_rollo),
//    no por fecha de producción del rollo.
//  - Día operativo: 07:00 del día (inclusivo) → 07:00 del día siguiente
//    (exclusivo). Mes operativo: 07:00 del día 1 → 07:00 del día 1 del
//    mes siguiente. Siempre inicio inclusivo / fin exclusivo, zona
//    America/Mexico_City, formato 24 h.
//  - Solo usuarios con permiso de edición (qc_edicion_permisos) y solo
//    sobre sus máquinas autorizadas; la planta se deriva en servidor.
// =====================================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { timeMX } from "./reporte-fuera-turno.dates";
import { fechaHoraMX, fechaCortoMX } from "./format";

type SB = typeof import("@/integrations/supabase/client").supabase;

const VENTANA_INICIO = "07";

/** Ventana operativa [inicio inclusivo, fin exclusivo) en ISO UTC. */
export function ventanaOperativa(mode: "dia" | "mes", fecha: string) {
  const first = mode === "mes" ? `${fecha.slice(0, 7)}-01` : fecha;
  const [y, m, d] = first.split("-").map(Number);
  const end =
    mode === "mes"
      ? `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`
      : (() => {
          const dt = new Date(Date.UTC(y, m - 1, d + 1));
          return dt.toISOString().slice(0, 10);
        })();
  return {
    start: timeMX(first, VENTANA_INICIO).toISOString(),
    end: timeMX(end, VENTANA_INICIO).toISOString(),
    inicioMX: `${fechaCortoMX(first)} 07:00`,
    finMX: `${fechaCortoMX(end)} 07:00`,
  };
}

async function maquinasPermitidas(sb: SB, userId: string): Promise<string[]> {
  // El administrador tiene acceso libre: ve las ediciones de todas las máquinas.
  const { data: esAdmin } = await sb.rpc("has_role", {
    _user_id: userId,
    _role: "administrador",
  });
  if (esAdmin) {
    const { data: mqs } = await sb.from("maquinas").select("codigo");
    return [...new Set((mqs ?? []).map((m) => m.codigo as string))];
  }
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

export type BobinaEditadaCampo = {
  campo: string;
  valorAnterior: string;
  valorNuevo: string;
};

export type BobinaEditadaEvento = {
  eventoId: string;
  muestraId: string;
  folio: string;
  maquina: string;
  planta: string;
  fechaProduccion: string;
  turnoProduccion: string;
  usuario: string;
  motivo: string;
  editadoAt: string;
  editadoMX: string;
  diaOperativo: string;
  campos: BobinaEditadaCampo[];
};

export type ReporteBobinasEditadas = {
  periodo: string;
  inicioMX: string;
  finMX: string;
  zonaHoraria: string;
  enCurso: boolean;
  resumen: {
    bobinasDistintas: number;
    eventos: number;
    porMaquina: { maquina: string; bobinas: number; eventos: number }[];
  };
  eventos: BobinaEditadaEvento[];
};

export const getReporteBobinasEditadas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        mode: z.enum(["dia", "mes"]),
        fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        planta: z.string().trim().max(10).optional(),
        maquina: z.string().trim().max(20).optional(),
        usuario: z.string().trim().max(120).optional(),
        folio: z.string().trim().max(64).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<ReporteBobinasEditadas> => {
    const sb = context.supabase as SB;
    const permitidas = await maquinasPermitidas(sb, context.userId);
    const win = ventanaOperativa(data.mode, data.fecha);
    const base: ReporteBobinasEditadas = {
      periodo: data.fecha,
      inicioMX: win.inicioMX,
      finMX: win.finMX,
      zonaHoraria: "America/Mexico_City",
      enCurso: Date.now() < new Date(win.end).getTime(),
      resumen: { bobinasDistintas: 0, eventos: 0, porMaquina: [] },
      eventos: [],
    };
    if (permitidas.length === 0) return base;
    if (data.maquina && !permitidas.includes(data.maquina)) return base;

    let q = sb
      .from("qc_ediciones_rollo")
      .select(
        `id, evento_id, muestra_id, numero_rollo, maquina_codigo, campo,
         valor_anterior, valor_nuevo, motivo, usuario_email, created_at`,
      )
      .gte("created_at", win.start)
      .lt("created_at", win.end)
      .in("maquina_codigo", data.maquina ? [data.maquina] : permitidas)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (data.usuario) q = q.ilike("usuario_email", `%${data.usuario}%`);
    if (data.folio) q = q.ilike("numero_rollo", `%${data.folio}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Datos de producción de las bobinas (planta, fecha, turno).
    const muestraIds = [...new Set((rows ?? []).map((r) => r.muestra_id as string))];
    const muestraMap = new Map<
      string,
      { planta: string; plantaCodigo: string; fechaProd: string; turno: string }
    >();
    for (let i = 0; i < muestraIds.length; i += 50) {
      const chunk = muestraIds.slice(i, i + 50);
      const { data: ms } = await sb
        .from("muestras_calidad")
        .select(
          `id, hora_muestreo, turno, maquinas(codigo, plantas(nombre, codigo))`,
        )
        .in("id", chunk);
      for (const m of ms ?? []) {
        const mq = (m as unknown as Record<string, never>)["maquinas"] as
          | { codigo?: string; plantas?: { nombre?: string; codigo?: string } }
          | null;
        muestraMap.set(m.id as string, {
          planta: mq?.plantas?.nombre ?? "—",
          plantaCodigo: mq?.plantas?.codigo ?? "",
          fechaProd: fechaCortoMX(m.hora_muestreo as string),
          turno: (m.turno as string) ?? "—",
        });
      }
    }

    // Agrupar por evento: evento_id (nuevo esquema) o llave legada
    // (muestra + usuario + minuto) para registros anteriores al evento_id.
    const grupos = new Map<string, BobinaEditadaEvento>();
    for (const r of rows ?? []) {
      const muestra = muestraMap.get(r.muestra_id as string);
      if (data.planta && muestra?.plantaCodigo !== data.planta) continue;
      const creado = r.created_at as string;
      const key =
        (r.evento_id as string | null) ??
        `legacy:${r.muestra_id}:${r.usuario_email}:${creado.slice(0, 16)}`;
      let ev = grupos.get(key);
      if (!ev) {
        const d = new Date(creado);
        const mx = new Date(
          d.toLocaleString("en-US", { timeZone: "America/Mexico_City" }),
        );
        const dia = new Date(mx);
        if (mx.getHours() < 7) dia.setDate(dia.getDate() - 1);
        ev = {
          eventoId: key,
          muestraId: r.muestra_id as string,
          folio: (r.numero_rollo as string) ?? "—",
          maquina: (r.maquina_codigo as string) ?? "—",
          planta: muestra?.planta ?? "—",
          fechaProduccion: muestra?.fechaProd ?? "—",
          turnoProduccion: muestra?.turno ?? "—",
          usuario: (r.usuario_email as string) ?? "—",
          motivo: (r.motivo as string) ?? "",
          editadoAt: creado,
          editadoMX: fechaHoraMX(creado),
          diaOperativo: `${String(dia.getDate()).padStart(2, "0")}/${String(dia.getMonth() + 1).padStart(2, "0")}/${dia.getFullYear()}`,
          campos: [],
        };
        grupos.set(key, ev);
      }
      ev.campos.push({
        campo: r.campo as string,
        valorAnterior: (r.valor_anterior as string) ?? "—",
        valorNuevo: (r.valor_nuevo as string) ?? "—",
      });
    }

    const eventos = [...grupos.values()].sort((a, b) =>
      b.editadoAt.localeCompare(a.editadoAt),
    );
    const bobinas = new Set(eventos.map((e) => e.muestraId));
    const porMaquina = new Map<string, { bobinas: Set<string>; eventos: number }>();
    for (const e of eventos) {
      const pm = porMaquina.get(e.maquina) ?? { bobinas: new Set(), eventos: 0 };
      pm.bobinas.add(e.muestraId);
      pm.eventos += 1;
      porMaquina.set(e.maquina, pm);
    }

    return {
      ...base,
      resumen: {
        bobinasDistintas: bobinas.size,
        eventos: eventos.length,
        porMaquina: [...porMaquina.entries()]
          .map(([maquina, v]) => ({
            maquina,
            bobinas: v.bobinas.size,
            eventos: v.eventos,
          }))
          .sort((a, b) => a.maquina.localeCompare(b.maquina)),
      },
      eventos,
    };
  });
