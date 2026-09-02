import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { allowedPlantaIds } from "@/lib/planta-acceso";
import {
  maquinasInputSchema,
  rangoToDesde,
  turnoActualPorReloj,
} from "@/lib/produccion.helpers";
import type { SB } from "@/lib/produccion.helpers";

export const listMaquinasConEstado = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => maquinasInputSchema.parse(input ?? undefined))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const rango = data?.rango ?? "dia";

    let maqQ = sb
      .from("maquinas")
      .select("id, codigo, nombre, area, planta_id, activo, plantas(nombre, codigo)")
      .eq("activo", true)
      // MP-10 es máquina de pruebas: no debe aparecer en visores de producción/historial.
      .neq("codigo", "MP-10")
      .order("codigo");
    const plantasPermitidas = await allowedPlantaIds(sb, context.userId);
    if (plantasPermitidas) maqQ = maqQ.in("planta_id", plantasPermitidas);
    const { data: maquinas, error: errMaq } = await maqQ;
    if (errMaq) throw new Error(errMaq.message);

    const ids = (maquinas ?? []).map((m) => m.id);
    if (ids.length === 0) return [];

    const { data: turnosCfg } = await sb
      .from("app_settings")
      .select("turno1_inicio, turno1_fin, turno2_inicio, turno2_fin, turno3_inicio, turno3_fin")
      .limit(1)
      .maybeSingle();
    const desde24h = rangoToDesde(rango, turnosCfg) ?? new Date(Date.now() - 24 * 3600_000).toISOString();
    const turnoVigente = rango === "turno" ? turnoActualPorReloj(turnosCfg) : null;
    const desdeMuestras =
      rango === "turno"
        ? new Date(new Date(desde24h).getTime() - 8 * 3600_000).toISOString()
        : desde24h;

    const [
      { data: estados },
      { data: ordenes },
      { data: paros },
      { data: rollos },
      { data: muestras },
    ] = await Promise.all([
      sb.from("maquina_estado_actual").select("*").in("maquina_id", ids),
      sb
        .from("ordenes_fabricacion")
        .select("id, folio, estado, maquina_id, producto_id, turno, fecha_inicio, productos(nombre, codigo)")
        .in("maquina_id", ids)
        .in("estado", ["en_proceso", "pausada"]),
      sb
        .from("paros_maquina")
        .select("id, maquina_id, inicio, fin, tipo_paro_id, descripcion, tipos_paro:tipo_paro_id(codigo, nombre)")
        .in("maquina_id", ids)
        .gte("inicio", desde24h),
      sb
        .from("rollos_producidos")
        .select("id, orden_id, peso_kg, registrado_at, ordenes_fabricacion:orden_id(maquina_id, fecha_inicio)")
        .gte("registrado_at", desde24h),
      (() => {
        let query = sb
          .from("muestras_calidad")
          .select("id, maquina_id, capturado_at, turno, numero_rollo, mediciones_calidad(variable_clave, valor)")
          .in("maquina_id", ids)
          .gte("capturado_at", desdeMuestras);
        if (turnoVigente) query = query.eq("turno", turnoVigente);
        return query;
      })(),
    ]);

    return (maquinas ?? []).map((maquina) => {
      const estado = estados?.find((item) => item.maquina_id === maquina.id) ?? null;
      const orden =
        ordenes?.find((item) => item.id === estado?.orden_activa_id) ??
        ordenes?.find((item) => item.maquina_id === maquina.id) ??
        null;
      const paroActivo = paros?.find((item) => item.maquina_id === maquina.id && item.fin === null) ?? null;
      const rollosMaq = (rollos ?? []).filter(
        (rollo) =>
          (rollo as { ordenes_fabricacion?: { maquina_id?: string } | null }).ordenes_fabricacion
            ?.maquina_id === maquina.id,
      );
      const muestrasMaq = (muestras ?? []).filter((muestra) => muestra.maquina_id === maquina.id);
      const rollosTurno = rollosMaq.length > 0 ? rollosMaq.length : muestrasMaq.length;
      const kgTurno =
        rollosMaq.length > 0
          ? rollosMaq.reduce((sum, rollo) => sum + (Number(rollo.peso_kg) || 0), 0)
          : muestrasMaq.reduce((sum, muestra) => {
              const peso = (muestra.mediciones_calidad ?? []).find(
                (medicion) => medicion.variable_clave === "peso",
              )?.valor;
              return sum + (Number(peso) || 0);
            }, 0);
      const parosMaq = (paros ?? []).filter((item) => item.maquina_id === maquina.id);
      const minutosParo = parosMaq.reduce((sum, paro) => {
        const fin = paro.fin ? new Date(paro.fin).getTime() : Date.now();
        const inicio = new Date(paro.inicio).getTime();
        return sum + Math.max(0, (fin - inicio) / 60000);
      }, 0);
      const oee = Math.max(0, Math.min(100, (1 - minutosParo / 1440) * 100));

      let estadoUI: "operando" | "paro" | "mantenimiento" | "libre" = "libre";
      if (estado?.estado === "produciendo") estadoUI = "operando";
      else if (estado?.estado === "paro") estadoUI = "paro";
      else if (estado?.estado === "mantenimiento") estadoUI = "mantenimiento";

      return {
        id: maquina.id,
        codigo: maquina.codigo,
        nombre: maquina.nombre,
        planta: (maquina as { plantas?: { nombre?: string } | null }).plantas?.nombre ?? "—",
        estado: estadoUI,
        orden: orden
          ? {
              id: orden.id,
              folio: orden.folio,
              producto: orden.productos?.nombre ?? "—",
              turno: orden.turno ?? "—",
            }
          : null,
        paroActivo: paroActivo
          ? {
              id: paroActivo.id,
              inicio: paroActivo.inicio,
              tipo: (paroActivo as { tipos_paro?: { nombre?: string } | null }).tipos_paro?.nombre ?? "—",
              descripcion: paroActivo.descripcion,
            }
          : null,
        rollosTurno,
        kgTurno: Math.round(kgTurno * 10) / 10,
        oee: Math.round(oee * 10) / 10,
        ultimoCambio: estado?.ultimo_cambio ?? null,
      };
    });
  });