// Registro seguro de pesaje de bobina madre — Refinamiento OCR v3.
// Estados: accepted | confirm | retake | technical_error (uno solo por captura).
// - Kilogramos asumidos por configuración de proceso (no bloquear por ausencia visual de "kg").
// - Segunda revisión automática ante duda antes de rechazar.
// - Solo bloquea por unidad cuando Gemini identifica explícitamente lb/oz/g/etc.
// - Preserva: autenticación, taras, tablas, selección dinámica de modelo Gemini.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

function base64Encode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const BUCKET = "pesajes-evidencia";
const MIN_PESO_BRUTO_KG = 100;
const MAX_PESO_BRUTO_KG = 5000;

const TARA_POR_MAQUINA: Record<string, number> = {
  "MP-04": 560,
  "MP-05": 750,
  "MP-06": 1160,
  "MP-07": 0,
};
function taraPorMaquina(codigo: string): number {
  return TARA_POR_MAQUINA[codigo] ?? 300;
}

const UNIDADES_DIFERENTES = /^\s*(lb|lbs|libras?|oz|onzas?|t|ton|toneladas?|g|gr|gram(o|os))\s*$/i;

interface GeminiCandidato { peso: number | null; confianza: number; evidencia?: string }
interface GeminiOut {
  displayDetectado: boolean;
  displayCompleto: boolean;
  textoVisible: string;
  pesoPrincipal: number | null;
  candidatos: GeminiCandidato[];
  unidadVisible: string;
  unidadConfirmada: string;
  reflejo: boolean;
  reflejoSevero: boolean;
  desenfoque: boolean;
  desenfoqueSevero: boolean;
  decimalDudoso: boolean;
  digitosCubiertos: boolean;
  cantidadDigitosVisibles: number;
  calidadImagen: number;
  confianzaGeneral: number;
  lecturaConfirmable: boolean;
  requiereSegundaRevision: boolean;
}

const PROMPT_BASE = `Eres un OCR industrial para básculas. Analiza la fotografía del display.
El proceso opera exclusivamente en kilogramos; la ausencia visual de "kg" NO es un error.
Devuelve EXCLUSIVAMENTE un JSON estricto con esta estructura (sin texto fuera del JSON):
{
 "displayDetectado": <bool>,
 "displayCompleto": <bool>,
 "textoVisible": "<texto>",
 "pesoPrincipal": <número o null>,
 "candidatos": [{"peso": <número>, "confianza": <0-100>, "evidencia": "<texto>"}],
 "unidadVisible": "<texto>",
 "unidadConfirmada": "kg",
 "reflejo": <bool>,
 "reflejoSevero": <bool>,
 "desenfoque": <bool>,
 "desenfoqueSevero": <bool>,
 "decimalDudoso": <bool>,
 "digitosCubiertos": <bool>,
 "cantidadDigitosVisibles": <entero>,
 "calidadImagen": <0-100>,
 "confianzaGeneral": <0-100>,
 "lecturaConfirmable": <bool>,
 "requiereSegundaRevision": <bool>
}
Basa la decisión únicamente en evidencia visual. No inventes dígitos. No modifiques el peso solo para que entre en un rango esperado.`;

function promptSegundaRevision(primera: GeminiOut, maquinaCodigo: string) {
  const cands = (primera.candidatos ?? []).map((c) => `${c.peso}kg(${c.confianza}%)`).join(", ") || "—";
  return `Analiza NUEVAMENTE el display de esta báscula industrial (bobina madre).
Primera lectura: ${primera.pesoPrincipal} kg. Candidatos iniciales: ${cands}.
Rango operativo habitual: ${MIN_PESO_BRUTO_KG}-${MAX_PESO_BRUTO_KG} kg. Máquina: ${maquinaCodigo}.
Verifica: (1) todos los dígitos, (2) segmentos parcialmente encendidos, (3) segmentos cubiertos por reflejos,
(4) posición real del punto decimal, (5) ceros omitidos, (6) si 81.5 podría ser 815, 124.5 podría ser 1245,
150 podría ser 1500, (7) primer/último dígito faltante, (8) display completo.
No cambies la lectura solo para colocarla en el rango. No inventes dígitos. No uses la tara para modificar el bruto.
${PROMPT_BASE}`;
}

