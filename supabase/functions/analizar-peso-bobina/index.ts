// OCR server-side de peso de bobina madre mediante Gemini API multimodal.
// Recibe { evidencia_path: string } de un bucket privado y devuelve
// { peso_kg, confianza, unidad, motivo_rechazo }.
//
// La API key de Gemini NUNCA se expone al frontend.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UMBRAL = 85;
const PESO_MIN = 300;
const BUCKET = "pesajes-evidencia";

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
    if (!authHeader) {
      return json({ error: "Falta autenticación." }, 401);
    }
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const supaKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) return json({ error: "GEMINI_API_KEY no configurada." }, 500);

    const admin = createClient(supaUrl, supaKey);

    // Validar sesión del caller (con la key publicable)
    const anonUrl = supaUrl;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const userClient = createClient(anonUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return json({ error: "No autenticado." }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const evidenciaPath: string | undefined = body?.evidencia_path;
    if (!evidenciaPath || typeof evidenciaPath !== "string") {
      return json({ error: "Falta evidencia_path." }, 400);
    }

    // Descargar imagen del bucket privado
    const { data: fileData, error: dlErr } = await admin.storage
      .from(BUCKET)
      .download(evidenciaPath);
    if (dlErr || !fileData) {
      return json({ error: `No se pudo descargar la evidencia: ${dlErr?.message ?? "desconocido"}` }, 400);
    }
    const buf = new Uint8Array(await fileData.arrayBuffer());
    const b64 = base64Encode(buf);
    const mime = fileData.type || "image/jpeg";

    // Llamada a Gemini
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: PROMPT },
                { inline_data: { mime_type: mime, data: b64 } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
          },
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
    try {
      parsed = JSON.parse(text);
    } catch {
      return json({
        aceptado: false,
        motivo_rechazo: "No se pudo interpretar la lectura del OCR. Vuelve a tomar la fotografía.",
        raw: text.slice(0, 500),
      }, 200);
    }

    // Validaciones estrictas (aunque confianza >= 85, se aplican TODAS)
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
      return json({
        aceptado: false,
        motivo_rechazo: rechazos.join(" · "),
        confianza: parsed.confianza,
        ocr: parsed,
      }, 200);
    }

    return json({
      aceptado: true,
      peso_kg: parsed.peso_kg,
      confianza: parsed.confianza,
      unidad: parsed.unidad,
      ocr: parsed,
    }, 200);
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
