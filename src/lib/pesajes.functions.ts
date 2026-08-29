// =============================================================================
// Pesaje de Bobina Madre — RPC server functions
// - Guarda pesajes (con evidencia ya subida al bucket privado).
// - Firma URL temporal de la evidencia.
// - Vincula pesaje ↔ muestra_calidad por Número de Rollo con validaciones.
// =============================================================================

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Tara por máquina: MP-04=560, MP-05=750, MP-06=1160, MP-07=1260 kg.

export type PesajeBobina = {
  id: string;
  numero_rollo: string;
  maquina_id: string;
  maquina_codigo: string;
  orden_produccion_id: string | null;
  numero_orden: string | null;
  peso_bruto_kg: number;
  peso_eje_kg: number;
  peso_neto_kg: number;
  fecha_hora_pesaje: string;
  evidencia_path: string;
  ocr_confianza: number | null;
  created_at: string;
};

// NOTA DE SEGURIDAD:
// La creación de pesajes ya no se realiza desde el cliente.
// El registro definitivo se hace exclusivamente dentro de la Edge Function
// `analizar-peso-bobina`, que valida al usuario, ejecuta el OCR, aplica las
// validaciones estrictas, resta la tara según la máquina (MP-04=560, MP-05=750, MP-06=1160, MP-07=1260 kg) y persiste con service role.
// El frontend sólo sube la evidencia y llama a esa función.


/** Lista los últimos pesajes. */
export const listPesajes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PesajeBobina[]> => {
    const { data, error } = await context.supabase
      .from("pesajes_bobina_madre")
      .select("*")
      .order("fecha_hora_pesaje", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as PesajeBobina[];
  });

/** Firma URL temporal (60s) para descargar/mostrar la evidencia. */
export const firmarEvidencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ path: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const { data: signed, error } = await context.supabase.storage
      .from("pesajes-evidencia")
      .createSignedUrl(data.path, 60);
    if (error || !signed) throw new Error(error?.message ?? "No se pudo firmar la URL.");
    return { url: signed.signedUrl };
  });

/**
 * Firma URL temporal para consultar evidencia de pesaje desde el módulo
 * Control de Calidad. Los capturistas no tienen SELECT sobre el bucket, por lo
 * que usamos service role tras validar el permiso de módulo del caller.
 */
export const firmarEvidenciaCaptura = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ path: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const { data: allowed, error: rerr } = await context.supabase.rpc(
      "can_access_module",
      { _user_id: context.userId, _module: "control_calidad" as never },
    );
    if (rerr) throw new Error(rerr.message);
    if (!allowed) throw new Error("Sin permiso para consultar evidencia.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("pesajes-evidencia")
      .createSignedUrl(data.path, 120);
    if (error || !signed) throw new Error(error?.message ?? "No se pudo firmar la URL.");
    return { url: signed.signedUrl };
  });

