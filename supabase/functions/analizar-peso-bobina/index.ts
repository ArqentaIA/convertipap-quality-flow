// Registro seguro de pesaje de bobina madre.
// El frontend envía la evidencia y los identificadores del registro.
// Esta Edge Function:
//   1) Valida al usuario (bearer token).
//   2) Ejecuta OCR con Gemini sobre la evidencia del bucket privado.
//   3) Aplica las validaciones estrictas (confianza ≥ 85% + 7 reglas).
//   4) Convierte el peso a entero y resta la tara según la máquina (MP-04=560, MP-05=750, MP-06=1160, MP-07=0 kg → peso neto directo).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { encode as base64Encode } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "pesajes-evidencia";
const UMBRAL = 85;      // Confianza mínima OCR (%)
const PESO_MIN = 100;   // Peso bruto mínimo aceptable (kg)

const TARA_POR_MAQUINA: Record<string, number> = {
  "MP-04": 560,
  "MP-05": 750,
  "MP-06": 1160,
  "MP-07": 0,
};

function taraPorMaquina(codigo: string): number {
  return TARA_POR_MAQUINA[codigo] ?? 300;
}

interface Gemini {
  peso_kg: number | null;
  confianza: number;
  unidad: string | null;
  display_completo: boolean;
  numero_unico: boolean;
  reflejos: boolean;
  digitos_ambiguos: boolean;
  observaciones: string;
}