// --------- Selección de modelo Gemini (rápida) ---------------------
// Se usa un modelo fijo por defecto para EVITAR la llamada previa a /models
// (ahorra ~300-900 ms por captura). El descubrimiento dinámico sólo se ejecuta
// si el modelo por defecto deja de existir (404/400) y se cachea en memoria.
const MODELO_PREFERENCIA = [
  "gemini-2.0-flash",
  "gemini-flash-latest",
  "gemini-2.0-flash-001",
  "gemini-2.5-flash-preview-05-20",
];
let MODELO_CACHE: string | null = MODELO_PREFERENCIA[0];
async function descubrirModeloGemini(apiKey: string, requestId: string): Promise<string | null> {
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!r.ok) {
      console.log(`[${requestId}] /models HTTP ${r.status} — fallback estático`);
      return MODELO_PREFERENCIA[1];
    }
    const body = await r.json() as { models?: Array<{ name?: string; supportedGenerationMethods?: string[] }> };
    const disponibles = (body.models ?? [])
      .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
      .map((m) => (m.name ?? "").replace(/^models\//, ""))
      .filter((n) => n && n.includes("flash") && !n.includes("lite") && !n.includes("thinking"));
    for (const pref of MODELO_PREFERENCIA) if (disponibles.includes(pref)) return pref;
    if (disponibles.length > 0) return disponibles.sort().reverse()[0];
    return null;
  } catch (e) {
    console.log(`[${requestId}] /models fallo: ${(e as Error).message}`);
    return MODELO_PREFERENCIA[1];
  }
}

// --------- Parseo defensivo de JSON de Gemini ----------------------
function parseGeminiJson(raw: string): GeminiOut | null {
  if (!raw) return null;
  let s = raw.trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  const i = s.indexOf("{"); const j = s.lastIndexOf("}");
  if (i < 0 || j < 0) return null;
  s = s.slice(i, j + 1);
  try {
    const o = JSON.parse(s);
    const num = (v: unknown): number | null => {
      if (v == null) return null;
      if (typeof v === "number") return isFinite(v) ? v : null;
      if (typeof v === "string") {
        const cleaned = v.replace(/\s/g, "").replace(",", ".");
        const n = Number(cleaned);
        return isFinite(n) ? n : null;
      }
      return null;
    };
    const cands: GeminiCandidato[] = Array.isArray(o.candidatos)
      ? o.candidatos.map((c: Record<string, unknown>) => ({
          peso: num(c.peso), confianza: Number(c.confianza) || 0, evidencia: String(c.evidencia ?? ""),
        })).filter((c: GeminiCandidato) => c.peso != null)
      : [];
    return {
      displayDetectado: !!o.displayDetectado,
      displayCompleto: !!o.displayCompleto,
      textoVisible: String(o.textoVisible ?? ""),
      pesoPrincipal: num(o.pesoPrincipal),
      candidatos: cands,
      unidadVisible: String(o.unidadVisible ?? ""),
      unidadConfirmada: String(o.unidadConfirmada ?? "kg"),
      reflejo: !!o.reflejo,
      reflejoSevero: !!o.reflejoSevero,
      desenfoque: !!o.desenfoque,
      desenfoqueSevero: !!o.desenfoqueSevero,
      decimalDudoso: !!o.decimalDudoso,
      digitosCubiertos: !!o.digitosCubiertos,
      cantidadDigitosVisibles: Number(o.cantidadDigitosVisibles) || 0,
      calidadImagen: Number(o.calidadImagen) || 0,
      confianzaGeneral: Number(o.confianzaGeneral) || 0,
      lecturaConfirmable: !!o.lecturaConfirmable,
      requiereSegundaRevision: !!o.requiereSegundaRevision,
    };
  } catch { return null; }
}

