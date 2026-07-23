// Función PARALELA de diagnóstico — analizar-peso-bobina-v2
// NO reemplaza a analizar-peso-bobina. NO inserta a menos que dryRun=false y se autorice.
// Recibe multipart/form-data con la fotografía en memoria. NO usa Storage.
// No registra imagen, base64, tokens, encabezados ni claves.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

function base64Encode(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const UMBRAL = 85;
const PESO_MIN = 100;
const MAX_BYTES = 900 * 1024; // 900 KB duro
const ACCEPTED_MIMES = new Set(["image/jpeg", "image/jpg"]);

const TARA_POR_MAQUINA: Record<string, number> = {
  "MP-04": 560, "MP-05": 750, "MP-06": 1160, "MP-07": 0,
};
const taraPorMaquina = (c: string) => TARA_POR_MAQUINA[c] ?? 300;

const PROMPT = `Eres un OCR industrial para básculas. Analiza la fotografía del display.
Devuelve EXCLUSIVAMENTE JSON:
{"peso_kg":<num|null>,"unidad":"kg"|"lb"|"g"|null,"confianza":<0-100>,
 "display_completo":<bool>,"numero_unico":<bool>,"reflejos":<bool>,
 "digitos_ambiguos":<bool>,"observaciones":"<texto>"}`;

interface Gemini {
  peso_kg: number | null; confianza: number; unidad: string | null;
  display_completo: boolean; numero_unico: boolean;
  reflejos: boolean; digitos_ambiguos: boolean; observaciones: string;
}

interface Etapa { etapa: string; ts: string; ms?: number; extra?: Record<string, unknown> }

Deno.serve(async (req) => {
  const requestIdHeader = req.headers.get("x-request-id");
  const requestId = requestIdHeader && /^[0-9a-fA-F-]{8,}$/.test(requestIdHeader)
    ? requestIdHeader : crypto.randomUUID();
  const t0 = Date.now();
  const etapas: Etapa[] = [];
  const mark = (etapa: string, extra?: Record<string, unknown>) => {
    const e: Etapa = { etapa, ts: new Date().toISOString(), ms: Date.now() - t0, extra };
    etapas.push(e);
    console.log(`[${requestId}] ${etapa} +${e.ms}ms`, extra ? JSON.stringify(extra) : "");
  };

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido.", requestId, etapas }, 405);

  try {
    // 1. session_validation
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ success: false, stage: "authentication", code: "AUTH_SESSION_MISSING", message: "Falta autenticación.", requestId, etapas }, 401);
    }
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const userClient = createClient(supaUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ success: false, stage: "authentication", code: "AUTH_SESSION_MISSING", message: "No autenticado.", requestId, etapas }, 401);
    mark("session_validation", { uid_ok: true });

    // 1b. authorization — solo administradores autorizados
    const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supaUrl, svcKey);
    const { data: roleRows } = await admin
      .from("user_roles").select("role").eq("user_id", userData.user.id);
    const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
    const ADMIN_ROLES = new Set(["administrador", "gerente_general", "direccion"]);
    const isAdmin = roles.some((r) => ADMIN_ROLES.has(r));
    if (!isAdmin) {
      return json({
        success: false, stage: "authorization", code: "ADMIN_ACCESS_REQUIRED",
        message: "No cuenta con autorización para ejecutar esta prueba.", requestId, etapas,
      }, 403);
    }
    mark("authorization", { admin: true });

    // 2. parse multipart
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      return json({ error: "Se requiere multipart/form-data.", requestId, etapas }, 400);
    }
    const form = await req.formData();
    const file = form.get("file");
    const maquinaId = String(form.get("maquina_id") ?? "").trim();
    const maquinaCodigo = String(form.get("maquina_codigo") ?? "").trim();
    const numeroRollo = String(form.get("numero_rollo") ?? "").trim();
    const numeroOrden = String(form.get("numero_orden") ?? "").trim() || null;
    const dryRun = String(form.get("dryRun") ?? "true").toLowerCase() !== "false";

    if (!(file instanceof File)) return json({ error: "Falta archivo (campo 'file').", requestId, etapas }, 400);
    if (!maquinaId || !maquinaCodigo) return json({ error: "Falta máquina.", requestId, etapas }, 400);
    if (!numeroRollo) return json({ error: "Falta numero_rollo.", requestId, etapas }, 400);

    // 3. image_validation
    const size = file.size;
    const mime = (file.type || "").toLowerCase();
    if (!ACCEPTED_MIMES.has(mime)) {
      return json({ error: `MIME no aceptado: ${mime || "desconocido"}. Solo image/jpeg.`, requestId, etapas }, 415);
    }
    if (size <= 0) return json({ error: "Archivo vacío.", requestId, etapas }, 400);
    if (size > MAX_BYTES) {
      return json({ error: `Imagen ${size} bytes supera el máximo de ${MAX_BYTES} bytes.`, requestId, etapas }, 413);
    }
    mark("image_validation", { size, mime, dryRun });

    const buf = new Uint8Array(await file.arrayBuffer());
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) return json({ error: "GEMINI_API_KEY no configurada.", requestId, etapas }, 500);

    // 4. ocr
    mark("ocr_started");
    const ocrStart = Date.now();
    const b64 = base64Encode(buf);
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [
            { text: PROMPT },
            { inline_data: { mime_type: mime, data: b64 } },
          ]}],
          generationConfig: { temperature: 0, responseMimeType: "application/json" },
        }),
      },
    );
    if (!resp.ok) {
      const t = await resp.text();
      mark("ocr_completed", { http: resp.status, ok: false });
      return json({ error: `Gemini falló: ${resp.status} ${t.slice(0, 200)}`, requestId, etapas }, 502);
    }
    const gj = await resp.json();
    const text: string = gj?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    let parsed: Gemini;
    try { parsed = JSON.parse(text); }
    catch {
      mark("ocr_completed", { parse: false });
      return json({ aceptado: false, motivo_rechazo: "OCR ilegible.", requestId, etapas }, 200);
    }
    mark("ocr_completed", {
      ms: Date.now() - ocrStart,
      confianza: parsed.confianza,
      peso_kg: parsed.peso_kg,
      unidad: parsed.unidad,
    });

    // Validaciones
    const rechazos: string[] = [];
    if ((parsed.confianza ?? 0) < UMBRAL) rechazos.push(`Confianza ${parsed.confianza ?? 0}% < ${UMBRAL}%`);
    if (!parsed.numero_unico) rechazos.push("No hay número único");
    if (!parsed.display_completo) rechazos.push("Display incompleto");
    if (parsed.reflejos) rechazos.push("Reflejos");
    if (parsed.digitos_ambiguos) rechazos.push("Dígitos ambiguos");
    if ((parsed.unidad ?? "").toLowerCase() !== "kg") rechazos.push("Unidad no es kg");
    if (parsed.peso_kg == null || !isFinite(parsed.peso_kg)) rechazos.push("Sin peso numérico");
    if (parsed.peso_kg != null && parsed.peso_kg <= PESO_MIN) rechazos.push(`Peso ≤ ${PESO_MIN} kg`);

    if (rechazos.length) {
      mark("response_sent", { aceptado: false });
      return json({ aceptado: false, motivo_rechazo: rechazos.join(" · "), confianza: parsed.confianza, requestId, etapas }, 200);
    }

    const pesoBruto = Math.round(parsed.peso_kg as number);
    const pesoEje = taraPorMaquina(maquinaCodigo);
    if (pesoBruto <= pesoEje) {
      mark("response_sent", { aceptado: false, tara: true });
      return json({ aceptado: false, motivo_rechazo: `Bruto ${pesoBruto} ≤ tara ${pesoEje}.`, requestId, etapas }, 200);
    }
    const pesoNeto = pesoBruto - pesoEje;

    // dryRun: no insertar, no tocar Storage
    if (dryRun) {
      mark("response_sent", { dryRun: true });
      return json({
        aceptado: true, dryRun: true, requestId,
        peso_bruto_kg: pesoBruto, peso_eje_kg: pesoEje, peso_neto_kg: pesoNeto,
        confianza: parsed.confianza, unidad: parsed.unidad,
        maquina_codigo: maquinaCodigo, numero_rollo: numeroRollo, numero_orden: numeroOrden,
        storage_writes: 0, db_writes: 0, etapas,
      }, 200);
    }

    // Modo productivo (deshabilitado hasta autorización). Placeholder explícito.
    return json({
      error: "Inserción productiva no habilitada en v2. Requiere autorización tras prueba física.",
      requestId, etapas,
    }, 403);
  } catch (e) {
    console.error(`[${requestId}] Error`, e);
    return json({ error: `Error inesperado: ${(e as Error).message}`, requestId, etapas }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}
