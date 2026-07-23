import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, CheckCircle2, Loader2, RefreshCw, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listPesajes, firmarEvidencia, type PesajeBobina } from "@/lib/pesajes.functions";
import { fechaCortoMX, horaMX } from "@/lib/format";

export const Route = createFileRoute("/pesaje/bobina-madre")({
  head: () => ({
    meta: [
      { title: "Pesaje de Bobina Madre · Convertipap" },
      { name: "description", content: "Registro de pesaje de bobina madre con lectura OCR de la báscula" },
      { property: "og:title", content: "Pesaje de Bobina Madre · Convertipap" },
      { property: "og:description", content: "Registro de pesaje de bobina madre con lectura OCR de la báscula" },
    ],
  }),
  component: () => (
    <AppLayout title="Control de Pesaje · Bobina Madre">
      <PesajeBobinaPage />
    </AppLayout>
  ),
});

type Maquina = { id: string; codigo: string };

const BUCKET = "pesajes-evidencia";
const EDGE_FUNCTION_NAME = "analizar-peso-bobina";
const MAX_IMAGE_SIDE = 1600;
const IMAGE_QUALITY = 0.75;
const MAX_COMPRESSED_BYTES = 2_500_000;
const TARA_POR_MAQUINA: Record<string, number> = { "MP-04": 560, "MP-05": 750, "MP-06": 1160, "MP-07": 0 };
function taraPorMaquina(codigo: string): number {
  return TARA_POR_MAQUINA[codigo] ?? 0;
}

type ImagenOptimizada = {
  file: File;
  originalBytes: number;
  compressedBytes: number;
  originalMime: string;
  originalWidth: number;
  originalHeight: number;
};

async function comprimirImagen(file: File, maxSide = MAX_IMAGE_SIDE, quality = IMAGE_QUALITY): Promise<ImagenOptimizada> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  let w: number, h: number;
  let source: CanvasImageSource;
  if (bitmap) { w = bitmap.width; h = bitmap.height; source = bitmap; }
  else {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const el = new Image();
      el.onload = () => res(el);
      el.onerror = () => rej(new Error("Imagen inválida"));
      el.src = URL.createObjectURL(file);
    });
    w = img.naturalWidth; h = img.naturalHeight; source = img;
  }
  if (!w || !h) throw new Error("La fotografía no tiene contenido válido.");
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const outW = Math.round(w * scale);
  const outH = Math.round(h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = outW; canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen.");
  ctx.drawImage(source, 0, 0, outW, outH);
  const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", quality));
  if (!blob) throw new Error("No se pudo comprimir la imagen.");
  const optimized = new File([blob], `pesaje-${Date.now()}.jpg`, { type: "image/jpeg" });
  return {
    file: optimized,
    originalBytes: file.size,
    compressedBytes: optimized.size,
    originalMime: file.type || "image/jpeg",
    originalWidth: w,
    originalHeight: h,
  };
}

async function comprimirImagenSegura(file: File): Promise<ImagenOptimizada> {
  const first = await comprimirImagen(file);
  if (first.compressedBytes <= MAX_COMPRESSED_BYTES) return first;
  const second = await comprimirImagen(file, 1280, 0.7);
  if (second.compressedBytes <= MAX_COMPRESSED_BYTES) return second;
  throw new Error("La fotografía sigue siendo demasiado grande. Acércate al display y toma nuevamente la evidencia.");
}

function buildEvidencePath(maquinaCodigo: string, numeroRolloValue: string): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const rolloSanit = numeroRolloValue.trim().replace(/[^A-Za-z0-9_-]/g, "_");
  const uuid = crypto.randomUUID();
  return `${maquinaCodigo || "SIN-MAQ"}/${yyyy}-${mm}-${dd}/${rolloSanit}/${uuid}.jpg`;
}

function logDiagnosticoPesaje(stage: string, details: Record<string, unknown>) {
  console.info(`[pesaje-bobina] ${stage}`, {
    functionName: EDGE_FUNCTION_NAME,
    projectUrl: import.meta.env.VITE_SUPABASE_URL,
    ...details,
  });
}

