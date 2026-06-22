// =============================================================================
// EvidenciaDocumentalPanel — Fase 2 del control documental de especificaciones
//
// Permite cargar (PDF/JPG/JPEG/PNG ≤10 MB), listar, descargar (URL firmada) y
// archivar evidencia documental ligada a la especificación vigente del producto
// seleccionado. Aplica únicamente al módulo Variables de Calidad.
// =============================================================================

import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  FileUp,
  Download,
  Archive,
  FileText,
  Image as ImageIcon,
  ShieldCheck,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import {
  listarDocumentos,
  subirDocumento,
  urlFirmadaDescarga,
  archivarDocumento,
  getEvidenciaEstado,
} from "@/lib/spec-documentos.functions";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIMES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
];
const ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("lectura falló"));
    reader.readAsDataURL(file);
  });
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

type Props = {
  productoCodigo: string;
  puedeEditar: boolean;
  target?: "vigente" | "borrador";
};

export function EvidenciaDocumentalPanel({
  productoCodigo,
  puedeEditar,
  target = "vigente",
}: Props) {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listarDocumentos);
  const estadoFn = useServerFn(getEvidenciaEstado);
  const subirFn = useServerFn(subirDocumento);
  const urlFn = useServerFn(urlFirmadaDescarga);
  const archivarFn = useServerFn(archivarDocumento);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [uploading, setUploading] = useState(false);

  const docsQuery = useQuery({
    queryKey: ["spec-documentos", productoCodigo, target],
    queryFn: () =>
      listFn({ data: { producto_codigo: productoCodigo, target } }),
    enabled: !!productoCodigo,
  });
  const estadoQuery = useQuery({
    queryKey: ["spec-documentos-estado", productoCodigo, target],
    queryFn: () =>
      estadoFn({ data: { producto_codigo: productoCodigo, target } }),
    enabled: !!productoCodigo,
  });

  const archivarMut = useMutation({
    mutationFn: archivarFn,
    onError: (e: Error) => toast.error(e.message),
  });

  const handleFile = async (file: File) => {
    if (!ALLOWED_MIMES.includes(file.type.toLowerCase())) {
      toast.error("Tipo no permitido. Solo PDF, JPG, JPEG o PNG.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("El archivo supera 10 MB.");
      return;
    }
    setUploading(true);
    try {
      const b64 = await fileToBase64(file);
      await subirFn({
        data: {
          producto_codigo: productoCodigo,
          nombre_archivo: file.name,
          mime_type: file.type,
          contenido_base64: b64,
          descripcion: descripcion.trim() || null,
          target,
        },
      });
      toast.success("Documento cargado correctamente.");
      setDescripcion("");
      if (inputRef.current) inputRef.current.value = "";
      await queryClient.invalidateQueries({
        queryKey: ["spec-documentos", productoCodigo, target],
      });
      await queryClient.invalidateQueries({
        queryKey: ["spec-documentos-estado", productoCodigo, target],
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const descargar = async (id: string) => {
    try {
      const r = await urlFn({ data: { documento_id: id } });
      window.open(r.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const archivar = async (id: string) => {
    const motivo = window.prompt(
      "Motivo del archivado (mínimo 5 caracteres):",
      "",
    );
    if (!motivo || motivo.trim().length < 5) return;
    await archivarMut.mutateAsync({
      data: { documento_id: id, motivo: motivo.trim() },
    });
    await queryClient.invalidateQueries({
      queryKey: ["spec-documentos", productoCodigo, target],
    });
    await queryClient.invalidateQueries({
      queryKey: ["spec-documentos-estado", productoCodigo, target],
    });
    toast.success("Documento archivado.");
  };

  const docs = docsQuery.data?.documentos ?? [];
  const vigentes = docs.filter((d) => d.vigente);
  const archivados = docs.filter((d) => !d.vigente);
  const estado = estadoQuery.data;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Evidencia documental
          </h3>
          <p className="text-xs text-muted-foreground">
            PDF, JPG, JPEG o PNG · máximo 10 MB por archivo.
          </p>
        </div>
        {estado && (
          <div
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold ${
              estado.tiene_evidencia_vigente
                ? "bg-success/10 text-success"
                : estado.evidencia_obligatoria
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {estado.tiene_evidencia_vigente ? (
              <>
                <ShieldCheck className="h-3.5 w-3.5" /> Evidencia vigente
              </>
            ) : estado.evidencia_obligatoria ? (
              <>
                <ShieldAlert className="h-3.5 w-3.5" /> Bloqueo activo · sin
                evidencia
              </>
            ) : (
              <>
                <ShieldAlert className="h-3.5 w-3.5" /> Sin evidencia (flag
                inactivo)
              </>
            )}
          </div>
        )}
      </div>

      {/* Carga */}
      <div className="border-b border-border bg-muted/10 px-5 py-4">
        <div className="grid gap-3 md:grid-cols-[1fr,auto]">
          <input
            type="text"
            placeholder="Descripción opcional (referencia, vigencia, autoriza…)"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value.slice(0, 500))}
            disabled={!puedeEditar || uploading}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          />
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              disabled={!puedeEditar || uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
              className="hidden"
              id={`spec-doc-input-${productoCodigo}`}
            />
            <label
              htmlFor={`spec-doc-input-${productoCodigo}`}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 ${
                !puedeEditar || uploading
                  ? "pointer-events-none opacity-60"
                  : ""
              }`}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileUp className="h-4 w-4" />
              )}
              {uploading ? "Subiendo…" : "Cargar documento"}
            </label>
          </div>
        </div>
        {!puedeEditar && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Solo los roles Calidad o Administrador pueden cargar evidencia.
          </p>
        )}
      </div>

      {/* Lista vigentes */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Archivo</th>
              <th className="px-4 py-2">Descripción</th>
              <th className="px-4 py-2">Tamaño</th>
              <th className="px-4 py-2">Subido por</th>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {docsQuery.isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-xs text-muted-foreground">
                  Cargando documentos…
                </td>
              </tr>
            )}
            {!docsQuery.isLoading && vigentes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-xs text-muted-foreground">
                  Sin documentos vigentes para esta especificación.
                </td>
              </tr>
            )}
            {vigentes.map((d) => {
              const isPdf = d.mime_type === "application/pdf";
              return (
                <tr key={d.id} className="border-t border-border">
                  <td className="px-4 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      {isPdf ? (
                        <FileText className="h-4 w-4 text-destructive" />
                      ) : (
                        <ImageIcon className="h-4 w-4 text-primary" />
                      )}
                      <span className="font-medium">{d.nombre_archivo}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {d.descripcion || "—"}
                  </td>
                  <td className="px-4 py-2 text-xs tabular-nums">
                    {formatBytes(Number(d.tamano_bytes))}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {(d as { subido_por_nombre?: string | null }).subido_por_nombre ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {new Date(d.subido_at).toLocaleString("es-MX")}
                  </td>
                  <td className="px-4 py-2 text-right text-xs">
                    <div className="inline-flex gap-1.5">
                      <button
                        onClick={() => descargar(d.id)}
                        className="inline-flex items-center gap-1 rounded border border-input bg-background px-2 py-1 text-[11px] font-semibold hover:bg-accent"
                      >
                        <Download className="h-3.5 w-3.5" /> Descargar
                      </button>
                      {puedeEditar && (
                        <button
                          onClick={() => archivar(d.id)}
                          disabled={archivarMut.isPending}
                          className="inline-flex items-center gap-1 rounded border border-input bg-background px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-accent disabled:opacity-50"
                        >
                          <Archive className="h-3.5 w-3.5" /> Archivar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {archivados.length > 0 && (
        <details className="border-t border-border px-5 py-3 text-xs">
          <summary className="cursor-pointer font-semibold text-muted-foreground">
            Documentos archivados ({archivados.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {archivados.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground">
                <span>
                  {d.nombre_archivo} · {formatBytes(Number(d.tamano_bytes))} ·{" "}
                  {d.archivado_at
                    ? new Date(d.archivado_at).toLocaleString("es-MX")
                    : ""}
                  {d.motivo_archivado ? ` — ${d.motivo_archivado}` : ""}
                </span>
                <button
                  onClick={() => descargar(d.id)}
                  className="inline-flex items-center gap-1 rounded border border-input bg-background px-2 py-0.5 text-[11px] hover:bg-accent"
                >
                  <Download className="h-3 w-3" /> Ver
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