/** Redondeo a 2 decimales — el display puede mostrar fracciones (ej. 812.5 kg). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const GEMINI_TIMEOUT_MS = 45_000;

async function invocarGemini(apiKey: string, modelo: string, prompt: string, mime: string, b64: string): Promise<GeminiOut | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GEMINI_TIMEOUT_MS);
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [
            { text: prompt },
            { inline_data: { mime_type: mime, data: b64 } },
          ]}],
          // maxOutputTokens acota la generación (el JSON es corto) y recorta latencia.
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            maxOutputTokens: 700,
            candidateCount: 1,
          },
        }),
      },
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const gj = await r.json();
    const text: string = gj?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return parseGeminiJson(text);
  } finally {
    clearTimeout(timer);
  }
}

/** Invoca con el modelo cacheado; si el modelo ya no existe, descubre y reintenta una vez. */
async function invocarGeminiConFallback(
  apiKey: string, prompt: string, mime: string, b64: string, requestId: string,
): Promise<{ out: GeminiOut | null; modelo: string }> {
  const modelo = MODELO_CACHE ?? MODELO_PREFERENCIA[0];
  try {
    return { out: await invocarGemini(apiKey, modelo, prompt, mime, b64), modelo };
  } catch (e) {
    const msg = (e as Error).message;
    if (!/HTTP (400|403|404)/.test(msg)) throw e;
    const nuevo = await descubrirModeloGemini(apiKey, requestId);
    if (!nuevo) throw e;
    MODELO_CACHE = nuevo;
    console.log(`[${requestId}] modelo re-descubierto: ${nuevo}`);
    return { out: await invocarGemini(apiKey, nuevo, prompt, mime, b64), modelo: nuevo };
  }
}

// --------- Evaluación y prioridad -----------------------------------
type Status = "accepted" | "confirm" | "retake" | "technical_error";
type ReasonCode =
  | "WEIGHT_CONFIRMED" | "WEIGHT_REQUIRES_CONFIRMATION" | "GROSS_WEIGHT_BELOW_TARE"
  | "DISPLAY_NOT_FOUND" | "INCOMPLETE_DISPLAY" | "BLURRY_IMAGE" | "DISPLAY_REFLECTION"
  | "UNCERTAIN_DECIMAL" | "AMBIGUOUS_DIGITS" | "WEIGHT_OUT_OF_RANGE"
  | "DIFFERENT_UNIT_CONFIRMED" | "TECHNICAL_ERROR" | "SESSION_EXPIRED";

interface Analisis {
  status: Status; reasonCode: ReasonCode; message: string;
  pesoDetectado: number | null; confianza: number; calidadImagen: number;
  requiereConfirmacion: boolean; unidadAsumidaPorConfiguracion: boolean;
}

