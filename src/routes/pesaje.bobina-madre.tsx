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
      { title: "Pesaje de Rollo · Convertipap" },
      { name: "description", content: "Registro de pesaje de rollo de producción con lectura OCR de la báscula" },
      { property: "og:title", content: "Pesaje de Rollo · Convertipap" },
      { property: "og:description", content: "Registro de pesaje de rollo de producción con lectura OCR de la báscula" },
    ],
  }),
  component: () => (
    <AppLayout title="Control de Pesaje · Pesaje de Rollo">
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
// Marco guía de captura: sólo se conserva lo que queda dentro del recuadro.
// El ancho se redujo al 50% del marco anterior (75% → 37.5%) para mayor precisión.
const FRAME_W_RATIO = 0.375;
const FRAME_H_RATIO = 0.30;

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
  const [pesoManual, setPesoManual] = useState("");


  const [evidenciaFile, setEvidenciaFile] = useState<File | null>(null);
  const [evidenciaPreview, setEvidenciaPreview] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  // Modal de confirmación cuando OCR devuelve status="confirm"
  const [confirmData, setConfirmData] = useState<null | {
    peso: number; message: string; storagePath: string; idempotencyKey: string;
    fechaISO: string; requestId: string;
  }>(null);

  // Dedupe: un solo toast + un solo registro por captura
  const activeRequestRef = useRef<string | null>(null);
  const registeringRequestRef = useRef<string | null>(null);
  const activeToastRef = useRef<string | number | null>(null);

  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const [camaraError, setCamaraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [videoAspect, setVideoAspect] = useState(16 / 9);


  function mostrarMensajeUnico(kind: "success" | "error" | "info", msg: string) {
    if (activeToastRef.current != null) toast.dismiss(activeToastRef.current);
    const id = kind === "success" ? toast.success(msg) : kind === "error" ? toast.error(msg) : toast(msg);
    activeToastRef.current = id;
  }


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




  const listar = useServerFn(listPesajes);
  const listaQ = useQuery({
    queryKey: ["pesajes", "lista"],
    queryFn: () => listar(),
    staleTime: 30_000,
  });

  const puedeMaquina = ordenSel !== "";
  const puedeRollo = !!maquinaId;
  const puedeFoto = !!numeroRollo.trim() && !!baseRollo;
  const pesoManualNum = pesoManual.trim() === "" ? null : Number(pesoManual.replace(",", "."));
  const pesoManualValido =
    pesoManualNum !== null && Number.isFinite(pesoManualNum) && pesoManualNum > 0 && pesoManualNum <= 2500;
  const pesoManualError = pesoManualNum !== null && !pesoManualValido;
  const puedeRegistrar = puedeFoto && !!evidenciaFile && !procesando && !pesoManualError;
  const tara = taraPorMaquina(maqCodigo);

  function limpiarFoto() {
    if (evidenciaPreview) URL.revokeObjectURL(evidenciaPreview);
    setEvidenciaFile(null);
    setEvidenciaPreview(null);
    setConfirmData(null);
    activeRequestRef.current = null;
    registeringRequestRef.current = null;
  }
  function resetForm(keepMaquina = false) {
    limpiarFoto();
    setPesoManual("");
    if (activeToastRef.current != null) { toast.dismiss(activeToastRef.current); activeToastRef.current = null; }
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

    // Se captura EXCLUSIVAMENTE el interior del marco guía (recorte centrado),
    // con el ancho reducido al 50% del marco anterior para mayor precisión del OCR.
    const cropW = Math.max(64, Math.round(w * FRAME_W_RATIO));
    const cropH = Math.max(64, Math.round(h * FRAME_H_RATIO));
    const cropX = Math.round((w - cropW) / 2);
    const cropY = Math.round((h - cropH) / 2);

    const canvas = document.createElement("canvas");
    canvas.width = cropW; canvas.height = cropH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return toast.error("No se pudo capturar la imagen.");
    ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
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

  async function obtenerTokenValido(): Promise<{ token: string; uid: string }> {
    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr) throw new Error(`Error de autenticación: ${sessionErr.message}`);
    let token = sessionData.session?.access_token;
    let uid = sessionData.session?.user.id;
    const expiresAt = sessionData.session?.expires_at ?? 0;
    const nowSec = Math.floor(Date.now() / 1000);
    if (!token || !uid || expiresAt - nowSec < 60) {
      const { data: refreshed, error: refErr } = await supabase.auth.refreshSession();
      if (refErr || !refreshed.session?.access_token) {
        await supabase.auth.signOut().catch(() => {});
        throw new Error("La sesión expiró. Inicia sesión nuevamente.");
      }
      token = refreshed.session.access_token;
      uid = refreshed.session.user.id;
    }
    logDiagnosticoPesaje("token-check", {
      existeAuthorization: true,
      tokenLength: token!.length,
      userId: uid,
      sessionValidated: true,
    });
    return { token: token!, uid: uid! };
  }

  /**
   * Llamada DIRECTA por fetch al endpoint de la función (sin supabase.functions.invoke).
   * Motivo: invoke oculta el cuerpo de error y cualquier corte de red se reporta como
   * "Failed to send a request to the Edge Function". Aquí:
   *  - timeout explícito de 150s (el OCR puede tardar en tablet con red lenta),
   *  - reintento automático ante fallo de red,
   *  - reintento con token refrescado ante 401,
   *  - se lee SIEMPRE el cuerpo JSON aunque el status no sea 2xx.
   */
  async function postEdge(token: string, uid: string, payload: Record<string, unknown>, timeoutMs = 150_000) {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${EDGE_FUNCTION_NAME}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...payload, userId: uid }),
        signal: ctrl.signal,
        keepalive: false,
      });
      const text = await r.text();
      let parsed: unknown = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
      return { httpStatus: r.status, data: parsed as EdgeResponse | null, raw: text };
    } finally {
      clearTimeout(timer);
    }
  }

  async function invocarEdgeConAuth(payload: Record<string, unknown>) {
    let { token, uid } = await obtenerTokenValido();

    let out: Awaited<ReturnType<typeof postEdge>> | null = null;
    let netErr: unknown = null;

    for (let intento = 1; intento <= 2; intento++) {
      try {
        out = await postEdge(token, uid, payload);
        netErr = null;
        break;
      } catch (e) {
        netErr = e;
        logDiagnosticoPesaje("edge-network-retry", {
          intento,
          error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
        });
        if (intento < 2) await new Promise((r) => setTimeout(r, 1200));
      }
    }

    if (!out) {
      const isAbort = netErr instanceof Error && netErr.name === "AbortError";
      throw new Error(
        isAbort
          ? "La lectura tardó demasiado. Verifica la conexión Wi-Fi de la tablet y vuelve a intentar."
          : "Sin conexión con el servicio de lectura. Revisa la red de la tablet y vuelve a intentar.",
      );
    }

    if (out.httpStatus === 401) {
      const { data: refreshed, error: refErr } = await supabase.auth.refreshSession();
      if (refErr || !refreshed.session?.access_token) {
        await supabase.auth.signOut().catch(() => {});
        throw new Error("La sesión expiró. Inicia sesión nuevamente.");
      }
      token = refreshed.session.access_token;
      uid = refreshed.session.user.id;
      logDiagnosticoPesaje("token-refresh-retry", { userId: uid, tokenLength: token.length });
      out = await postEdge(token, uid, payload);
    }

    logDiagnosticoPesaje("edge-http", { httpStatus: out.httpStatus, hasJson: !!out.data });

    // Se conserva la forma { data, error } que esperan los llamadores.
    const resp = {
      data: out.data,
      error: out.data
        ? null
        : new Error(
            out.httpStatus >= 500
              ? "El servicio de lectura no respondió correctamente. Intenta nuevamente."
              : `Respuesta inválida del servicio (HTTP ${out.httpStatus}).`,
          ),
    };
    return { resp, uid };
  }


  type EdgeResponse = {
    status: "accepted" | "confirm" | "retake" | "technical_error";
    reasonCode?: string;
    message?: string;
    pesoDetectado?: number | null;
    pesoConfirmado?: number | null;
    requiereConfirmacion?: boolean;
    requestId?: string;
    registro?: PesajeBobina;
  };

  async function registrar() {
    if (!puedeRegistrar) return;
    if (confirmData) return; // ya hay uno abierto
    setProcesando(true);
    let uploadedPath: string | null = null;
    const clientRequestId = crypto.randomUUID();
    activeRequestRef.current = clientRequestId;
    try {
      const file = evidenciaFile;
      if (!file) throw new Error("Falta la fotografía de evidencia.");

      const { uid } = await obtenerTokenValido();

      const now = new Date();
      const path = buildEvidencePath(maqCodigo, numeroRollo.trim());
      const idempotencyKey = clientRequestId;

      const up = await supabase.storage.from(BUCKET)
        .upload(path, file, { upsert: false, contentType: "image/jpeg" });
      if (up.error) {
        if (/duplicate/i.test(up.error.message)) throw new Error("Ya existe un registro para este número de rollo.");
        throw new Error(`No se pudo subir la evidencia: ${up.error.message}`);
      }
      uploadedPath = path;

      const { resp } = await invocarEdgeConAuth({
        evidencia_path: path,
        storagePath: path,
        maquina_id: maquinaId,
        maquina: maqCodigo,
        numero_rollo: numeroRollo.trim(),
        numero_orden: numeroOrden.trim() || null,
        idempotencyKey,
        fecha_hora_pesaje: now.toISOString(),
      });

      // Ignorar respuestas tardías si ya se inició una nueva captura
      if (activeRequestRef.current !== clientRequestId) {
        await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
        return;
      }

      if (resp.error && !resp.data) {
        throw new Error(await mensajeFunctionError(resp.error));
      }
      const data = (resp.data ?? {}) as EdgeResponse;
      logDiagnosticoPesaje("edge-response", {
        status: data.status, reasonCode: data.reasonCode, requestId: data.requestId,
      });

      if (data.status === "accepted" && data.registro) {
        registeringRequestRef.current = clientRequestId;
        mostrarMensajeUnico("success", data.message || "Peso identificado y registrado correctamente.");
        qc.invalidateQueries({ queryKey: ["pesajes"] });
        resetForm(true);
        return;
      }

      if (data.status === "confirm" && typeof data.pesoDetectado === "number") {
        // No borramos evidencia: la reutilizaremos al confirmar
        setConfirmData({
          peso: data.pesoDetectado,
          message: data.message || `Se detectó un peso de ${data.pesoDetectado} kg. Confirma que coincida con el display.`,
          storagePath: path,
          idempotencyKey,
          fechaISO: now.toISOString(),
          requestId: data.requestId || clientRequestId,
        });
        uploadedPath = null; // preservar hasta confirmar/cancelar
        return;
      }

      // retake | technical_error → borrar evidencia y mostrar mensaje único
      await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
      uploadedPath = null;
      mostrarMensajeUnico("error", data.message || "No fue posible procesar la fotografía. Intenta nuevamente.");
      limpiarFoto();
    } catch (e) {
      if (uploadedPath) await supabase.storage.from(BUCKET).remove([uploadedPath]).catch(() => {});
      console.error("[pesaje] registrar", {
        errorName: e instanceof Error ? e.name : "unknown",
        errorMessage: e instanceof Error ? e.message : String(e),
      });
      const msg = (e as Error).message || "No fue posible procesar la fotografía. Intenta nuevamente.";
      if (/sesión expiró|inicia sesión/i.test(msg)) {
        mostrarMensajeUnico("error", "Tu sesión expiró. Inicia sesión nuevamente.");
        setTimeout(() => { window.location.href = "/login"; }, 1500);
      } else {
        mostrarMensajeUnico("error", msg);
      }
    } finally {
      setProcesando(false);
    }
  }

  async function confirmarLectura() {
    if (!confirmData) return;
    if (registeringRequestRef.current === confirmData.idempotencyKey) return; // ya insertado
    setProcesando(true);
    try {
      const { uid } = await obtenerTokenValido();
      const { resp } = await invocarEdgeConAuth({
        evidencia_path: confirmData.storagePath,
        storagePath: confirmData.storagePath,
        maquina_id: maquinaId,
        maquina: maqCodigo,
        numero_rollo: numeroRollo.trim(),
        numero_orden: numeroOrden.trim() || null,
        idempotencyKey: confirmData.idempotencyKey,
        fecha_hora_pesaje: confirmData.fechaISO,
        pesoConfirmadoKg: confirmData.peso,
        userId: uid,
      });
      if (resp.error && !resp.data) throw new Error(await mensajeFunctionError(resp.error));
      const data = (resp.data ?? {}) as EdgeResponse;
      if (data.status === "accepted" && data.registro) {
        registeringRequestRef.current = confirmData.idempotencyKey;
        mostrarMensajeUnico("success", data.message || "Peso confirmado y registrado correctamente.");
        qc.invalidateQueries({ queryKey: ["pesajes"] });
        setConfirmData(null);
        resetForm(true);
        return;
      }
      mostrarMensajeUnico("error", data.message || "No fue posible registrar el peso confirmado.");
    } catch (e) {
      mostrarMensajeUnico("error", (e as Error).message || "No fue posible registrar el peso confirmado.");
    } finally {
      setProcesando(false);
    }
  }

  async function cancelarConfirmacion() {
    if (!confirmData) return;
    await supabase.storage.from(BUCKET).remove([confirmData.storagePath]).catch(() => {});
    setConfirmData(null);
    limpiarFoto();
    abrirCamara();
  }



  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4">
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <header className="mb-4 flex items-center">
          <h2 className="text-lg font-semibold">Nuevo pesaje de rollo</h2>
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
                else setNumeroOrden("");
                setMaquinaId(""); setNumeroRollo(""); limpiarFoto();
              }}
            >
              <option value="">Selecciona…</option>
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
          <div className="grid gap-4 md:grid-cols-2">
            {/* Izquierda: botón de captura (1/4 del tamaño original) */}
            <button
              type="button"
              onClick={() => { if (evidenciaPreview) limpiarFoto(); abrirCamara(); }}
              disabled={!puedeFoto}
              className="group flex min-h-[120px] w-full max-w-[320px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-gradient-to-br from-primary/5 to-primary/10 p-3 text-center transition hover:border-primary hover:from-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 ring-4 ring-primary/5 group-hover:scale-110">
                <Camera className="h-6 w-6 text-primary" strokeWidth={1.75} />
              </div>
              <div className="text-sm font-semibold">
                {evidenciaPreview ? "Volver a tomar" : "Tomar fotografía del display"}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {puedeFoto ? "Cámara trasera · lectura automática" : "Completa los pasos anteriores"}
              </div>
            </button>

            {/* Derecha: evidencia capturada */}
            {evidenciaPreview ? (
              <div className="relative overflow-hidden rounded-xl border border-border bg-black/90 shadow-lg">
                <img src={evidenciaPreview} alt="Evidencia del display" className="max-h-[200px] w-full object-contain" />
                <div className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-success/90 px-2.5 py-1 text-[10px] font-medium text-white">
                  <CheckCircle2 className="h-3 w-3" /> Lista para lectura
                </div>
              </div>
            ) : (
              <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 p-3 text-center">
                <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                  <ImageIcon className="h-6 w-6" />
                  <span className="text-[11px]">Aquí se mostrará la evidencia capturada</span>
                </div>
              </div>
            )}
          </div>

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
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="h-full w-full object-contain"
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                if (v.videoWidth && v.videoHeight) setVideoAspect(v.videoWidth / v.videoHeight);
              }}
            />
            {/* Marco guía: define EXACTAMENTE el área que se captura */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                className="relative flex items-center justify-center"
                style={{ aspectRatio: String(videoAspect), maxWidth: "100%", maxHeight: "100%", width: "100%", height: "100%" }}
              >
                <div
                  className="rounded-lg border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
                  style={{ width: `${FRAME_W_RATIO * 100}%`, height: `${FRAME_H_RATIO * 100}%` }}
                />
                <div className="absolute left-1/2 top-[68%] w-[80%] -translate-x-1/2 rounded-md bg-black/70 px-3 py-1.5 text-center text-xs text-white">
                  Sólo se guardará lo que quede dentro del recuadro.
                  <br />
                  <span className="text-white/70">Encuadra únicamente los dígitos del display. Evita reflejos.</span>
                </div>
              </div>
            </div>

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

      {/* Modal de confirmación (status=confirm) */}
      {confirmData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-semibold">Confirmar peso detectado</h3>
            <p className="mb-4 text-sm text-muted-foreground">{confirmData.message}</p>
            <div className="mb-5 rounded-lg border border-border bg-muted/40 p-4 text-center">
              <div className="text-xs uppercase text-muted-foreground">Peso detectado</div>
              <div className="text-4xl font-bold tabular-nums">{confirmData.peso} kg</div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <button
                type="button"
                onClick={confirmarLectura}
                disabled={procesando}
                className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow disabled:opacity-50"
              >
                {procesando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Confirmar {confirmData.peso} kg
              </button>
              <button
                type="button"
                onClick={cancelarConfirmacion}
                disabled={procesando}
                className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-md border border-border px-5 py-3 text-sm"
              >
                <Camera className="h-4 w-4" /> Volver a tomar
              </button>
            </div>
          </div>
        </div>
      )}

      <ListaPesajes lista={listaQ.data ?? []} loading={listaQ.isLoading} />

    </div>
  );
}