async function leerDetalleFunctionError(error: unknown): Promise<string> {
  if (!(error instanceof Error)) return "Error desconocido al comunicarse con la función.";
  const named = error as Error & { context?: unknown };
  const context = named.context;
  if (context instanceof Response) {
    const text = await context.text().catch(() => "");
    return text ? `${error.message}: ${text}` : error.message;
  }
  return error.message;
}

async function mensajeFunctionError(error: unknown): Promise<string> {
  if (!(error instanceof Error)) return "No fue posible establecer comunicación con el servicio.";
  const detail = await leerDetalleFunctionError(error);
  if (error.name === "FunctionsFetchError") return `No fue posible establecer comunicación con el servicio. ${detail}`;
  if (error.name === "FunctionsHttpError") return `La función respondió con error. ${detail}`;
  if (error.name === "FunctionsRelayError") return `Error de infraestructura al contactar el servicio. ${detail}`;
  return detail;
}

function PesajeBobinaPage() {
  const qc = useQueryClient();

  const [ordenSel, setOrdenSel] = useState<string>("");
  const [ordenOtro, setOrdenOtro] = useState("");
  const [numeroOrden, setNumeroOrden] = useState("");
  const [maquinaId, setMaquinaId] = useState<string>("");
  const [numeroRollo, setNumeroRollo] = useState("");

  const [evidenciaFile, setEvidenciaFile] = useState<File | null>(null);
  const [evidenciaPreview, setEvidenciaPreview] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const [camaraError, setCamaraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const maquinasQ = useQuery({
    queryKey: ["pesaje", "maquinas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("maquinas")
        .select("id, codigo")
        .in("codigo", ["MP-04", "MP-05", "MP-06", "MP-07"])
        .eq("activo", true).order("codigo");
      if (error) throw new Error(error.message);
      return (data ?? []) as Maquina[];
    },
    staleTime: 5 * 60_000,
  });

  const maqCodigo = useMemo(
    () => maquinasQ.data?.find((m) => m.id === maquinaId)?.codigo ?? "",
    [maquinasQ.data, maquinaId],
  );
  const sufijoMaq = useMemo(() => {
    const m = /(\d)$/.exec(maqCodigo);
    return m ? m[1] : "";
  }, [maqCodigo]);
  const baseRollo = useMemo(() => {
    if (!numeroRollo) return "";
    const m = /^(.*)-(\d)$/.exec(numeroRollo);
    return m ? m[1] : numeroRollo;
  }, [numeroRollo]);

  useEffect(() => {
    if (!sufijoMaq) return;
    setNumeroRollo((prev) => {
      if (!prev) return prev;
      const m = /^(.*)-(\d)$/.exec(prev);
      if (m) return m[2] !== sufijoMaq ? `${m[1]}-${sufijoMaq}` : prev;
      return `${prev}-${sufijoMaq}`;
    });
  }, [sufijoMaq]);

  const ordenesQ = useQuery({
    queryKey: ["pesaje", "ordenes-activas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ordenes_produccion")
        .select("id, numero_orden").eq("estado", "activa").order("numero_orden");
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; numero_orden: string }[];
    },
    staleTime: 60_000,
  });

  const listar = useServerFn(listPesajes);
  const listaQ = useQuery({
    queryKey: ["pesajes", "lista"],
    queryFn: () => listar(),
    staleTime: 30_000,
  });

  const puedeMaquina = ordenSel !== "";
  const puedeRollo = !!maquinaId;
  const puedeFoto = !!numeroRollo.trim() && !!baseRollo;
  const puedeRegistrar = puedeFoto && !!evidenciaFile && !procesando;
  const tara = taraPorMaquina(maqCodigo);

  function limpiarFoto() {
    if (evidenciaPreview) URL.revokeObjectURL(evidenciaPreview);
    setEvidenciaFile(null);
    setEvidenciaPreview(null);
  }
  function resetForm(keepMaquina = false) {
    limpiarFoto();
    if (!keepMaquina) {
      setNumeroRollo(""); setOrdenSel(""); setOrdenOtro(""); setNumeroOrden("");
    } else { setNumeroRollo(""); }
  }

  async function abrirCamara() {
    setCamaraError(null);
    setCamaraAbierta(true);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamaraError("Este dispositivo no permite acceder a la cámara. Usa una tablet con cámara habilitada.");
      return;
    }
    try {
      // 1) Solicitar permiso mínimo para desbloquear etiquetas de dispositivos
      try {
        const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        probe.getTracks().forEach((t) => t.stop());
      } catch {
        // continuamos: puede que exact:environment funcione igualmente
      }

      // 2) Enumerar cámaras y priorizar la trasera por etiqueta
      let backDeviceId: string | null = null;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videos = devices.filter((d) => d.kind === "videoinput");
        const back = videos.find((d) => /back|rear|environment|trasera|traseraprincipal|world/i.test(d.label));
        // Fallback: si hay varias cámaras y ninguna coincide por etiqueta, tomar la última
        // (en Android suele ser la trasera principal)
        backDeviceId = back?.deviceId ?? (videos.length > 1 ? videos[videos.length - 1].deviceId : null);
      } catch {
        backDeviceId = null;
      }

      let stream: MediaStream;
      if (backDeviceId) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: backDeviceId },
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
      } else {
        // 3) Sin ID confiable: forzar trasera vía facingMode exact
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { exact: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: false,
          });
        } catch (ie) {
          const err = ie as DOMException;
          if (err.name !== "OverconstrainedError" && err.name !== "NotFoundError") throw ie;
          // Último recurso: ideal (puede caer a frontal si no hay trasera)
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: false,
          });
        }
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }


    } catch (e) {
      const err = e as DOMException;
      let msg = "No fue posible iniciar la cámara.";
      if (err.name === "NotAllowedError" || err.name === "SecurityError") msg = "Permiso de cámara no concedido.";
      else if (err.name === "NotFoundError" || err.name === "OverconstrainedError") msg = "No se detectó una cámara disponible.";
      setCamaraError(msg);
    }
  }
  function cerrarCamara() {
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamaraAbierta(false); setCamaraError(null);
  }
  useEffect(() => () => {
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (evidenciaPreview) URL.revokeObjectURL(evidenciaPreview);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function tomarFoto() {
    const video = videoRef.current;
    if (!video || !streamRef.current) return toast.error("La cámara aún no está lista.");
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) return toast.error("La cámara aún no envía imagen. Espera un momento.");
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return toast.error("No se pudo capturar la imagen.");
    ctx.drawImage(video, 0, 0, w, h);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob((b) => r(b), "image/jpeg", 0.92));
    if (!blob) return toast.error("No se pudo generar la imagen.");
    const raw = new File([blob], `pesaje-${Date.now()}.jpg`, { type: "image/jpeg" });
    cerrarCamara();
    try {
      const optim = await comprimirImagenSegura(raw);
      if (evidenciaPreview) URL.revokeObjectURL(evidenciaPreview);
      setEvidenciaFile(optim.file);
      setEvidenciaPreview(URL.createObjectURL(optim.file));
      logDiagnosticoPesaje("fotografia-optimizada", {
        originalBytes: optim.originalBytes,
        compressedBytes: optim.compressedBytes,
        originalMime: optim.originalMime,
        originalWidth: optim.originalWidth,
        originalHeight: optim.originalHeight,
        finalMime: optim.file.type,
      });
    } catch (e) { toast.error((e as Error).message); }
  }

  async function registrar() {
    if (!puedeRegistrar) return;
    setProcesando(true);
    let uploadedPath: string | null = null;
    try {
      const file = evidenciaFile;
      if (!file) throw new Error("Falta la fotografía de evidencia.");

      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw new Error(`Error de autenticación: ${sessionErr.message}`);
      const token = sessionData.session?.access_token;
      const uid = sessionData.session?.user.id;
      if (!token || !uid) throw new Error("La sesión expiró. Inicie sesión nuevamente");

      const now = new Date();
      const path = buildEvidencePath(maqCodigo, numeroRollo.trim());
      const idempotencyKey = crypto.randomUUID();
      logDiagnosticoPesaje("inicio-registro", {
        session: "activa",
        stage: "storage-upload",
        originalOrCompressedBytes: file.size,
        mimeType: file.type,
        edgeInvoked: false,
      });

      const up = await supabase.storage.from(BUCKET)
        .upload(path, file, { upsert: false, contentType: "image/jpeg" });
      if (up.error) {
        if (/duplicate/i.test(up.error.message)) throw new Error("Ya existe un registro para este número de rollo.");
        throw new Error(`No se pudo subir la evidencia: ${up.error.message}`);
      }
      uploadedPath = path;
      logDiagnosticoPesaje("storage-upload-ok", {
        storagePath: path,
        storageUploadFinished: true,
        compressedBytes: file.size,
        mimeType: file.type,
      });

      const resp = await supabase.functions.invoke(EDGE_FUNCTION_NAME, {
        headers: { Authorization: `Bearer ${token}` },
        body: {
          evidencia_path: path,
          storagePath: path,
          maquina_id: maquinaId,
          maquina: maqCodigo,
          numero_rollo: numeroRollo.trim(),
          numero_orden: numeroOrden.trim() || null,
          ordenProduccion: numeroOrden.trim() || null,
          taraKg: tara,
          userId: uid,
          idempotencyKey,
          fecha_hora_pesaje: now.toISOString(),
        },
      });
      logDiagnosticoPesaje("edge-invocada", {
        edgeInvoked: true,
        hasError: !!resp.error,
        errorName: resp.error?.name,
        errorMessage: resp.error?.message,
      });
      if (resp.error) throw new Error(await mensajeFunctionError(resp.error));
      const data = resp.data as { aceptado: boolean; motivo_rechazo?: string; registro?: PesajeBobina };
      if (!data.aceptado) {
        // limpiar evidencia rechazada
        await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
        uploadedPath = null;
        throw new Error(data.motivo_rechazo || "La fotografía no cumple los criterios para lectura del peso.");
      }

      toast.success(`Pesaje registrado: ${data.registro?.peso_neto_kg} kg neto`);
      qc.invalidateQueries({ queryKey: ["pesajes"] });
      resetForm(true);
    } catch (e) {
      if (uploadedPath) await supabase.storage.from(BUCKET).remove([uploadedPath]).catch(() => {});
      console.error("[pesaje] registrar", {
        functionName: EDGE_FUNCTION_NAME,
        projectUrl: import.meta.env.VITE_SUPABASE_URL,
        storageUploadFinished: !!uploadedPath,
        edgeFunction: EDGE_FUNCTION_NAME,
        errorName: e instanceof Error ? e.name : "unknown",
        errorMessage: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      });
      toast.error((e as Error).message || "No se pudo registrar el pesaje.");
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4">
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <header className="mb-4 flex items-center">
          <h2 className="text-lg font-semibold">Nuevo pesaje de bobina madre</h2>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          {/* 1. Orden */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">1. Orden de producción (opcional)</label>
            <select
              className="min-h-[48px] w-full rounded-md border border-input bg-background px-3 py-2 text-base"
              value={ordenSel}
              onChange={(e) => {
                const v = e.target.value;
                setOrdenSel(v);
                if (v === "__otro__") setNumeroOrden(ordenOtro.trim());
                else if (v === "" || v === "__sin__") setNumeroOrden("");
                else setNumeroOrden(ordenesQ.data?.find((x) => x.id === v)?.numero_orden ?? "");
                setMaquinaId(""); setNumeroRollo(""); limpiarFoto();
              }}
              disabled={ordenesQ.isLoading}
            >
              <option value="">Selecciona…</option>
              {ordenesQ.data?.map((o) => <option key={o.id} value={o.id}>{o.numero_orden}</option>)}
              <option value="__otro__">Otro (capturar manualmente)</option>
              <option value="__sin__">Sin orden (temporal)</option>
            </select>
            {ordenSel === "__otro__" && (
              <input
                className="mt-2 min-h-[48px] w-full rounded-md border border-input bg-background px-3 py-2 text-base"
                value={ordenOtro}
                onChange={(e) => { const v = e.target.value.trim(); setOrdenOtro(v); setNumeroOrden(v); }}
                placeholder="Número SAP"
              />
            )}
          </div>

          {/* 2. Máquina */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">2. Máquina *</label>
            <select
              className="min-h-[48px] w-full rounded-md border border-input bg-background px-3 py-2 text-base disabled:opacity-50"
              value={maquinaId}
              onChange={(e) => { setMaquinaId(e.target.value); setNumeroRollo(""); limpiarFoto(); }}
              disabled={maquinasQ.isLoading || !puedeMaquina}
            >
              <option value="">Selecciona…</option>
              {maquinasQ.data?.map((m) => <option key={m.id} value={m.id}>{m.codigo}</option>)}
            </select>
            {!puedeMaquina && (
              <p className="mt-1 text-[11px] text-muted-foreground">Selecciona primero la Orden de producción.</p>
            )}
            {maqCodigo && (
              <p className="mt-1 text-[11px] text-muted-foreground">Tara: {tara} kg</p>
            )}
          </div>

          {/* 3. Rollo */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              3. N.º de rollo * <span className="text-[10px] font-normal">(sufijo automático)</span>
            </label>
            <div className="flex items-stretch gap-2">
              <input
                className="min-h-[48px] w-full rounded-md border border-input bg-background px-3 py-2 text-base disabled:opacity-50"
                value={baseRollo}
                onChange={(e) => {
                  const raw = e.target.value.toUpperCase().replace(/-\d$/, "").trim();
                  setNumeroRollo(raw ? (sufijoMaq ? `${raw}-${sufijoMaq}` : raw) : "");
                  limpiarFoto();
                }}
                placeholder={maqCodigo ? `Ej. 2807-${sufijoMaq || "X"}` : "Selecciona máquina primero"}
                disabled={!puedeRollo}
                inputMode="text"
              />
              <span className="inline-flex min-w-[56px] items-center justify-center rounded-md border border-input bg-muted px-3 text-base font-semibold">
                -{maquinaId ? (sufijoMaq || "?") : "?"}
              </span>
            </div>
          </div>
        </div>

        {/* 4. Evidencia con OCR */}
        <div className="mt-5">
          <label className="mb-2 block text-xs font-medium text-muted-foreground">
            4. Evidencia fotográfica del display * <span className="text-[10px] font-normal">(el peso se lee automáticamente)</span>
          </label>
          {!evidenciaPreview ? (
            <button
              type="button"
              onClick={abrirCamara}
              disabled={!puedeFoto}
              className="group flex min-h-[240px] w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-primary/40 bg-gradient-to-br from-primary/5 to-primary/10 p-6 text-center transition hover:border-primary hover:from-primary/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/15 ring-8 ring-primary/5 group-hover:scale-110">
                <Camera className="h-12 w-12 text-primary" strokeWidth={1.75} />
              </div>
              <div className="text-lg font-semibold">Tomar fotografía del display</div>
              <div className="text-xs text-muted-foreground">
                {puedeFoto ? "Cámara trasera de la tablet · lectura automática del peso" : "Completa los pasos anteriores"}
              </div>
            </button>
          ) : (
            <div className="relative overflow-hidden rounded-2xl border border-border bg-black/90 shadow-lg">
              <img src={evidenciaPreview} alt="Evidencia" className="max-h-[360px] w-full object-contain" />
              <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-success/90 px-3 py-1 text-[11px] font-medium text-white">
                <CheckCircle2 className="h-3.5 w-3.5" /> Fotografía lista para lectura
              </div>
              <div className="absolute bottom-3 right-3">
                <button
                  type="button"
                  onClick={() => { limpiarFoto(); abrirCamara(); }}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-xs font-medium text-foreground shadow-md hover:bg-white"
                >
                  <Camera className="h-4 w-4" /> Volver a tomar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Botones */}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={registrar}
            disabled={!puedeRegistrar}
            className="inline-flex min-h-[52px] items-center gap-2 rounded-md bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow disabled:opacity-50"
          >
            {procesando ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
            {procesando ? "Procesando lectura del peso…" : "Registrar pesaje"}
          </button>
          <button
            onClick={() => resetForm(false)}
            disabled={procesando}
            className="inline-flex min-h-[52px] items-center gap-2 rounded-md border border-border px-5 py-3 text-sm"
          >
            <RefreshCw className="h-4 w-4" /> Limpiar
          </button>
        </div>
      </section>

      {/* Modal cámara */}
      {camaraAbierta && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          <div className="flex items-center justify-between px-4 py-3 text-white">
            <div className="text-sm font-medium">Captura en vivo · display de la báscula</div>
            <button type="button" onClick={cerrarCamara} className="rounded-md border border-white/30 px-3 py-1.5 text-xs hover:bg-white/10">
              Cancelar
            </button>
          </div>
          <div className="relative flex-1 overflow-hidden bg-black">
            <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-contain" />
            {camaraError && (
              <div className="absolute inset-x-4 top-4 rounded-md bg-destructive/90 px-4 py-3 text-sm text-white">
                {camaraError}
              </div>
            )}
          </div>
          <div className="flex items-center justify-center gap-4 bg-black px-4 py-5">
            <button
              type="button"
              onClick={tomarFoto}
              disabled={!!camaraError}
              className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-white text-black shadow-lg ring-4 ring-white/30 disabled:opacity-40"
              aria-label="Tomar foto"
            >
              <Camera className="h-7 w-7" />
            </button>
          </div>
        </div>
      )}

      <ListaPesajes lista={listaQ.data ?? []} loading={listaQ.isLoading} />
    </div>
  );
}

function ListaPesajes({ lista, loading }: { lista: PesajeBobina[]; loading: boolean }) {
  const firmar = useServerFn(firmarEvidencia);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold">Últimos pesajes</h3>
        <span className="text-xs text-muted-foreground">{lista.length} registros</span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Máquina</th>
              <th className="px-3 py-2">Rollo</th>
              <th className="px-3 py-2">Orden</th>
              <th className="px-3 py-2 text-right">Bruto</th>
              <th className="px-3 py-2 text-right">Neto</th>
              <th className="px-3 py-2">Evidencia</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Cargando…</td></tr>}
            {!loading && lista.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Sin registros aún.</td></tr>}
            {lista.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-3 py-2 whitespace-nowrap">{fechaCortoMX(p.fecha_hora_pesaje)} {horaMX(p.fecha_hora_pesaje)}</td>
                <td className="px-3 py-2">{p.maquina_codigo}</td>
                <td className="px-3 py-2 font-medium">{p.numero_rollo}</td>
                <td className="px-3 py-2">{p.numero_orden ?? "—"}</td>
                <td className="px-3 py-2 text-right">{Number(p.peso_bruto_kg).toFixed(2)}</td>
                <td className="px-3 py-2 text-right font-semibold text-amber-700">{Number(p.peso_neto_kg).toFixed(2)}</td>
                <td className="px-3 py-2">
                  <button
                    onClick={async () => {
                      try { const { url } = await firmar({ data: { path: p.evidencia_path } }); setPreviewUrl(url); }
                      catch (e) { toast.error((e as Error).message); }
                    }}
                    className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
                  >
                    <ImageIcon className="h-3.5 w-3.5" /> Ver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setPreviewUrl(null)}>
          <img src={previewUrl} alt="Evidencia" className="max-h-[90vh] max-w-[90vw] rounded-md" />
        </div>
      )}
    </section>
  );
}
