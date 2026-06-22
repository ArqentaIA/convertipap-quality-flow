// =============================================================================
// Spec Documentos — control documental de especificaciones (Fase 2)
//
// - Carga, listado, descarga (URL firmada) y archivado de evidencia documental
//   asociada a una `producto_especificaciones`.
// - Solo los roles `calidad` y `administrador` pueden cargar/archivar.
// - Cualquier autenticado puede listar y descargar.
// - Tipos permitidos: PDF, JPG, JPEG, PNG. Tamaño máximo: 10 MB.
// - Resuelve la spec por código de producto para mantener la convención de la
//   UI Variables de Calidad (que opera por `codigo`).
// =============================================================================

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type SB = SupabaseClient<Database>;

const BUCKET = "spec-documentos";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
]);

const ROLES_EDIT = new Set(["calidad", "administrador"]);

async function getUserRoles(sb: SB, userId: string): Promise<string[]> {
  const { data, error } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.role as string);
}

async function resolveSpecIdByProductCode(
  sb: SB,
  codigo: string,
  target: "vigente" | "borrador" = "vigente",
): Promise<{ especificacion_id: string; producto_id: string }> {
  const { data: prod, error: pErr } = await sb
    .from("productos")
    .select("id")
    .eq("codigo", codigo)
    .maybeSingle();
  if (pErr) throw new Error(pErr.message);
  if (!prod) throw new Error(`Producto ${codigo} no encontrado`);

  const estados: ("borrador" | "en_revision" | "vigente")[] =
    target === "borrador" ? ["borrador", "en_revision"] : ["vigente"];
  const { data: spec, error: sErr } = await sb
    .from("producto_especificaciones")
    .select("id")
    .eq("producto_id", prod.id)
    .in("estado", estados)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sErr) throw new Error(sErr.message);
  if (!spec) {
    throw new Error(
      target === "borrador"
        ? `No hay borrador activo para ${codigo}`
        : `Sin especificación vigente para ${codigo}`,
    );
  }
  return { especificacion_id: spec.id as string, producto_id: prod.id as string };
}

function sanitizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 120);
}

function decodeBase64(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.split(",", 2)[1]! : b64;
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const buf = await crypto.subtle.digest("SHA-256", ab);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// =============================================================================
// listarDocumentos
// =============================================================================
export const listarDocumentos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        producto_codigo: z.string().min(1),
        target: z.enum(["vigente", "borrador"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const { especificacion_id } = await resolveSpecIdByProductCode(
      sb,
      data.producto_codigo,
      data.target ?? "vigente",
    );
    const { data: rows, error } = await sb
      .from("spec_documentos")
      .select(
        "id, especificacion_id, nombre_archivo, bucket_path, mime_type, tamano_bytes, descripcion, subido_por, subido_at, vigente, archivado_at, motivo_archivado",
      )
      .eq("especificacion_id", especificacion_id)
      .order("subido_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Enriquecer con nombre del usuario
    const userIds = Array.from(
      new Set(
        (rows ?? [])
          .map((r) => r.subido_por as string)
          .filter((id): id is string => !!id),
      ),
    );
    const nameMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profs } = await sb
        .from("profiles")
        .select("id, nombre")
        .in("id", userIds);
      for (const p of profs ?? []) {
        if (p.id && p.nombre) nameMap.set(p.id as string, p.nombre as string);
      }
    }

    return {
      especificacion_id,
      documentos: (rows ?? []).map((r) => ({
        ...r,
        subido_por_nombre: nameMap.get(r.subido_por as string) ?? null,
      })),
    };
  });

