// =============================================================================
// Capa única de envío de correo del sistema.
// El proveedor (hoy Resend) queda encapsulado aquí; el resto de la app solo
// debe usar sendSystemEmail(). Migrar de proveedor = cambiar este archivo.
// SERVER ONLY — RESEND_API_KEY nunca debe llegar al frontend.
// =============================================================================

export const SYSTEM_EMAIL_FROM = "ConvertiPap Reportes <noreply.reportes@notify.convertipap.site>";

export type SystemEmailAttachment = {
  filename: string;
  /** Contenido en base64 */
  content: string;
  contentType?: string;
  /** Identificador para imágenes en línea referenciadas como cid:... en el HTML */
  contentId?: string;
};

export type SystemEmailInput = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  attachments?: SystemEmailAttachment[];
  /** Sobrescribe el remitente por defecto (debe pertenecer al dominio verificado) */
  from?: string;
};

export type SystemEmailResult =
  | { ok: true; id: string | null; provider: "resend" }
  | { ok: false; error: string; status?: number; provider: "resend" };

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function toArray(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
}

/**
 * Envía un correo del sistema. Única puerta de salida de correo de la app.
 */
export async function sendSystemEmail(input: SystemEmailInput): Promise<SystemEmailResult> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) {
    const error = "RESEND_API_KEY no está configurada en el servidor.";
    console.error(`[email] ${error}`);
    return { ok: false, error, provider: "resend" };
  }

  const to = toArray(input.to) ?? [];
  if (to.length === 0) {
    return { ok: false, error: "Se requiere al menos un destinatario.", provider: "resend" };
  }
  if (!input.html && !input.text) {
    return { ok: false, error: "Se requiere contenido html o text.", provider: "resend" };
  }

  const payload: Record<string, unknown> = {
    from: input.from ?? SYSTEM_EMAIL_FROM,
    to,
    subject: input.subject,
  };
  if (input.html) payload["html"] = input.html;
  if (input.text) payload["text"] = input.text;
  const cc = toArray(input.cc);
  if (cc) payload["cc"] = cc;
  const bcc = toArray(input.bcc);
  if (bcc) payload["bcc"] = bcc;
  if (input.replyTo) payload["reply_to"] = input.replyTo;
  if (input.attachments?.length) {
    payload["attachments"] = input.attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
      ...(a.contentType ? { content_type: a.contentType } : {}),
      ...(a.contentId ? { content_id: a.contentId } : {}),
    }));
  }

  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[email] Fallo de red al contactar al proveedor: ${error}`);
    return { ok: false, error, provider: "resend" };
  }

  const body = await response.text();
  if (!response.ok) {
    console.error(`[email] Envío rechazado [${response.status}]: ${body}`);
    return { ok: false, error: body, status: response.status, provider: "resend" };
  }

  let id: string | null = null;
  try {
    const parsed = JSON.parse(body) as { id?: string };
    id = parsed.id ?? null;
  } catch {
    id = null;
  }
  return { ok: true, id, provider: "resend" };
}
