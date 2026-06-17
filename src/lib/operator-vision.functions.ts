import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Datos en tiempo real para la pantalla kiosko "Operator Vision".
 *
 * Pública (sin auth) porque la URL se pega en una TV / kiosko.
 * Devuelve un payload minimalista y sin PII sensible — solo lo que el
 * operador debe ver para reaccionar a desviaciones.
 */
export const getOperatorVisionData = createServerFn({ method: "GET" })
  .inputValidator((input: { maquina: string }) =>
    z
      .object({
        maquina: z
          .string()
          .min(1)
          .max(20)
          .regex(/^[A-Za-z0-9_-]+$/),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin;

    // 1) Resolver máquina por código
    const { data: maquina, error: eMaq } = await sb
      .from("maquinas")
      .select("id, codigo, nombre, area, planta_id, plantas(codigo, nombre)")
      .eq("codigo", data.maquina)
      .maybeSingle();
    if (eMaq) throw new Error(eMaq.message);
    if (!maquina) {
      return {
        maquina: null,
        orden: null,
        spec: null,
        variables: [],
        muestras: [],
        estadoMaquina: null,
      };
    }

    // 2) Orden de fabricación activa en esa máquina (más reciente en proceso)
    const { data: ordenActiva } = await sb
      .from("ordenes_fabricacion")
      .select(
        `id, folio, estado, turno, producido_kg, producido_rollos,
         objetivo_kg, objetivo_rollos, unidad_objetivo,
         producto_id, productos(id, codigo, nombre),
         especificacion_id`,
      )
      .eq("maquina_id", maquina.id)
      .in("estado", ["en_proceso", "pausada"])
      .order("fecha_inicio", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    // 3) Variables de la especificación activa (rangos min/obj/max)
    let variables: Array<{
      clave: string;
      etiqueta: string;
      unidad: string | null;
      min: number;
      objetivo: number;
      max: number;
    }> = [];
    if (ordenActiva?.especificacion_id) {
      const { data: vars } = await sb
        .from("producto_variables")
        .select(
          `min_valor, objetivo, max_valor,
           variables_calidad(clave, etiqueta, unidad)`,
        )
        .eq("especificacion_id", ordenActiva.especificacion_id);
      variables =
        (vars ?? [])
          .map((v: any) => {
            const vc = Array.isArray(v.variables_calidad)
              ? v.variables_calidad[0]
              : v.variables_calidad;
            if (!vc?.clave) return null;
            return {
              clave: vc.clave,
              etiqueta: vc.etiqueta ?? vc.clave,
              unidad: vc.unidad ?? "",
              min: Number(v.min_valor),
              objetivo: Number(v.objetivo),
              max: Number(v.max_valor),
            };
          })
          .filter(Boolean) as typeof variables;
    }

    // 4) Historial del turno vigente para esta máquina.
     //    - Filtrado estricto por máquina actual.
     //    - Filtrado estricto por turno vigente (orden activa, o turno de la
     //      última muestra capturada en la máquina si no hay orden activa).
     //    - Ventana: hoy (00:00 → ahora) para acotar al turno en curso.
     //    - Ordenado del más reciente al más antiguo.
    // Inicio del día en zona horaria de la planta (México, UTC-6 sin DST).
    // Calcular en UTC el instante equivalente a 00:00 hora local de México.
    const PLANT_TZ_OFFSET_HOURS = -6;
    const nowUtc = new Date();
    const nowPlant = new Date(nowUtc.getTime() + PLANT_TZ_OFFSET_HOURS * 3600 * 1000);
    const startTodayHist = new Date(Date.UTC(
      nowPlant.getUTCFullYear(),
      nowPlant.getUTCMonth(),
      nowPlant.getUTCDate(),
      -PLANT_TZ_OFFSET_HOURS, 0, 0, 0,
    ));
    const endNowHist = nowUtc;

    // Determinar turno vigente: orden activa o última muestra de la máquina.
    let turnoVigente: string | null =
      (ordenActiva?.turno as string | undefined) ?? null;
    if (!turnoVigente) {
      const { data: ultMuestra } = await sb
        .from("muestras_calidad")
        .select("turno")
        .eq("maquina_id", maquina.id)
        .order("capturado_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      turnoVigente = (ultMuestra?.turno as string | undefined) ?? null;
    }

    let muestrasQ = sb
      .from("muestras_calidad")
      .select(
        `id, numero_rollo, capturado_at, hora_muestreo, turno, estado,
         operador, analista, estatus_liberacion, dictamen, producto_id, orden_id, crepado_pct,
         velocidad_maquina, velocidad_enrollador,
         mediciones_calidad(variable_clave, valor, min_snapshot, objetivo_snapshot, max_snapshot, estado)`,
      )
      .eq("maquina_id", maquina.id)
      .gte("hora_muestreo", startTodayHist.toISOString())
      .lte("hora_muestreo", endNowHist.toISOString())
      .order("capturado_at", { ascending: false })
      .limit(50);
    if (turnoVigente) muestrasQ = muestrasQ.eq("turno", turnoVigente);
    const { data: muestrasRaw } = await muestrasQ;

    // Mantener orden descendente (más reciente primero) en el payload.
    // El frontend espera el arreglo en orden ascendente (oldest→newest):
    // usa el último elemento como "rollo actual". Mantenemos esa convención
    // y la UI invierte para mostrar el historial del más reciente al más antiguo.
    const muestras = [...(muestrasRaw ?? [])].reverse().map((m: any) => ({
      id: m.id as string,
      rollo: m.numero_rollo as string,
      capturadoAt: m.capturado_at as string,
      turno: m.turno as string,
      operador: (m.operador as string) ?? "",
      analista: (m.analista as string) ?? "",
      crepadoPct: m.crepado_pct === null || m.crepado_pct === undefined ? null : Number(m.crepado_pct),
      velocidadMaquina: m.velocidad_maquina === null || m.velocidad_maquina === undefined ? null : Number(m.velocidad_maquina),
      velocidadEnrollador: m.velocidad_enrollador === null || m.velocidad_enrollador === undefined ? null : Number(m.velocidad_enrollador),
      estatus: (m.estatus_liberacion ?? m.dictamen ?? "pendiente") as string,
      mediciones: (m.mediciones_calidad ?? []).map((x: any) => ({
        clave: x.variable_clave as string,
        valor: x.valor === null ? null : Number(x.valor),
        min: x.min_snapshot === null ? null : Number(x.min_snapshot),
        obj: x.objetivo_snapshot === null ? null : Number(x.objetivo_snapshot),
        max: x.max_snapshot === null ? null : Number(x.max_snapshot),
        estado: x.estado as string,
      })),
    }));

    // Fallback: si no hay orden activa, derivar producto/OF de la última muestra capturada
    let ordenFallback: {
      folio: string;
      turno: string;
      producto: string;
      productoCodigo: string;
    } | null = null;
    let productoFallbackId: string | null = null;
    if (!ordenActiva) {
      const ultima = muestrasRaw?.[0]; // muestrasRaw está desc, [0] = más reciente
      if (ultima) {
        productoFallbackId = (ultima.producto_id as string) ?? null;
        const [{ data: prod }, { data: ord }] = await Promise.all([
          ultima.producto_id
            ? sb.from("productos").select("codigo, nombre").eq("id", ultima.producto_id).maybeSingle()
            : Promise.resolve({ data: null }),
          ultima.orden_id
            ? sb.from("ordenes_fabricacion").select("folio, turno").eq("id", ultima.orden_id).maybeSingle()
            : Promise.resolve({ data: null }),
        ] as any);
        ordenFallback = {
          folio: (ord?.folio as string) ?? "",
          turno: (ord?.turno as string) ?? (ultima.turno as string) ?? "",
          producto: (prod?.nombre as string) ?? "",
          productoCodigo: (prod?.codigo as string) ?? "",
        };
      }
    }

    // Fallback de variables: si no hay orden activa pero conocemos el producto,
    // tomar la especificación vigente del producto para mostrar el universo completo
    // de variables con sus rangos min/obj/max, aunque aún no se hayan medido.
    if (variables.length === 0 && productoFallbackId) {
      const { data: specVig } = await sb
        .from("producto_especificaciones")
        .select("id")
        .eq("producto_id", productoFallbackId)
        .eq("estado", "vigente")
        .order("vigente_desde", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (specVig?.id) {
        const { data: vars } = await sb
          .from("producto_variables")
          .select(
            `min_valor, objetivo, max_valor,
             variables_calidad(clave, etiqueta, unidad)`,
          )
          .eq("especificacion_id", specVig.id);
        variables =
          (vars ?? [])
            .map((v: any) => {
              const vc = Array.isArray(v.variables_calidad)
                ? v.variables_calidad[0]
                : v.variables_calidad;
              if (!vc?.clave) return null;
              return {
                clave: vc.clave,
                etiqueta: vc.etiqueta ?? vc.clave,
                unidad: vc.unidad ?? "",
                min: Number(v.min_valor),
                objetivo: Number(v.objetivo),
                max: Number(v.max_valor),
              };
            })
            .filter(Boolean) as typeof variables;
      }
    }



    // 5) Estado actual de máquina
    const { data: estadoActual } = await sb
      .from("maquina_estado_actual")
      .select("estado, ultimo_cambio")
      .eq("maquina_id", maquina.id)
      .maybeSingle();

    // 6) Cumplimiento del turno vigente (último estatus de cada rollo).
    //    Ventana: hoy (00:00 → ahora) y filtrado por turno de la orden
    //    activa o, en su defecto, el turno de la última muestra capturada.
    const turnoRef =
      (ordenActiva?.turno as string | undefined) ??
      (muestrasRaw?.[0]?.turno as string | undefined) ??
      null;
    const startToday = startTodayHist;
    const endNow = endNowHist;

    let cumplimientoTurno: {
      liberados: number;
      capturados: number;
      pct: number;
      texto: string;
      turno: string | null;
    } = {
      liberados: 0,
      capturados: 0,
      pct: 0,
      texto: "0 liberados de 0 capturados (0%)",
      turno: turnoRef,
    };
    {
      let cq = sb
        .from("muestras_calidad")
        .select("id, mediciones_calidad(variable_clave, valor, min_snapshot, max_snapshot)")
        .eq("maquina_id", maquina.id)
        .gte("hora_muestreo", startToday.toISOString())
        .lte("hora_muestreo", endNow.toISOString());
      if (turnoRef) cq = cq.eq("turno", turnoRef);
      const { data: rows } = await cq;
      const capturados = rows?.length ?? 0;
      const cumplen = (rows ?? []).filter((r: any) => {
        const meds = (r.mediciones_calidad ?? []) as Array<{
          variable_clave: string;
          valor: number | null;
          min_snapshot: number | null;
          max_snapshot: number | null;
        }>;
        const get = (clave: string) => meds.find((m) => m.variable_clave === clave);
        const pb = get("pesoBase");
        if (pb && pb.valor !== null && pb.max_snapshot !== null && Number(pb.valor) > Number(pb.max_snapshot)) return false;
        const tmd = get("tensionMD");
        if (tmd && tmd.valor !== null && tmd.min_snapshot !== null && Number(tmd.valor) < Number(tmd.min_snapshot)) return false;
        const tcd = get("tensionCD");
        if (tcd && tcd.valor !== null && tcd.min_snapshot !== null && Number(tcd.valor) < Number(tcd.min_snapshot)) return false;
        return true;
      }).length;
      const pct = capturados > 0 ? Number(((cumplen / capturados) * 100).toFixed(1)) : 0;
      cumplimientoTurno = {
        liberados: cumplen,
        capturados,
        pct,
        texto: `${cumplen} cumplen de ${capturados} capturados (${pct}%)`,
        turno: turnoRef,
      };
    }


    return {
      maquina: {
        codigo: maquina.codigo as string,
        nombre: maquina.nombre as string,
        area: (maquina.area as string) ?? "",
      },
      orden: ordenActiva
        ? {
            folio: ordenActiva.folio as string,
            turno: (ordenActiva.turno as string) ?? "",
            producto:
              (Array.isArray(ordenActiva.productos)
                ? ordenActiva.productos[0]?.nombre
                : (ordenActiva as any).productos?.nombre) ?? "",
            productoCodigo:
              (Array.isArray(ordenActiva.productos)
                ? ordenActiva.productos[0]?.codigo
                : (ordenActiva as any).productos?.codigo) ?? "",
            producidoKg: Number(ordenActiva.producido_kg ?? 0),
            producidoRollos: Number(ordenActiva.producido_rollos ?? 0),
            objetivoKg:
              ordenActiva.objetivo_kg === null
                ? null
                : Number(ordenActiva.objetivo_kg),
            objetivoRollos:
              ordenActiva.objetivo_rollos === null
                ? null
                : Number(ordenActiva.objetivo_rollos),
            unidad: (ordenActiva.unidad_objetivo as string) ?? "kg",
          }
        : ordenFallback
          ? {
              folio: ordenFallback.folio,
              turno: ordenFallback.turno,
              producto: ordenFallback.producto,
              productoCodigo: ordenFallback.productoCodigo,
              producidoKg: 0,
              producidoRollos: 0,
              objetivoKg: null,
              objetivoRollos: null,
              unidad: "kg",
            }
          : null,
      variables,
      muestras,
      estadoMaquina: estadoActual
        ? {
            estado: estadoActual.estado as string,
            ultimoCambio: estadoActual.ultimo_cambio as string,
          }
        : null,
      cumplimientoTurno,
    };
  });

export type OperatorVisionData = Awaited<ReturnType<typeof getOperatorVisionData>>;