// =============================================================================
// subirDocumento — recibe base64, valida, sube a Storage e inserta metadata
// =============================================================================
export const subirDocumento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        producto_codigo: z.string().min(1),
        nombre_archivo: z.string().min(1).max(200),
        mime_type: z.string().min(1),
        contenido_base64: z.string().min(1),
        descripcion: z.string().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const roles = await getUserRoles(sb, context.userId);
    if (!roles.some((r) => ROLES_EDIT.has(r))) {
      throw new Error(
        "Solo los roles Calidad o Administrador pueden cargar evidencia documental.",
      );
    }
    if (!ALLOWED_MIMES.has(data.mime_type.toLowerCase())) {
      throw new Error(
        "Tipo de archivo no permitido. Solo se aceptan PDF, JPG, JPEG o PNG.",
      );
    }

    const bytes = decodeBase64(data.contenido_base64);
    if (bytes.byteLength === 0) throw new Error("Archivo vacío.");
    if (bytes.byteLength > MAX_BYTES) {
      throw new Error(
        `El archivo supera el máximo permitido (10 MB). Tamaño recibido: ${(
          bytes.byteLength /
          1024 /
          1024
        ).toFixed(2)} MB.`,
      );
    }

    const { especificacion_id } = await resolveSpecIdByProductCode(
      sb,
      data.producto_codigo,
    );

    const ext = data.nombre_archivo.split(".").pop()?.toLowerCase() ?? "bin";
    const baseName = sanitizeName(data.nombre_archivo);
    const uniqueId = crypto.randomUUID();
    const bucket_path = `${especificacion_id}/${uniqueId}-${baseName}`;
    const hash = await sha256Hex(bytes);

    const { error: upErr } = await sb.storage
      .from(BUCKET)
      .upload(bucket_path, bytes, {
        contentType: data.mime_type,
        upsert: false,
      });
    if (upErr) throw new Error(`No se pudo subir el archivo: ${upErr.message}`);

    const { data: row, error: insErr } = await sb
      .from("spec_documentos")
      .insert({
        especificacion_id,
        nombre_archivo: baseName.endsWith(`.${ext}`) ? baseName : `${baseName}.${ext}`,
        bucket_path,
        mime_type: data.mime_type,
        tamano_bytes: bytes.byteLength,
        hash_sha256: hash,
        descripcion: data.descripcion ?? null,
        subido_por: context.userId,
      })
      .select("id")
      .single();

    if (insErr) {
      // Best-effort cleanup del objeto huérfano
      try {
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        await supabaseAdmin.storage.from(BUCKET).remove([bucket_path]);
      } catch {
        /* ignorado */
      }
      throw new Error(
        `No se pudo registrar el documento: ${insErr.message}`,
      );
    }

    return { ok: true, id: row.id, bucket_path };
  });

// =============================================================================
// urlFirmadaDescarga
// =============================================================================
export const urlFirmadaDescarga = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ documento_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const { data: doc, error } = await sb
      .from("spec_documentos")
      .select("bucket_path, nombre_archivo")
      .eq("id", data.documento_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) throw new Error("Documento no encontrado");
    const { data: signed, error: sErr } = await sb.storage
      .from(BUCKET)
      .createSignedUrl(doc.bucket_path as string, 300, {
        download: doc.nombre_archivo as string,
      });
    if (sErr) throw new Error(sErr.message);
    return { url: signed.signedUrl };
  });

// =============================================================================
// archivarDocumento — set vigente=false (sin DELETE)
// =============================================================================
export const archivarDocumento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        documento_id: z.string().uuid(),
        motivo: z.string().min(5).max(300),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const roles = await getUserRoles(sb, context.userId);
    if (!roles.some((r) => ROLES_EDIT.has(r))) {
      throw new Error(
        "Solo los roles Calidad o Administrador pueden archivar documentos.",
      );
    }
    const { error } = await sb
      .from("spec_documentos")
      .update({
        vigente: false,
        archivado_por: context.userId,
        archivado_at: new Date().toISOString(),
        motivo_archivado: data.motivo,
      } as never)
      .eq("id", data.documento_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =============================================================================
// getEvidenciaEstado — para la UI: ¿hay evidencia vigente? ¿es obligatoria?
// =============================================================================
export const getEvidenciaEstado = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ producto_codigo: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as SB;
    const { especificacion_id } = await resolveSpecIdByProductCode(
      sb,
      data.producto_codigo,
    );

    const { data: flagRow } = await sb
      .from("app_settings")
      .select("spec_evidencia_obligatoria")
      .limit(1)
      .maybeSingle();
    const obligatoria =
      ((flagRow as unknown as { spec_evidencia_obligatoria?: boolean } | null)
        ?.spec_evidencia_obligatoria ?? false) === true;

    const { data: rpc, error } = await sb.rpc(
      "spec_tiene_evidencia_vigente",
      { _spec_id: especificacion_id },
    );
    if (error) throw new Error(error.message);

    return {
      especificacion_id,
      tiene_evidencia_vigente: rpc === true,
      evidencia_obligatoria: obligatoria,
      puede_editar: !obligatoria || rpc === true,
    };
  });

// =============================================================================
// getEvidenciaFlag — lectura global del feature flag (sin requerir spec)
// =============================================================================
export const getEvidenciaFlag = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as SB;
    const { data: flagRow } = await sb
      .from("app_settings")
      .select("spec_evidencia_obligatoria")
      .limit(1)
      .maybeSingle();
    const obligatoria =
      ((flagRow as unknown as { spec_evidencia_obligatoria?: boolean } | null)
        ?.spec_evidencia_obligatoria ?? false) === true;
    return { evidencia_obligatoria: obligatoria };
  });

