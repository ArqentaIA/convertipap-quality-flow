// =============================================================================
// Enlace público temporal de captura de peso (MP-01 · Ixtapaluca)
// Acceso sin usuario ni contraseña, validado por token con vigencia.
// Toda la lógica se ejecuta en servidor con service role tras validar el token.
// =============================================================================

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type EnlacePesajeInfo = {
  ok: boolean;
  motivo?: string;
  enlace_id?: string;
  maquina_id?: string;
  maquina_codigo?: string;
  planta?: string;
  expira_at?: string;
  numero_rollo?: string | null;
};

export type PesajePublicoRow = {
  id: string;
  numero_rollo: string;
  peso_bruto_kg: number;
  peso_neto_kg: number;
  fecha_hora_pesaje: string;
};

const tokenSchema = z.object({ token: z.string().trim().min(16).max(128) });

export const validarEnlacePesaje = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenSchema.parse(d))
  .handler(async ({ data }): Promise<EnlacePesajeInfo> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: enlace } = await supabaseAdmin
      .from("enlaces_pesaje_publico")
      .select("id, maquina_id, expira_at, activo")
      .eq("token", data.token)
      .maybeSingle();
    if (!enlace) return { ok: false, motivo: "Enlace no válido." };
    if (!enlace.activo) return { ok: false, motivo: "El enlace fue desactivado." };
    if (new Date(enlace.expira_at as string).getTime() < Date.now()) {
      return { ok: false, motivo: "El enlace expiró. Solicita uno nuevo al administrador." };
    }

    const { data: maq } = await supabaseAdmin
      .from("maquinas")
      .select("id, codigo, plantas!inner(nombre)")
      .eq("id", enlace.maquina_id as string)
      .maybeSingle();

    const { data: num } = await supabaseAdmin
      .from("numeracion_rollos")
      .select("sufijo, proximo_numero, relleno_digitos, activo, vigente_desde")
      .eq("maquina_id", enlace.maquina_id as string)
      .maybeSingle();

    let numeroRollo: string | null = null;
    if (num && num.activo && new Date(num.vigente_desde as string).getTime() <= Date.now()) {
      const base = String(num.proximo_numero);
      const relleno = Number(num.relleno_digitos ?? 0);
      numeroRollo = `${relleno > 0 ? base.padStart(relleno, "0") : base}-${num.sufijo}`;
    }

    return {
      ok: true,
      enlace_id: enlace.id as string,
      maquina_id: enlace.maquina_id as string,
      maquina_codigo: (maq as { codigo?: string } | null)?.codigo ?? "",
      planta: (maq as { plantas?: { nombre?: string } } | null)?.plantas?.nombre ?? "",
      expira_at: enlace.expira_at as string,
      numero_rollo: numeroRollo,
    };
  });

export const listarPesajesEnlace = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenSchema.parse(d))
  .handler(async ({ data }): Promise<PesajePublicoRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: enlace } = await supabaseAdmin
      .from("enlaces_pesaje_publico")
      .select("id, activo, expira_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!enlace || !enlace.activo) return [];
    if (new Date(enlace.expira_at as string).getTime() < Date.now()) return [];

    const { data: rows } = await supabaseAdmin
      .from("pesajes_bobina_madre")
      .select("id, numero_rollo, peso_bruto_kg, peso_neto_kg, fecha_hora_pesaje")
      .like("evidencia_path", `publico/${enlace.id as string}/%`)
      .order("fecha_hora_pesaje", { ascending: false })
      .limit(50);
    return (rows ?? []).map((r) => ({
      id: r.id as string,
      numero_rollo: r.numero_rollo as string,
      peso_bruto_kg: Number(r.peso_bruto_kg),
      peso_neto_kg: Number(r.peso_neto_kg),
      fecha_hora_pesaje: r.fecha_hora_pesaje as string,
    }));
  });

export const registrarPesajePublico = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        token: z.string().trim().min(16).max(128),
        numero_rollo: z.string().trim().min(1).max(64),
        peso_bruto_kg: z.number().int().positive().max(3000),
        numero_orden: z.string().trim().max(64).nullish(),
        evidencia_base64: z.string().max(4_000_000).nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true; numero_rollo: string; peso_neto_kg: number }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: enlace } = await supabaseAdmin
      .from("enlaces_pesaje_publico")
      .select("id, maquina_id, expira_at, activo")
      .eq("token", data.token)
      .maybeSingle();
    if (!enlace || !enlace.activo) throw new Error("Enlace no válido.");
    if (new Date(enlace.expira_at as string).getTime() < Date.now()) {
      throw new Error("El enlace expiró. Solicita uno nuevo al administrador.");
    }

    const { data: maq } = await supabaseAdmin
      .from("maquinas")
      .select("id, codigo")
      .eq("id", enlace.maquina_id as string)
      .maybeSingle();
    const maquinaCodigo = (maq as { codigo?: string } | null)?.codigo ?? "";
    if (!maquinaCodigo) throw new Error("Máquina no configurada.");

    // MP-01 (Ixtapaluca) no descuenta tara de eje.
    const pesoEje = 0;
    const pesoNeto = data.peso_bruto_kg - pesoEje;
    if (pesoNeto <= 0) throw new Error("El peso capturado no es válido.");

    const rolloSanit = data.numero_rollo.replace(/[^A-Za-z0-9_-]/g, "_");
    const path = `publico/${enlace.id as string}/${rolloSanit}-${crypto.randomUUID()}.jpg`;

    if (data.evidencia_base64) {
      const bin = Uint8Array.from(atob(data.evidencia_base64), (c) => c.charCodeAt(0));
      const up = await supabaseAdmin.storage
        .from("pesajes-evidencia")
        .upload(path, bin, { contentType: "image/jpeg", upsert: false });
      if (up.error) throw new Error(`No se pudo guardar la evidencia: ${up.error.message}`);
    }

    const { error } = await supabaseAdmin.rpc("registrar_pesaje_bobina_numerado", {
      _registro: {
        maquina_id: enlace.maquina_id,
        maquina_codigo: maquinaCodigo,
        numero_rollo: data.numero_rollo,
        numero_orden: data.numero_orden ?? null,
        peso_bruto_kg: data.peso_bruto_kg,
        peso_eje_kg: pesoEje,
        peso_neto_kg: pesoNeto,
        evidencia_path: path,
        fecha_hora_pesaje: new Date().toISOString(),
      } as never,
    });
    if (error) {
      if (data.evidencia_base64) {
        await supabaseAdmin.storage.from("pesajes-evidencia").remove([path]);
      }
      throw new Error(error.message);
    }

    return { ok: true, numero_rollo: data.numero_rollo, peso_neto_kg: pesoNeto };
  });