const PROMPT = `Eres un OCR industrial para básculas. Analiza la fotografía del display de una báscula.
Devuelve EXCLUSIVAMENTE un JSON válido con esta forma:
{
 "peso_kg": <número o null>,
 "unidad": "kg" | "lb" | "g" | null,
 "confianza": <entero 0-100>,
 "display_completo": <bool>,
 "numero_unico": <bool>,
 "reflejos": <bool>,
 "digitos_ambiguos": <bool>,
 "observaciones": "<texto corto>"
}
Reglas:
- confianza = qué tan seguro estás del número principal.
- display_completo = true si el display se ve completo y enfocado.
- numero_unico = true si se identifica un único número principal.
- reflejos = true si hay reflejos que cubran los dígitos.
- digitos_ambiguos = true si algún dígito no es legible.
- Si la unidad no es kg, aún así devuelve el número.
- NO agregues texto fuera del JSON.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Falta autenticación." }, 401);

    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const supaKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) return json({ error: "GEMINI_API_KEY no configurada." }, 500);

    const admin = createClient(supaUrl, supaKey);

    // Validar sesión del caller
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const userClient = createClient(supaUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "No autenticado." }, 401);
    const uid = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const evidenciaPath: string | undefined = body?.evidencia_path;
    const maquinaId: string | undefined = body?.maquina_id;
    const numeroRollo: string | undefined = (body?.numero_rollo ?? "").toString().trim() || undefined;
    const numeroOrden: string | null = body?.numero_orden ? String(body.numero_orden).trim() : null;
    const fechaHora: string | undefined = body?.fecha_hora_pesaje;

    if (!evidenciaPath) return json({ error: "Falta evidencia_path." }, 400);
    if (!maquinaId) return json({ error: "Falta maquina_id." }, 400);
    if (!numeroRollo) return json({ error: "Falta numero_rollo." }, 400);

    // Máquina válida
    const { data: maq, error: mErr } = await admin
      .from("maquinas").select("id, codigo, activo").eq("id", maquinaId).maybeSingle();
    if (mErr || !maq || !maq.activo) return json({ error: "Máquina no encontrada." }, 400);

    // Duplicado
    const { data: dup } = await admin
      .from("pesajes_bobina_madre").select("id")
      .eq("maquina_id", maquinaId).eq("numero_rollo", numeroRollo).maybeSingle();
    if (dup) return json({ error: `El rollo ${numeroRollo} ya tiene un pesaje registrado en ${maq.codigo}.` }, 409);

    // Descargar evidencia
    const { data: fileData, error: dlErr } = await admin.storage.from(BUCKET).download(evidenciaPath);
    if (dlErr || !fileData) return json({ error: `No se pudo leer la evidencia: ${dlErr?.message ?? "desconocido"}` }, 400);
    const buf = new Uint8Array(await fileData.arrayBuffer());
    const b64 = base64Encode(buf);
    const mime = fileData.type || "image/jpeg";

    // Gemini OCR
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: mime, data: b64 } },
            ],
          }],
          generationConfig: { temperature: 0, responseMimeType: "application/json" },
        }),
      },
    );
    if (!resp.ok) {
      const t = await resp.text();
      return json({ error: `Gemini falló: ${resp.status} ${t.slice(0, 300)}` }, 502);
    }
    const gj = await resp.json();
    const text: string = gj?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    let parsed: Gemini;
    try { parsed = JSON.parse(text); }
    catch {
      return json({ aceptado: false, motivo_rechazo: "No se pudo interpretar la lectura del OCR." }, 200);
    }

    // Validaciones estrictas
    const rechazos: string[] = [];
    if ((parsed.confianza ?? 0) < UMBRAL) rechazos.push(`Confianza ${parsed.confianza ?? 0}% menor a ${UMBRAL}%`);
    if (!parsed.numero_unico) rechazos.push("No se identifica un único número principal");
    if (!parsed.display_completo) rechazos.push("Display incompleto o desenfocado");
    if (parsed.reflejos) rechazos.push("Reflejos cubren los dígitos");
    if (parsed.digitos_ambiguos) rechazos.push("Dígitos incompletos o ambiguos");
    if ((parsed.unidad ?? "").toLowerCase() !== "kg") rechazos.push("La unidad visible no es kg");
    if (parsed.peso_kg == null || !isFinite(parsed.peso_kg)) rechazos.push("No se detectó un peso numérico");
    if (parsed.peso_kg != null && parsed.peso_kg <= PESO_MIN) rechazos.push(`El peso (${parsed.peso_kg} kg) no es mayor a ${PESO_MIN} kg`);

    if (rechazos.length > 0) {
      return json({ aceptado: false, motivo_rechazo: rechazos.join(" · "), confianza: parsed.confianza }, 200);
    }

    // Convertir a entero y restar la tara correspondiente a la máquina
    const pesoBruto = Math.round(parsed.peso_kg as number);
    const pesoEje = taraPorMaquina(maq.codigo);
    if (pesoBruto <= pesoEje) {
      return json({ aceptado: false, motivo_rechazo: `El peso bruto (${pesoBruto} kg) debe ser mayor a la tara de la máquina (${pesoEje} kg).`, confianza: parsed.confianza }, 200);
    }
    const pesoNeto = pesoBruto - pesoEje;

    // Orden opcional
    let ordenProduccionId: string | null = null;
    if (numeroOrden) {
      const { data: ord } = await admin.from("ordenes_produccion")
        .select("id").eq("numero_orden", numeroOrden).maybeSingle();
      if (ord) ordenProduccionId = ord.id;
    }

    // Insertar registro definitivo
    const { data: ins, error: insErr } = await admin.from("pesajes_bobina_madre").insert({
      numero_rollo: numeroRollo,
      maquina_id: maquinaId,
      maquina_codigo: maq.codigo,
      orden_produccion_id: ordenProduccionId,
      numero_orden: numeroOrden,
      peso_bruto_kg: pesoBruto,
      peso_eje_kg: pesoEje,
      peso_neto_kg: pesoNeto,
      fecha_hora_pesaje: fechaHora ?? new Date().toISOString(),
      evidencia_path: evidenciaPath,
      ocr_confianza: parsed.confianza,
      ocr_raw: parsed as never,
      capturado_por: uid,
    }).select("*").single();

    if (insErr || !ins) return json({ error: `No se pudo registrar el pesaje: ${insErr?.message ?? "desconocido"}` }, 500);

    return json({ aceptado: true, registro: ins }, 200);
  } catch (e) {
    return json({ error: `Error inesperado: ${(e as Error).message}` }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function base64Encode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
