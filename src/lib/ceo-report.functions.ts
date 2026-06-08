// =============================================================================
// Reporte CEO — agregaciones de las últimas 24h para el correo ejecutivo diario.
// =============================================================================
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CEOReportMaquina = {
  codigo: string;
  planta: string;
  estado: "operando" | "paro" | "mantenimiento" | "libre";
  rollos: number;
  kg: number;
  oee: number;
  paroMin: number;
};

export type CEOReportRollo = {
  folio: string;
  fecha: string; // ISO
  maquina: string;
  turno: string;
  pesoKg: number | null;
  codigoProducto: string;
  anchoUtil: number | null;
  blancuraR457: number | null;
  diametro: number | null;
  estatus: "Liberado" | "Retenido" | "Rechazado" | "Pendiente";
  defectos: string[];
};


export type CEOReportPayload = {
  windowStart: string;
  windowEnd: string;
  totales: {
    rollos: number;
    kg: number;
    oeePromedio: number;
    maquinasActivas: number;
    maquinasParo: number;
    maquinasTotales: number;
  };
  calidad: {
    cumplimientoPct: number; // % muestras conformes
    muestrasTotales: number;
    rollosNoLiberados: number;
    kgNoLiberados: number;
  };
  maquinas: CEOReportMaquina[];
  rollos: CEOReportRollo[];
};