const MAX_VISIBLE = 60;

function ListaPesajes({ lista, loading }: { lista: PesajeBobina[]; loading: boolean }) {
  const firmar = useServerFn(firmarEvidencia);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const q = busqueda.trim().toLowerCase();
  const filtrada = q
    ? lista.filter((p) => p.numero_rollo.toLowerCase().includes(q))
    : lista.slice(0, MAX_VISIBLE);
  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold">Últimos pesajes</h3>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar N.º de rollo…"
              maxLength={32}
              aria-label="Buscar por número de rollo"
              className="w-56 rounded-md border border-border bg-background py-1.5 pl-3 pr-7 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            {busqueda && (
              <button
                onClick={() => setBusqueda("")}
                aria-label="Limpiar búsqueda"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {q ? `${filtrada.length} coincidencias` : `${filtrada.length} de ${lista.length} registros`}
          </span>
        </div>
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
              <th className="px-3 py-2 text-right">Tara</th>
              <th className="px-3 py-2 text-right">Neto</th>
              {/* Columna Evidencia oculta temporalmente — lógica intacta */}
              {false && <th className="px-3 py-2">Evidencia</th>}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Cargando…</td></tr>}
            {!loading && filtrada.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">{q ? `Sin coincidencias para "${busqueda.trim()}".` : "Sin registros aún."}</td></tr>}
            {filtrada.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-3 py-2 whitespace-nowrap">{fechaCortoMX(p.fecha_hora_pesaje)} {horaMX(p.fecha_hora_pesaje)}</td>
                <td className="px-3 py-2">{p.maquina_codigo}</td>
                <td className="px-3 py-2 font-medium">{p.numero_rollo}</td>
                <td className="px-3 py-2">{p.numero_orden ?? "—"}</td>
                <td className="px-3 py-2 text-right">{Number(p.peso_bruto_kg).toFixed(2)}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{Number(p.peso_eje_kg ?? taraPorMaquina(p.maquina_codigo)).toFixed(2)}</td>
                <td className="px-3 py-2 text-right font-semibold text-amber-700">{Number(p.peso_neto_kg).toFixed(2)}</td>
                {/* Celda Evidencia oculta — se preserva evidencia_path en BD */}
                {false && (
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
                )}
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
