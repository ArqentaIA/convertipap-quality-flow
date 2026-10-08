import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolvePlantaScope } from "./planta-scope";
import { readReportIdChunks } from "./report-query-pages";
import { fueraTurnoWindow } from "./reporte-fuera-turno.dates";

const input = z.object({
  mode: z.enum(["dia", "mes"]),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Fecha inválida"),
  planta: z.string().nullish(),
});

export const getReporteFueraTurno = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => input.parse(data))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const access = await sb.rpc("can_access_module", { _user_id: context.userId, _module: "reportes" });
    if (access.error) throw new Error(access.error.message);
    if (!access.data) throw new Error("Sin permiso para consultar reportes");
    const scope = await resolvePlantaScope(sb, context.userId, data.planta);
    if (data.planta && scope.plantaCodigo !== data.planta.toUpperCase()) throw new Error("Planta no autorizada");
    const window = fueraTurnoWindow(data.mode, data.fecha);
    const muestras = await readReportIdChunks(scope.maquinaIds, (ids, from, to) => sb
      .from("muestras_calidad")
      .select("id, numero_rollo, capturado_at, hora_muestreo, turno, sku_sap, producto_id, maquina_id, capturado_por, operador, analista, estatus_liberacion, fuera_de_turno_motivo")
      .in("maquina_id", ids).in("planta_id", scope.plantaIds).eq("fuera_de_turno", true)
      .gte("capturado_at", window.start).lt("capturado_at", window.end)
      .order("capturado_at").order("id").range(from, to));
    const [meds, products, machines, users] = await Promise.all([
      readReportIdChunks(muestras.map((m) => m.id), (ids, from, to) => sb.from("mediciones_calidad")
        .select("muestra_id, variable_clave, valor").in("muestra_id", ids).order("id").range(from, to)),
      readReportIdChunks(muestras.flatMap((m) => m.producto_id ? [m.producto_id] : []), (ids, from, to) => sb.from("productos").select("id, codigo").in("id", ids).order("id").range(from, to)),
      readReportIdChunks(scope.maquinaIds, (ids, from, to) => sb.from("maquinas").select("id, codigo").in("id", ids).order("id").range(from, to)),
      readReportIdChunks(muestras.flatMap((m) => m.capturado_por ? [m.capturado_por] : []), (ids, from, to) => sb.from("profiles").select("id, nombre").in("id", ids).order("id").range(from, to)),
    ]);
    const productMap = new Map(products.map((p) => [p.id, p.codigo]));
    const machineMap = new Map(machines.map((m) => [m.id, m.codigo]));
    const userMap = new Map(users.map((u) => [u.id, u.nombre]));
    const measurements = new Map<string, Record<string, number | null>>();
    for (const m of meds) {
      const values = measurements.get(m.muestra_id) ?? {};
      values[m.variable_clave] = m.valor == null ? null : Number(m.valor);
      measurements.set(m.muestra_id, values);
    }
    const rows = muestras.map((m) => ({
      id: m.id, rollo: m.numero_rollo, capturadoAt: m.capturado_at, muestreoAt: m.hora_muestreo,
      turno: m.turno, skuSap: m.sku_sap, producto: productMap.get(m.producto_id ?? "") ?? "—",
      maquina: machineMap.get(m.maquina_id) ?? "—", capturadoPor: userMap.get(m.capturado_por ?? "") ?? "—",
      operador: m.operador ?? "—", analista: m.analista ?? "—", estatus: m.estatus_liberacion ?? "—",
      motivo: m.fuera_de_turno_motivo ?? "—", mediciones: measurements.get(m.id) ?? {},
    })).sort((a, b) => a.capturadoAt.localeCompare(b.capturadoAt) || a.id.localeCompare(b.id));
    return { rows, periodo: data.mode === "mes" ? data.fecha.slice(0, 7) : data.fecha,
      inicio: window.start, finExclusivo: window.end,
      planta: scope.plantaNombre ?? "Plantas autorizadas", generadoAt: new Date().toISOString() };
  });

export type ReporteFueraTurno = Awaited<ReturnType<typeof getReporteFueraTurno>>;