/** Vincula un pesaje a una muestra por número de rollo. */
export const vincularPesajeMuestra = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      muestra_id: z.string().uuid(),
      pesaje_id: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;

    // Carga previa para validaciones amistosas antes del RPC.
    // La muestra se lee con el cliente autenticado (RLS aplica al capturista).
    const { data: m } = await sb.from("muestras_calidad")
      .select("id, numero_rollo, maquina_id, orden_id, pesaje_id")
      .eq("id", data.muestra_id).maybeSingle();
    if (!m) throw new Error("Muestra no encontrada.");
    if (m.pesaje_id) throw new Error("La muestra ya tiene un pesaje vinculado.");

    // El pesaje se lee con service role porque el capturista de calidad no
    // tiene permisos SELECT sobre pesajes_bobina_madre. Sólo lo usamos para
    // validaciones amistosas antes del RPC (que también revalida en BD).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: p } = await supabaseAdmin.from("pesajes_bobina_madre")
      .select("id, numero_rollo, maquina_id, orden_produccion_id")
      .eq("id", data.pesaje_id).maybeSingle();
    if (!p) throw new Error("Pesaje no encontrado.");
    if (m.numero_rollo !== p.numero_rollo) {
      throw new Error(`No coincide el número de rollo (muestra ${m.numero_rollo} vs pesaje ${p.numero_rollo}).`);
    }
    if (m.maquina_id !== p.maquina_id) {
      throw new Error("La máquina del pesaje no coincide con la de la muestra.");
    }
    if (m.orden_id && p.orden_produccion_id && m.orden_id !== p.orden_produccion_id) {
      throw new Error("La Orden de Producción del pesaje no coincide con la de la muestra.");
    }

    const { error } = await sb.rpc("vincular_pesaje_a_muestra", {
      _muestra_id: data.muestra_id,
      _pesaje_id: data.pesaje_id,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Búsqueda mínima de pesaje para la pantalla de captura de Calidad.
 * Devuelve sólo los campos necesarios para autollenar el peso y bloquear la
 * edición. Se ejecuta con service role porque los capturistas no tienen
 * SELECT sobre pesajes_bobina_madre; el gate es `requireSupabaseAuth` +
 * validación del rol de captura.
 */
export type PesajeParaCaptura = {
  id: string;
  peso_neto_kg: number;
  fecha_hora_pesaje: string;
  evidencia_path: string;
  numero_orden: string | null;
  orden_produccion_id: string | null;
  maquina_id: string;
  numero_rollo: string;
};

export const buscarPesajePorRollo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      maquina_id: z.string().uuid(),
      numero_rollo: z.string().trim().min(1).max(64),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<PesajeParaCaptura | null> => {
    // Solo roles que capturan calidad o administradores pueden hacer lookup.
    const { data: allowed, error: rerr } = await context.supabase.rpc(
      "can_access_module",
      { _user_id: context.userId, _module: "control_calidad" as never },
    );
    if (rerr) throw new Error(rerr.message);
    if (!allowed) throw new Error("Sin permiso para consultar pesajes desde Calidad.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: p, error } = await supabaseAdmin
      .from("pesajes_bobina_madre")
      .select("id, peso_neto_kg, fecha_hora_pesaje, evidencia_path, numero_orden, orden_produccion_id, maquina_id, numero_rollo")
      .eq("maquina_id", data.maquina_id)
      .eq("numero_rollo", data.numero_rollo)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (p as PesajeParaCaptura | null) ?? null;
  });

/**
 * Rollos ya pesados (Planta Ixtapaluca) que aún NO tienen captura de calidad.
 * Se usa en Control de Calidad y Captura fuera de turno para continuar la
 * captura de un rollo registrado con anticipación, sin consumir un consecutivo
 * nuevo. Al capturarlo en cualquiera de los dos módulos, deja de listarse.
 */
export type PesajePendienteCaptura = {
  id: string;
  numero_rollo: string;
  peso_neto_kg: number;
  fecha_hora_pesaje: string;
  numero_orden: string | null;
};

export const listarPesajesPendientesCaptura = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ maquina_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<PesajePendienteCaptura[]> => {
    const { data: allowed, error: rerr } = await context.supabase.rpc(
      "can_access_module",
      { _user_id: context.userId, _module: "control_calidad" as never },
    );
    if (rerr) throw new Error(rerr.message);
    if (!allowed) throw new Error("Sin permiso para consultar pesajes desde Calidad.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Aplica a cualquier máquina de cualquier planta (Ixtapaluca y Tlaxcala
    // con la misma lógica): se listan los rollos ya pesados en esa máquina
    // que aún no han sido capturados en Calidad.
    const { data: pesajes, error } = await supabaseAdmin
      .from("pesajes_bobina_madre")
      .select("id, numero_rollo, peso_neto_kg, fecha_hora_pesaje, numero_orden")
      .eq("maquina_id", data.maquina_id)
      .order("fecha_hora_pesaje", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const lista = (pesajes ?? []) as PesajePendienteCaptura[];
    if (lista.length === 0) return [];

    // El cruce "ya capturado" se limita a la MISMA máquina para evitar
    // colisiones de texto de rollo entre plantas.
    const { data: capturados, error: cerr } = await supabaseAdmin
      .from("muestras_calidad")
      .select("numero_rollo")
      .eq("maquina_id", data.maquina_id)
      .in("numero_rollo", lista.map((p) => p.numero_rollo));
    if (cerr) throw new Error(cerr.message);
    const usados = new Set((capturados ?? []).map((m) => m.numero_rollo as string));

    return lista.filter((p) => !usados.has(p.numero_rollo));
  });




/**
 * Verifica si un número de rollo ya fue utilizado en Pesaje de Bobina Madre
 * (y si además ya tiene lote de cintas). Se usa para bloquear la captura
 * duplicada y mostrar al operador el registro existente.
 */
export type RolloYaUtilizado = {
  usado: boolean;
  pesaje: {
    id: string;
    numero_rollo: string;
    maquina_codigo: string;
    peso_bruto_kg: number;
    peso_neto_kg: number;
    fecha_hora_pesaje: string;
    numero_orden: string | null;
    capturado_por_nombre: string | null;
  } | null;
  lote_cintas: {
    id: string;
    estado: string;
    cantidad_cintas: number;
    created_at: string;
  } | null;
};

export const verificarRolloUtilizado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      numero_rollo: z.string().trim().min(1).max(64),
      maquina_id: z.string().uuid().nullish(),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<RolloYaUtilizado> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("pesajes_bobina_madre")
      .select("id, numero_rollo, maquina_codigo, peso_bruto_kg, peso_neto_kg, fecha_hora_pesaje, numero_orden, capturado_por")
      .eq("numero_rollo", data.numero_rollo)
      .order("fecha_hora_pesaje", { ascending: false })
      .limit(1);
    if (data.maquina_id) q = q.eq("maquina_id", data.maquina_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const p = rows?.[0] ?? null;

    let nombre: string | null = null;
    if (p?.capturado_por) {
      const { data: prof } = await supabaseAdmin
        .from("profiles").select("nombre, email").eq("id", p.capturado_por).maybeSingle();
      nombre = prof?.nombre ?? prof?.email ?? null;
    }

    const { data: lotes } = await supabaseAdmin
      .from("pesajes_cintas_lotes")
      .select("id, estado, cantidad_cintas, created_at")
      .eq("numero_rollo", data.numero_rollo)
      .neq("estado", "anulado")
      .order("created_at", { ascending: false })
      .limit(1);
    const lote = lotes?.[0] ?? null;

    void context.userId;
    return {
      usado: !!p,
      pesaje: p
        ? {
            id: p.id,
            numero_rollo: p.numero_rollo,
            maquina_codigo: p.maquina_codigo,
            peso_bruto_kg: Number(p.peso_bruto_kg),
            peso_neto_kg: Number(p.peso_neto_kg),
            fecha_hora_pesaje: p.fecha_hora_pesaje,
            numero_orden: p.numero_orden,
            capturado_por_nombre: nombre,
          }
        : null,
      lote_cintas: lote
        ? { id: lote.id, estado: lote.estado, cantidad_cintas: lote.cantidad_cintas, created_at: lote.created_at }
        : null,
    };
  });