function evaluar(g1: GeminiOut, g2: GeminiOut | null): Analisis {
  const g = g2 ?? g1;
  const conf = g.confianzaGeneral;
  const cal = g.calidadImagen;
  const peso = g.pesoPrincipal;
  const unidadDiferente = UNIDADES_DIFERENTES.test((g.unidadVisible || "").trim()) && conf >= 85;

  // Prioridad de rechazos técnicos primero
  if (unidadDiferente) {
    return { status: "retake", reasonCode: "DIFFERENT_UNIT_CONFIRMED",
      message: "El display muestra una unidad diferente a kilogramos. Verifica la báscula.",
      pesoDetectado: peso, confianza: conf, calidadImagen: cal,
      requiereConfirmacion: false, unidadAsumidaPorConfiguracion: false };
  }
  if (!g.displayDetectado) {
    return { status: "retake", reasonCode: "DISPLAY_NOT_FOUND",
      message: "No se identificó el display de la báscula. Colócalo dentro del recuadro y toma otra fotografía.",
      pesoDetectado: null, confianza: conf, calidadImagen: cal,
      requiereConfirmacion: false, unidadAsumidaPorConfiguracion: true };
  }
  if (g.desenfoqueSevero || cal < 55) {
    return { status: "retake", reasonCode: "BLURRY_IMAGE",
      message: "La imagen no permite leer el peso. Acerca la cámara, mantenla fija y vuelve a tomarla.",
      pesoDetectado: peso, confianza: conf, calidadImagen: cal,
      requiereConfirmacion: false, unidadAsumidaPorConfiguracion: true };
  }
  if (!g.displayCompleto) {
    return { status: "retake", reasonCode: "INCOMPLETE_DISPLAY",
      message: "El display no aparece completo. Incluye todos los dígitos y toma otra fotografía.",
      pesoDetectado: peso, confianza: conf, calidadImagen: cal,
      requiereConfirmacion: false, unidadAsumidaPorConfiguracion: true };
  }
  if (g.reflejoSevero) {
    return { status: "retake", reasonCode: "DISPLAY_REFLECTION",
      message: "El reflejo impide confirmar los dígitos. Cambia ligeramente el ángulo y toma otra fotografía.",
      pesoDetectado: peso, confianza: conf, calidadImagen: cal,
      requiereConfirmacion: false, unidadAsumidaPorConfiguracion: true };
  }
  if (peso == null || !isFinite(peso) || peso <= 0) {
    return { status: "retake", reasonCode: "AMBIGUOUS_DIGITS",
      message: "No fue posible confirmar todos los dígitos. Toma nuevamente la fotografía.",
      pesoDetectado: null, confianza: conf, calidadImagen: cal,
      requiereConfirmacion: false, unidadAsumidaPorConfiguracion: true };
  }
  if (conf < 60) {
    return { status: "retake", reasonCode: g.decimalDudoso ? "UNCERTAIN_DECIMAL" : "AMBIGUOUS_DIGITS",
      message: g.decimalDudoso
        ? "No fue posible confirmar la posición del decimal. Toma otra fotografía más cercana."
        : "No fue posible confirmar todos los dígitos. Toma nuevamente la fotografía.",
      pesoDetectado: peso, confianza: conf, calidadImagen: cal,
      requiereConfirmacion: false, unidadAsumidaPorConfiguracion: true };
  }

  const enRango = peso >= MIN_PESO_BRUTO_KG && peso <= MAX_PESO_BRUTO_KG;

  // Aceptación automática
  if (conf >= 88 && cal >= 70 && enRango && !g.decimalDudoso && !g.digitosCubiertos && !g.reflejo) {
    return { status: "accepted", reasonCode: "WEIGHT_CONFIRMED",
      message: "Peso identificado correctamente.",
      pesoDetectado: peso, confianza: conf, calidadImagen: cal,
      requiereConfirmacion: false, unidadAsumidaPorConfiguracion: true };
  }

  // Fuera de rango pero legible → confirmar
  if (!enRango) {
    return { status: "confirm", reasonCode: "WEIGHT_OUT_OF_RANGE",
      message: `El peso detectado (${peso} kg) está fuera del rango esperado. Confirma que coincida con el display.`,
      pesoDetectado: peso, confianza: conf, calidadImagen: cal,
      requiereConfirmacion: true, unidadAsumidaPorConfiguracion: true };
  }

  // Zona de confirmación (70-87 ó dudas moderadas)
  return { status: "confirm", reasonCode: "WEIGHT_REQUIRES_CONFIRMATION",
    message: `Se detectó un peso de ${peso} kg. Confirma que coincida con el display.`,
    pesoDetectado: peso, confianza: conf, calidadImagen: cal,
    requiereConfirmacion: true, unidadAsumidaPorConfiguracion: true };
}

function requiereSegundaRevision(g: GeminiOut): boolean {
  if (g.requiereSegundaRevision) return true;
  const c = g.confianzaGeneral;
  if (c >= 60 && c < 88) return true;
  if (g.pesoPrincipal != null && (g.pesoPrincipal < MIN_PESO_BRUTO_KG || g.pesoPrincipal > MAX_PESO_BRUTO_KG)) return true;
  if (g.decimalDudoso || g.reflejo || g.digitosCubiertos) return true;
  if ((g.candidatos ?? []).length > 1) return true;
  return false;
}