export const getCEOReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CEOReportPayload> => {
    const sb = context.supabase;
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 3600_000);
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    const [
      { data: maquinas },
      { data: estados },
      { data: muestras },
      { data: mediciones },
      { data: rollosProd },
      { data: ordenes },
      { data: paros },
    ] = await Promise.all([
      sb.from("maquinas").select("id, codigo, plantas(nombre)").eq("activo", true).order("codigo"),
      sb.from("maquina_estado_actual").select("maquina_id, estado"),
      sb
        .from("muestras_calidad")
        .select(
          "id, maquina_id, planta_id, hora_muestreo, numero_rollo, turno, dictamen, estatus_liberacion, defectos, productos(codigo), maquinas(codigo)",
        )
        .gte("hora_muestreo", startIso)
        .lte("hora_muestreo", endIso)
        .order("hora_muestreo", { ascending: false }),
      sb
        .from("mediciones_calidad")
        .select("muestra_id, variable_clave, valor, estado")
        .gte("created_at", startIso)
        .lte("created_at", endIso),

      sb
        .from("rollos_producidos")
        .select("id, orden_id, peso_kg, registrado_at")
        .gte("registrado_at", startIso)
        .lte("registrado_at", endIso),
      sb.from("ordenes_fabricacion").select("id, maquina_id"),
      sb
        .from("paros_maquina")
        .select("maquina_id, inicio, fin, duracion_min")
        .gte("inicio", startIso)
        .lte("inicio", endIso),
    ]);

    const codigoById = new Map((maquinas ?? []).map((m: any) => [m.id, m.codigo]));
    const plantaById = new Map(
      (maquinas ?? []).map((m: any) => [m.id, m?.plantas?.nombre ?? "—"]),
    );
    const ordenMaqById = new Map((ordenes ?? []).map((o: any) => [o.id, o.maquina_id]));
    const estadoById = new Map((estados ?? []).map((e: any) => [e.maquina_id, e.estado]));

    // Mediciones por muestra
    const ncPorMuestra = new Map<string, number>();
    const pesoPorMuestra = new Map<string, number>();
    const anchoPorMuestra = new Map<string, number>();
    const blancuraPorMuestra = new Map<string, number>();
    const diametroPorMuestra = new Map<string, number>();
    for (const med of mediciones ?? []) {
      if (med.estado === "no_conforme" || med.estado === "fuera_rango_critico") {
        ncPorMuestra.set(med.muestra_id, (ncPorMuestra.get(med.muestra_id) ?? 0) + 1);
      }
      if (med.valor == null) continue;
      const v = Number(med.valor);
      if (Number.isNaN(v)) continue;
      if (med.variable_clave === "peso") pesoPorMuestra.set(med.muestra_id, v);
      else if (med.variable_clave === "anchoUtil") anchoPorMuestra.set(med.muestra_id, v);
      else if (med.variable_clave === "blancuraR457") blancuraPorMuestra.set(med.muestra_id, v);
      else if (med.variable_clave === "diametro") diametroPorMuestra.set(med.muestra_id, v);
    }


    const estatusDe = (m: any): CEOReportRollo["estatus"] => {
      if (m.dictamen === "liberada" || m.estatus_liberacion === "L") return "Liberado";
      if (m.dictamen === "rechazada" || m.estatus_liberacion === "NC") return "Rechazado";
      if (m.dictamen === "retenida" || m.estatus_liberacion === "R") return "Retenido";
      return "Pendiente";
    };
    const esConforme = (m: any): boolean => {
      const st = estatusDe(m);
      if (st === "Liberado") return true;
      if (st === "Rechazado" || st === "Retenido") return false;
      const nc = ncPorMuestra.get(m.id) ?? 0;
      const def = ((m.defectos ?? []) as string[]).filter(Boolean).length;
      return nc === 0 && def === 0;
    };

    // Por máquina
    const maqs: CEOReportMaquina[] = (maquinas ?? []).map((m: any) => {
      const code = m.codigo;
      const muestrasMaq = (muestras ?? []).filter((s: any) => s.maquina_id === m.id);
      const rollosMaq = (rollosProd ?? []).filter(
        (r: any) => ordenMaqById.get(r.orden_id) === m.id,
      );
      const rollos = rollosMaq.length > 0 ? rollosMaq.length : muestrasMaq.length;
      const kg =
        rollosMaq.length > 0
          ? rollosMaq.reduce((s: number, r: any) => s + (Number(r.peso_kg) || 0), 0)
          : muestrasMaq.reduce(
              (s: number, ms: any) => s + (pesoPorMuestra.get(ms.id) ?? 0),
              0,
            );
      const parosMaq = (paros ?? []).filter((p: any) => p.maquina_id === m.id);
      const minutosParo = parosMaq.reduce((s: number, p: any) => {
        if (p.duracion_min != null) return s + Number(p.duracion_min);
        const fin = p.fin ? new Date(p.fin).getTime() : end.getTime();
        const ini = new Date(p.inicio).getTime();
        return s + Math.max(0, (fin - ini) / 60000);
      }, 0);
      const disponibilidad = Math.max(0, 1 - minutosParo / 1440);
      const conformes = muestrasMaq.filter(esConforme).length;
      const calidad = muestrasMaq.length ? conformes / muestrasMaq.length : 1;
      const oee = Math.round(disponibilidad * 0.95 * calidad * 1000) / 10;

      const estadoRaw = estadoById.get(m.id);
      let estado: CEOReportMaquina["estado"] = "libre";
      if (estadoRaw === "produciendo") estado = "operando";
      else if (estadoRaw === "paro") estado = "paro";
      else if (estadoRaw === "mantenimiento") estado = "mantenimiento";

      return {
        codigo: code,
        planta: m?.plantas?.nombre ?? "—",
        estado,
        rollos,
        kg: Math.round(kg * 10) / 10,
        oee,
        paroMin: Math.round(minutosParo),
      };
    });

    // Totales
    const totalRollos = maqs.reduce((a, m) => a + m.rollos, 0);
    const totalKg = Math.round(maqs.reduce((a, m) => a + m.kg, 0) * 10) / 10;
    const oeePromedio = maqs.length
      ? Math.round((maqs.reduce((a, m) => a + m.oee, 0) / maqs.length) * 10) / 10
      : 0;
    const maquinasActivas = maqs.filter((m) => m.estado === "operando").length;
    const maquinasParo = maqs.filter((m) => m.estado === "paro").length;

    // Calidad
    const muestrasTotales = muestras?.length ?? 0;
    const conformesTot = (muestras ?? []).filter(esConforme).length;
    const cumplimientoPct = muestrasTotales
      ? Math.round((conformesTot / muestrasTotales) * 1000) / 10
      : 0;
    let rollosNoLiberados = 0;
    let kgNoLiberados = 0;
    for (const m of muestras ?? []) {
      if (esConforme(m as any)) continue;
      rollosNoLiberados += 1;
      kgNoLiberados += pesoPorMuestra.get((m as any).id) ?? 0;
    }

    // Listado de rollos
    const rollosList: CEOReportRollo[] = (muestras ?? []).map((m: any) => ({
      folio: m.numero_rollo ?? "—",
      fecha: m.hora_muestreo,
      planta: m?.plantas?.nombre ?? plantaById.get(m.maquina_id) ?? "—",
      maquina: m?.maquinas?.codigo ?? codigoById.get(m.maquina_id) ?? "—",
      turno: m.turno ?? "—",
      pesoKg: pesoPorMuestra.get(m.id) ?? null,
      operador: m.operador ?? "—",
      jefeMaquina: m.jefe_maquina ?? "—",
      analista: m.analista ?? "—",
      estatus: estatusDe(m),
      defectos: ((m.defectos ?? []) as string[]).filter(Boolean),
    }));

    return {
      windowStart: startIso,
      windowEnd: endIso,
      totales: {
        rollos: totalRollos,
        kg: totalKg,
        oeePromedio,
        maquinasActivas,
        maquinasParo,
        maquinasTotales: maqs.length,
      },
      calidad: {
        cumplimientoPct,
        muestrasTotales,
        rollosNoLiberados,
        kgNoLiberados: Math.round(kgNoLiberados * 10) / 10,
      },
      maquinas: maqs,
      rollos: rollosList,
    };
  });