// --------- Handler HTTP --------------------------------------------
Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const t0 = Date.now();

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ status: "technical_error", reasonCode: "TECHNICAL_ERROR", message: "Método no permitido.", requestId }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ status: "technical_error", reasonCode: "SESSION_EXPIRED", message: "Tu sesión expiró. Inicia sesión nuevamente.", requestId }, 401);
    }
    const token = authHeader.replace("Bearer ", "").trim();

    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) return json({ status: "technical_error", reasonCode: "TECHNICAL_ERROR", message: "No fue posible procesar la fotografía. Intenta nuevamente.", requestId }, 500);

    const admin = createClient(supaUrl, svcKey);
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const userClient = createClient(supaUrl, anonKey, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData.user) {
      return json({ status: "technical_error", reasonCode: "SESSION_EXPIRED", message: "Tu sesión expiró. Inicia sesión nuevamente.", requestId }, 401);
    }
    const uid = userData.user.id;

    const body = await req.json().catch(() => ({}));
    if (body?.test === true) return json({ ok: true, requestId }, 200);

    const evidenciaPath: string | undefined = body?.evidencia_path ?? body?.storagePath;
    const maquinaId: string | undefined = body?.maquina_id;
    const numeroRollo: string | undefined = (body?.numero_rollo ?? "").toString().trim() || undefined;
    const numeroOrden: string | null = body?.numero_orden ? String(body.numero_orden).trim() : null;
    const fechaHora: string | undefined = body?.fecha_hora_pesaje;
    const pesoConfirmadoKg: number | null = typeof body?.pesoConfirmadoKg === "number" && isFinite(body.pesoConfirmadoKg)
      ? body.pesoConfirmadoKg : null;
    const idempotencyKey: string | null = body?.idempotencyKey ? String(body.idempotencyKey) : null;

    if (!evidenciaPath || !maquinaId || !numeroRollo) {
      return json({ status: "technical_error", reasonCode: "TECHNICAL_ERROR", message: "No fue posible procesar la fotografía. Intenta nuevamente.", requestId }, 400);
    }

    const { data: maq } = await admin.from("maquinas").select("id, codigo, activo").eq("id", maquinaId).maybeSingle();
    if (!maq || !maq.activo) {
      return json({ status: "technical_error", reasonCode: "TECHNICAL_ERROR", message: "No fue posible procesar la fotografía. Intenta nuevamente.", requestId }, 400);
    }

    // Duplicado por rollo/máquina
    const { data: dup } = await admin.from("pesajes_bobina_madre")
      .select("id").eq("maquina_id", maquinaId).eq("numero_rollo", numeroRollo).maybeSingle();
    if (dup) {
      return json({ status: "technical_error", reasonCode: "TECHNICAL_ERROR",
        message: `El rollo ${numeroRollo} ya tiene un pesaje registrado en ${maq.codigo}.`, requestId }, 409);
    }

    // Duplicado por evidencia (misma imagen ya insertada)
    const { data: dupEv } = await admin.from("pesajes_bobina_madre")
      .select("id").eq("evidencia_path", evidenciaPath).maybeSingle();
    if (dupEv) {
      return json({ status: "technical_error", reasonCode: "TECHNICAL_ERROR",
        message: "Esta fotografía ya fue registrada.", requestId }, 409);
    }

    // --------- Rama de CONFIRMACIÓN (usuario ya validó lectura) --------
    if (pesoConfirmadoKg != null) {
      const bruto = Math.round(pesoConfirmadoKg);
      const tara = taraPorMaquina(maq.codigo);
      const neto = bruto - tara;
      if (neto <= 0) {
        return json({ status: "confirm", reasonCode: "GROSS_WEIGHT_BELOW_TARE",
          message: "El peso confirmado no permite calcular un peso neto válido. Verifica el display.",
          pesoDetectado: bruto, requiereConfirmacion: false, requestId }, 200);
      }

      let ordenProduccionId: string | null = null;
      if (numeroOrden) {
        const { data: ord } = await admin.from("ordenes_produccion")
          .select("id").eq("numero_orden", numeroOrden).maybeSingle();
        if (ord) ordenProduccionId = ord.id;
      }

      const { data: ins, error: insErr } = await admin.from("pesajes_bobina_madre").insert({
        numero_rollo: numeroRollo, maquina_id: maquinaId, maquina_codigo: maq.codigo,
        orden_produccion_id: ordenProduccionId, numero_orden: numeroOrden,
        peso_bruto_kg: bruto, peso_eje_kg: tara, peso_neto_kg: neto,
        fecha_hora_pesaje: fechaHora ?? new Date().toISOString(),
        evidencia_path: evidenciaPath, ocr_confianza: 100,
        ocr_raw: { confirmadoManual: true, idempotencyKey } as never,
        capturado_por: uid,
      }).select("*").single();
      if (insErr || !ins) {
        return json({ status: "technical_error", reasonCode: "TECHNICAL_ERROR",
          message: "No fue posible procesar la fotografía. Intenta nuevamente.", requestId }, 500);
      }
      console.log(`[${requestId}] insert-confirm ok ${Date.now() - t0}ms`);
      return json({ status: "accepted", reasonCode: "WEIGHT_CONFIRMED",
        message: "Peso confirmado y registrado correctamente.",
        pesoDetectado: bruto, pesoConfirmado: bruto, unidad: "kg",
        unidadAsumidaPorConfiguracion: true, requiereConfirmacion: false,
        confianza: 100, calidadImagen: 100, requestId, registro: ins }, 200);
    }

    // --------- Rama de ANÁLISIS OCR -----------------------------------
    const { data: fileData, error: dlErr } = await admin.storage.from(BUCKET).download(evidenciaPath);
    if (dlErr || !fileData) {
      return json({ status: "technical_error", reasonCode: "TECHNICAL_ERROR",
        message: "No fue posible procesar la fotografía. Intenta nuevamente.", requestId }, 400);
    }
    const buf = new Uint8Array(await fileData.arrayBuffer());
    const b64 = base64Encode(buf);
    const mime = fileData.type || "image/jpeg";

    const modelo = await elegirModeloGemini(geminiKey, requestId);
    if (!modelo) {
      return json({ status: "technical_error", reasonCode: "TECHNICAL_ERROR",
        message: "No fue posible procesar la fotografía. Intenta nuevamente.", requestId }, 502);
    }

    let g1: GeminiOut | null;
    try { g1 = await invocarGemini(geminiKey, modelo, PROMPT_BASE, mime, b64); }
    catch (e) {
      console.log(`[${requestId}] gemini-1 fail ${(e as Error).message}`);
      return json({ status: "technical_error", reasonCode: "TECHNICAL_ERROR",
        message: "No fue posible procesar la fotografía. Intenta nuevamente.", requestId, modelo }, 502);
    }
    if (!g1) {
      return json({ status: "retake", reasonCode: "AMBIGUOUS_DIGITS",
        message: "No fue posible confirmar todos los dígitos. Toma nuevamente la fotografía.",
        pesoDetectado: null, confianza: 0, calidadImagen: 0, unidad: "kg",
        unidadAsumidaPorConfiguracion: true, requiereConfirmacion: false, modelo, requestId }, 200);
    }

    // Segunda revisión automática si aplica
    let g2: GeminiOut | null = null;
    if (requiereSegundaRevision(g1)) {
      try { g2 = await invocarGemini(geminiKey, modelo, promptSegundaRevision(g1, maq.codigo), mime, b64); }
      catch (e) { console.log(`[${requestId}] gemini-2 fail ${(e as Error).message}`); g2 = null; }
    }

    // Si ambas revisiones difieren mucho, forzar confirmar/retake
    let analisis = evaluar(g1, g2);
    if (g2 && g1.pesoPrincipal != null && g2.pesoPrincipal != null && g1.pesoPrincipal !== g2.pesoPrincipal) {
      // Discrepancia: no auto-aceptar
      if (analisis.status === "accepted") {
        analisis = { ...analisis, status: "confirm", reasonCode: "WEIGHT_REQUIRES_CONFIRMATION",
          requiereConfirmacion: true,
          message: `Se detectó un peso de ${analisis.pesoDetectado} kg. Confirma que coincida con el display.` };
      }
    }

    console.log(`[${requestId}] analisis status=${analisis.status} code=${analisis.reasonCode} peso=${analisis.pesoDetectado} conf=${analisis.confianza} cal=${analisis.calidadImagen} rev2=${!!g2} ${Date.now() - t0}ms`);

    // Validar tara vs bruto ANTES de auto-insertar
    if (analisis.status === "accepted" && analisis.pesoDetectado != null) {
      const tara = taraPorMaquina(maq.codigo);
      if (analisis.pesoDetectado <= tara) {
        return json({ status: "confirm", reasonCode: "GROSS_WEIGHT_BELOW_TARE",
          message: `El peso detectado (${analisis.pesoDetectado} kg) requiere confirmación antes de registrarse.`,
          pesoDetectado: analisis.pesoDetectado, confianza: analisis.confianza,
          calidadImagen: analisis.calidadImagen, unidad: "kg", unidadAsumidaPorConfiguracion: true,
          requiereConfirmacion: true, modelo, requestId }, 200);
      }

      const bruto = Math.round(analisis.pesoDetectado);
      const neto = bruto - tara;
      let ordenProduccionId: string | null = null;
      if (numeroOrden) {
        const { data: ord } = await admin.from("ordenes_produccion")
          .select("id").eq("numero_orden", numeroOrden).maybeSingle();
        if (ord) ordenProduccionId = ord.id;
      }
      const { data: ins, error: insErr } = await admin.from("pesajes_bobina_madre").insert({
        numero_rollo: numeroRollo, maquina_id: maquinaId, maquina_codigo: maq.codigo,
        orden_produccion_id: ordenProduccionId, numero_orden: numeroOrden,
        peso_bruto_kg: bruto, peso_eje_kg: tara, peso_neto_kg: neto,
        fecha_hora_pesaje: fechaHora ?? new Date().toISOString(),
        evidencia_path: evidenciaPath, ocr_confianza: analisis.confianza,
        ocr_raw: { g1, g2, idempotencyKey } as never, capturado_por: uid,
      }).select("*").single();
      if (insErr || !ins) {
        return json({ status: "technical_error", reasonCode: "TECHNICAL_ERROR",
          message: "No fue posible procesar la fotografía. Intenta nuevamente.", requestId }, 500);
      }
      return json({ status: "accepted", reasonCode: "WEIGHT_CONFIRMED",
        message: "Peso identificado y registrado correctamente.",
        pesoDetectado: bruto, pesoConfirmado: bruto, unidad: "kg",
        unidadAsumidaPorConfiguracion: true, requiereConfirmacion: false,
        confianza: analisis.confianza, calidadImagen: analisis.calidadImagen,
        modelo, requestId, registro: ins }, 200);
    }

    // confirm | retake — no insertar, devolver estado único
    return json({
      status: analisis.status, reasonCode: analisis.reasonCode, message: analisis.message,
      pesoDetectado: analisis.pesoDetectado, pesoConfirmado: null, unidad: "kg",
      unidadAsumidaPorConfiguracion: analisis.unidadAsumidaPorConfiguracion,
      requiereConfirmacion: analisis.requiereConfirmacion,
      confianza: analisis.confianza, calidadImagen: analisis.calidadImagen, modelo, requestId,
    }, 200);
  } catch (e) {
    console.error(`[${requestId}] error`, e);
    return json({ status: "technical_error", reasonCode: "TECHNICAL_ERROR",
      message: "No fue posible procesar la fotografía. Intenta nuevamente.", requestId }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}
